# 自定义句管理实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在粘贴页内嵌「已保存 N 句」折叠列表，支持单条删除、批量多选删除、6 秒撤销。

**Architecture:** 数据层新增 3 个纯函数（`removeCustomSentences` / `restoreCustomSentences` / `practiceCounts`），视图层 PasteView 只做编排。删除仅操作 `custom.v1` 数组，历史记录与 SRS 进度零改动。

**Tech Stack:** Vue 3 + Vitest(happy-dom)。TDD，每任务独立提交。

**规格：** `docs/superpowers/specs/2026-10-22-custom-sentence-management-design.md`（已批准）

**环境注意（PowerShell 5）：** 多命令用 `;` 分隔；npm 用 `npm.cmd`；改完 `.vue` 必须 `git diff` 核验落盘。

---

### Task 1: sentences.js 删除与恢复纯函数

**Files:**
- Modify: `src/lib/sentences.js:67-70`（文件末尾追加两个函数，并在测试文件 import 行补名）
- Test: `src/lib/sentences.test.js`

- [ ] **Step 1: 写失败测试**

把 `src/lib/sentences.test.js` 顶部 import 改为：

```js
import { TOPICS, allBuiltinSentences, splitPasteText, detectLang, addCustomSentences, getCustomSentences, sentenceById, removeCustomSentences, restoreCustomSentences } from './sentences.js'
```

在文件末尾追加：

```js
describe('removeCustomSentences', () => {
  const seed = () => {
    addCustomSentences(['第一句。', '第二句。', '第三句。'])
    return getCustomSentences()
  }

  it('removes target and reports original index, keeping order of the rest', () => {
    const list = seed()
    const { removed, persisted } = removeCustomSentences([list[1].id])
    expect(persisted).toBe(true)
    expect(removed).toHaveLength(1)
    expect(removed[0]).toEqual({ index: 1, item: list[1] })
    expect(getCustomSentences().map(s => s.zh)).toEqual(['第一句。', '第三句。'])
  })

  it('removes multiple ids in one pass', () => {
    const list = seed()
    const { removed } = removeCustomSentences([list[0].id, list[2].id])
    expect(removed.map(r => r.index)).toEqual([0, 2])
    expect(getCustomSentences().map(s => s.zh)).toEqual(['第二句。'])
  })

  it('is a no-op for unknown ids and does not write storage', () => {
    const list = seed()
    const { removed, persisted } = removeCustomSentences(['nope'])
    expect(removed).toEqual([])
    expect(persisted).toBe(true)
    expect(getCustomSentences()).toHaveLength(list.length)
  })
})

describe('restoreCustomSentences', () => {
  it('restores at original indices so order matches pre-delete state', () => {
    addCustomSentences(['甲。', '乙。', '丙。'])
    const before = getCustomSentences()
    const { removed } = removeCustomSentences([before[0].id, before[2].id])
    restoreCustomSentences(removed)
    expect(getCustomSentences().map(s => s.zh)).toEqual(['甲。', '乙。', '丙。'])
  })

  it('skips entries whose id already exists', () => {
    addCustomSentences(['甲。'])
    const one = getCustomSentences()[0]
    restoreCustomSentences([{ index: 0, item: one }])
    expect(getCustomSentences()).toHaveLength(1)
  })

  it('clamps out-of-range index to the tail', () => {
    addCustomSentences(['甲。'])
    const one = getCustomSentences()[0]
    removeCustomSentences([one.id])
    restoreCustomSentences([{ index: 99, item: one }])
    expect(getCustomSentences().map(s => s.zh)).toEqual(['甲。'])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm.cmd test -- src/lib/sentences.test.js`
Expected: FAIL — `removeCustomSentences is not a function`

- [ ] **Step 3: 最小实现**

在 `src/lib/sentences.js` 末尾（`getCustomSentences` 之后）追加：

```js
// 批量移除自定义句；返回被删条目及原始索引，供撤销按位恢复
export function removeCustomSentences(ids) {
  const list = getCustomSentences()
  const idSet = new Set(ids)
  const removed = []
  const kept = []
  list.forEach((s, index) => {
    if (idSet.has(s.id)) removed.push({ index, item: s })
    else kept.push(s)
  })
  if (removed.length === 0) return { removed: [], persisted: true }
  return { removed, persisted: save('custom.v1', kept) }
}

// 按原始索引升序插回；已存在的 id 跳过，防撤销时重复插入
export function restoreCustomSentences(entries) {
  const list = getCustomSentences()
  const exist = new Set(list.map(s => s.id))
  const sorted = entries.filter(e => !exist.has(e.item.id)).sort((a, b) => a.index - b.index)
  const next = [...list]
  for (const e of sorted) next.splice(Math.min(e.index, next.length), 0, e.item)
  return save('custom.v1', next)
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm.cmd test -- src/lib/sentences.test.js`
Expected: PASS（既有 11 用例 + 新 6 用例）

- [ ] **Step 5: 提交**

```bash
git add src/lib/sentences.js src/lib/sentences.test.js
git commit -m "feat: remove and restore custom sentences"
```

---

### Task 2: records.practiceCounts

**Files:**
- Modify: `src/lib/records.js`（末尾追加）
- Test: `src/lib/records.test.js`

- [ ] **Step 1: 写失败测试**

`src/lib/records.test.js` 顶部 import 改为：

```js
import { addRecord, getRecords, stats, practiceCounts } from './records.js'
```

文件末尾追加：

```js
describe('practiceCounts', () => {
  it('aggregates count and latest ts per sentence', () => {
    save('records.v1', [
      { id: 'r1', sentenceId: 'c_1', direction: 'zh2en', rating: 'ok', ts: now - 2 * day },
      { id: 'r2', sentenceId: 'c_1', direction: 'zh2en', rating: 'shaky', ts: now },
      { id: 'r3', sentenceId: 'c_2', direction: 'en2zh', rating: 'miss', ts: now - day }
    ])
    const counts = practiceCounts()
    expect(counts.c_1).toEqual({ count: 2, lastTs: now })
    expect(counts.c_2).toEqual({ count: 1, lastTs: now - day })
  })
  it('returns empty object with no records', () => {
    expect(practiceCounts()).toEqual({})
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm.cmd test -- src/lib/records.test.js`
Expected: FAIL — `practiceCounts is not a function`

- [ ] **Step 3: 最小实现**

`src/lib/records.js` 末尾追加：

```js
// 按句子聚合练习次数与最近练习时间，供自定义句列表展示
export function practiceCounts() {
  const counts = {}
  for (const r of getRecords()) {
    const c = (counts[r.sentenceId] ??= { count: 0, lastTs: 0 })
    c.count += 1
    if (r.ts > c.lastTs) c.lastTs = r.ts
  }
  return counts
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm.cmd test -- src/lib/records.test.js`
Expected: PASS（既有 4 用例 + 新 2 用例）

- [ ] **Step 5: 提交**

```bash
git add src/lib/records.js src/lib/records.test.js
git commit -m "feat: aggregate practice counts per sentence"
```

---

### Task 3: PasteView 折叠列表与删除交互

**Files:**
- Modify: `src/views/PasteView.vue`（template 追加 + script 扩展 + style 追加）
- Test: Create `src/views/PasteView.test.js`

- [ ] **Step 1: 写失败测试（新建文件）**

`src/views/PasteView.test.js` 全文：

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PasteView from './PasteView.vue'
import { save } from '../lib/storage.js'

function seedSentences() {
  save('custom.v1', [
    { id: 'c_1', zh: '第一句。', en: '', topic: 'paste', source: 'custom' },
    { id: 'c_2', zh: '', en: 'Second one.', topic: 'paste', source: 'custom' }
  ])
}

function mountView() {
  return mount(PasteView)
}

beforeEach(() => { localStorage.clear() })
afterEach(() => { vi.useRealTimers() })

describe('custom sentence panel', () => {
  it('does not render when there are no custom sentences', () => {
    const w = mountView()
    expect(w.find('.saved').exists()).toBe(false)
  })

  it('shows count and stays collapsed until clicked', async () => {
    seedSentences()
    const w = mountView()
    expect(w.find('.saved-head').text()).toContain('已保存 2 句')
    expect(w.find('.saved-list').exists()).toBe(false)
    await w.find('.saved-head').trigger('click')
    expect(w.findAll('.saved-item')).toHaveLength(2)
  })

  it('renders newest first with language tag and practice count', async () => {
    seedSentences()
    save('records.v1', [
      { id: 'r1', sentenceId: 'c_1', direction: 'zh2en', rating: 'ok', ts: 1 },
      { id: 'r2', sentenceId: 'c_1', direction: 'zh2en', rating: 'ok', ts: 2 }
    ])
    const w = mountView()
    await w.find('.saved-head').trigger('click')
    const items = w.findAll('.saved-item')
    expect(items[0].text()).toContain('Second one.')
    expect(items[0].text()).toContain('英')
    expect(items[0].text()).toContain('未练')
    expect(items[1].text()).toContain('第一句。')
    expect(items[1].text()).toContain('中')
    expect(items[1].text()).toContain('已练 2 次')
  })

  it('deletes one item and restores it via undo', async () => {
    seedSentences()
    const w = mountView()
    await w.find('.saved-head').trigger('click')
    await w.findAll('.btn-remove')[0].trigger('click')
    expect(w.findAll('.saved-item')).toHaveLength(1)
    expect(w.find('.undo-bar').exists()).toBe(true)
    await w.find('.undo-btn').trigger('click')
    expect(w.findAll('.saved-item')).toHaveLength(2)
    expect(w.findAll('.saved-item')[0].text()).toContain('Second one.')
    expect(w.find('.undo-bar').exists()).toBe(false)
  })

  it('batch deletes selected items in manage mode', async () => {
    seedSentences()
    const w = mountView()
    await w.find('.saved-head').trigger('click')
    await w.find('.btn-tool.manage').trigger('click')
    expect(w.findAll('.check')).toHaveLength(2)
    await w.findAll('.saved-main')[0].trigger('click')
    expect(w.findAll('.check.on')).toHaveLength(1)
    expect(w.find('.btn-del').text()).toContain('删除所选（1）')
    await w.find('.btn-del').trigger('click')
    expect(w.findAll('.saved-item')).toHaveLength(1)
    expect(w.find('.undo-bar').exists()).toBe(true)
  })

  it('select-all toggles every visible item', async () => {
    seedSentences()
    const w = mountView()
    await w.find('.saved-head').trigger('click')
    await w.find('.btn-tool.manage').trigger('click')
    await w.find('.btn-tool.all').trigger('click')
    expect(w.findAll('.check.on')).toHaveLength(2)
    expect(w.find('.btn-del').text()).toContain('删除所选（2）')
    await w.find('.btn-tool.all').trigger('click')
    expect(w.findAll('.check.on')).toHaveLength(0)
    expect(w.find('.btn-del').attributes('disabled')).toBeDefined()
  })

  it('hides the panel entirely after deleting everything', async () => {
    seedSentences()
    const w = mountView()
    await w.find('.saved-head').trigger('click')
    await w.find('.btn-tool.manage').trigger('click')
    await w.find('.btn-tool.all').trigger('click')
    await w.find('.btn-del').trigger('click')
    expect(w.find('.saved').exists()).toBe(false)
  })

  it('undo bar auto-hides after 6 seconds', async () => {
    vi.useFakeTimers()
    seedSentences()
    const w = mountView()
    await w.find('.saved-head').trigger('click')
    await w.findAll('.btn-remove')[0].trigger('click')
    expect(w.find('.undo-bar').exists()).toBe(true)
    vi.advanceTimersByTime(6000)
    await w.vm.$nextTick()
    expect(w.find('.undo-bar').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm.cmd test -- src/views/PasteView.test.js`
Expected: FAIL — `.saved` 不存在

- [ ] **Step 3: 实现 template**

在 `src/views/PasteView.vue` 的「开始练习」按钮之后、`</main>` 之前插入：

```html
    <p v-if="dataMsg" class="error">{{ dataMsg }}</p>

    <div v-if="customList.length" class="saved neu-raised">
      <button class="saved-head" @click="toggleExpand">
        <span>已保存 {{ customList.length }} 句</span>
        <span class="saved-arrow">{{ expanded ? '⌃' : '⌄' }}</span>
      </button>
      <div v-if="expanded" class="saved-body">
        <div class="saved-tools">
          <button v-if="managing" class="btn-tool all" @click="toggleAll">{{ allSelected ? '取消全选' : '全选' }}</button>
          <button class="btn-tool manage" @click="toggleManaging">{{ managing ? '完成' : '管理' }}</button>
        </div>
        <ul class="saved-list neu-inset">
          <li v-for="s in shown" :key="s.id" class="saved-item">
            <div class="saved-main" :class="{ pick: managing }" @click="managing && toggleSelect(s.id)">
              <span v-if="managing" class="check" :class="{ on: selected.includes(s.id) }"></span>
              <span class="saved-info">
                <span class="saved-text">{{ textOf(s) }}</span>
                <span class="saved-meta">{{ langOf(s) }} · {{ countOf(s.id) ? `已练 ${countOf(s.id)} 次` : '未练' }}</span>
              </span>
            </div>
            <button v-if="!managing" class="btn-remove" title="删除" @click="removeOne(s.id)">✕</button>
          </li>
        </ul>
        <button v-if="managing" class="btn btn-del" :disabled="!selected.length" @click="removeSelected">删除所选（{{ selected.length }}）</button>
      </div>
    </div>

    <div v-if="undoVisible" class="undo-bar">
      <span>{{ undoMsg }}</span>
      <button class="undo-btn" @click="undo">撤销</button>
    </div>
```

- [ ] **Step 4: 实现 script**

`src/views/PasteView.vue` 的 script setup 整体替换为：

```js
import { computed, onUnmounted, ref } from 'vue'
import { splitPasteText, addCustomSentences, getCustomSentences, removeCustomSentences, restoreCustomSentences } from '../lib/sentences.js'
import { practiceCounts } from '../lib/records.js'

const text = ref('')
const error = ref('')
const sentences = computed(() => splitPasteText(text.value))

const customList = ref(getCustomSentences())
const expanded = ref(false)
const managing = ref(false)
const selected = ref([])
const counts = ref({})
const dataMsg = ref('')
const undoState = ref(null)
const undoVisible = ref(false)
const undoMsg = ref('')
const UNDO_MS = 6000
let undoTimer = null

const shown = computed(() => [...customList.value].reverse())
const allSelected = computed(() => shown.value.length > 0 && selected.value.length === shown.value.length)

const textOf = s => s.zh || s.en
const langOf = s => (s.zh ? '中' : '英')
const countOf = id => counts.value[id]?.count || 0

function toggleExpand() {
  expanded.value = !expanded.value
  if (!expanded.value) {
    managing.value = false
    selected.value = []
  } else {
    counts.value = practiceCounts()
  }
}

function toggleManaging() {
  managing.value = !managing.value
  selected.value = []
}

function toggleSelect(id) {
  selected.value = selected.value.includes(id)
    ? selected.value.filter(x => x !== id)
    : [...selected.value, id]
}

function toggleAll() {
  selected.value = allSelected.value ? [] : shown.value.map(s => s.id)
}

function showUndo(removed) {
  clearTimeout(undoTimer)
  undoState.value = removed
  undoMsg.value = `已删除 ${removed.length} 句`
  undoVisible.value = true
  undoTimer = setTimeout(() => {
    undoVisible.value = false
    undoState.value = null
  }, UNDO_MS)
}

function removeOne(id) {
  const { removed, persisted } = removeCustomSentences([id])
  if (removed.length === 0) return
  if (!persisted) {
    dataMsg.value = '删除未保存：存储不可用'
    return
  }
  dataMsg.value = ''
  customList.value = getCustomSentences()
  showUndo(removed)
}

function removeSelected() {
  if (!selected.value.length) return
  const { removed, persisted } = removeCustomSentences(selected.value)
  if (!persisted) {
    dataMsg.value = '删除未保存：存储不可用'
    return
  }
  dataMsg.value = ''
  customList.value = getCustomSentences()
  selected.value = []
  managing.value = false
  if (removed.length) showUndo(removed)
}

function undo() {
  if (!undoState.value) return
  restoreCustomSentences(undoState.value)
  customList.value = getCustomSentences()
  clearTimeout(undoTimer)
  undoVisible.value = false
  undoState.value = null
}

onUnmounted(() => clearTimeout(undoTimer))

function start() {
  if (sentences.value.length === 0) { error.value = '没有拆出可练的句子，检查一下内容'; return }
  error.value = ''
  const r = addCustomSentences(sentences.value)
  customList.value = getCustomSentences()
  sessionStorage.setItem('interpret.session', JSON.stringify({ mode: 'paste', persistWarn: !r.persisted }))
  location.hash = '#/'
}
```

- [ ] **Step 5: 实现 style**

在 `<style scoped>` 末尾追加：

```css
.saved { margin-top: 16px; padding: 6px; }
.saved-head {
  width: 100%; display: flex; justify-content: space-between; align-items: center;
  background: none; border: none; color: var(--text); font: inherit; font-size: 14px;
  padding: 10px 12px; cursor: pointer; border-radius: 12px;
}
.saved-arrow { color: var(--text-muted); font-size: 13px; }
.saved-body { padding: 0 6px 6px; }
.saved-tools { display: flex; justify-content: flex-end; gap: 4px; margin-bottom: 8px; }
.btn-tool { border: none; background: none; color: var(--accent-text); font: inherit; font-size: 13px; padding: 4px 8px; cursor: pointer; border-radius: 8px; }
.saved-list { list-style: none; margin: 0; padding: 4px; max-height: 40dvh; overflow-y: auto; }
.saved-item { display: flex; align-items: center; gap: 8px; padding: 10px 8px; border-bottom: 1px solid var(--border); }
.saved-item:last-child { border-bottom: none; }
.saved-main { flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; }
.saved-main.pick { cursor: pointer; }
.saved-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.saved-text {
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
  font-size: 14px; line-height: 1.5;
}
.saved-meta { font-size: 12px; color: var(--text-muted); }
.check {
  width: 18px; height: 18px; border-radius: 6px; box-shadow: var(--shadow-in); flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; font-size: 11px; color: var(--accent-text);
}
.check.on::after { content: '✓'; }
.btn-remove { border: none; background: none; color: var(--text-muted); font-size: 14px; padding: 6px 8px; cursor: pointer; border-radius: 8px; }
.btn-del { width: 100%; margin-top: 10px; color: #e8463a; font-size: 14px; }
.btn-del:disabled { opacity: 0.4; }
.undo-bar {
  position: fixed; left: 50%; transform: translateX(-50%); bottom: 88px; z-index: 20;
  display: flex; align-items: center; gap: 14px;
  background: var(--surface); border-radius: 999px; padding: 10px 18px;
  box-shadow: var(--shadow-out); font-size: 14px;
}
.undo-btn { border: none; background: none; color: var(--accent-text); font: inherit; font-size: 14px; padding: 0; cursor: pointer; }
```

- [ ] **Step 6: 运行测试 + git diff 核验**

Run: `npm.cmd test -- src/views/PasteView.test.js`
Expected: PASS（8 用例）

Run: `git diff src/views/PasteView.vue`
Expected: 确认上述 template/script/style 全部落盘

- [ ] **Step 7: 提交**

```bash
git add src/views/PasteView.vue src/views/PasteView.test.js
git commit -m "feat: custom sentence panel with batch delete and undo"
```

---

### Task 4: 全量回归 + 构建 + 部署

**Files:** 无代码改动

- [ ] **Step 1: 全量测试**

Run: `npm.cmd test`
Expected: 全绿（227 + 16 = 243 预期）

- [ ] **Step 2: 构建**

Run: `npm.cmd run build`
Expected: 构建成功无报错

- [ ] **Step 3: 推送**

```bash
git push
```

（若报代理错误：`git -c http.https://github.com.proxy= push`）

- [ ] **Step 4: 线上验证**

等 CI 完成后抓 `https://lynn-hub123.github.io/interpret/sw.js`，取新 `index-*.js` 哈希，在该 bundle 里搜特征串 `删除所选` 与 `已保存`。
Expected: 两个串均命中

- [ ] **Step 5: 真机验收清单（转告用户）**

1. 粘贴几句后回粘贴页，出现「已保存 N 句」
2. 展开列表，条目显示原文 / 中英标签 / 已练次数
3. 单条 ✕ 删除 → 底部出现撤销条 → 6 秒内点撤销能原样恢复
4. 「管理」→ 全选 → 批量删除，撤销后顺序不乱
5. 删光后折叠区消失
6. 撤销条不遮挡底部 TabBar

---

## Self-Review 记录

1. **规格覆盖**：§2.1 收起态→T3（无句不渲染/计数/折叠）；§2.2 列表→T3（倒序/语言/次数/3 行省略/40dvh）；§2.3 多选→T3（复选框/全选/完成/禁用态）；§2.4 删除撤销→T3（即时生效/6 秒/按位恢复）；§3 数据语义→T1（只动 custom.v1）；§4.1→T1；§4.2→T2；§4.3→T3；§4.4 零改动（无任务，正确）；§5 边界→T1+T3（未知 id/重复恢复/越界/全删/存储失败）；§6→T1-T3 测试 + T4 手工清单；§7 兼容→T1 不改结构。
2. **占位符扫描**：无 TBD/TODO/「适当处理」。
3. **类型一致性**：`removeCustomSentences` 返回 `{ removed: [{index, item}], persisted }`，T3 与 T1 一致；`restoreCustomSentences(entries)` 入参同形；`practiceCounts()` 返回 `{ [id]: {count, lastTs} }`，T3 的 `counts.value[id]?.count` 一致；CSS 类名 `.saved-main.pick`、`.btn-tool.all/.manage`、`.check.on`、`.btn-del`、`.undo-bar`、`.btn-remove` 在测试选择器与模板中一一对应。
