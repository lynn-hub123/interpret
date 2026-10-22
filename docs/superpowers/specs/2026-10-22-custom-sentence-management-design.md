# 自定义句管理设计

> 状态：待用户审阅 | 日期：2026-10-22 | 前置规格：`2026-10-14-interpret-practice-design.md`、`2026-10-16-audio-features-design.md`、`2026-10-21-retell-mode-design.md`（既定硬约束全部继承）

## 1. 背景与目标

粘贴进来的自定义句目前只进不出：`custom.v1` 只有「追加」，没有任何查看、删除入口。贴多了句子会永久混在抽句池里随机出现，无法清理。

本设计补上最小闭环：**在粘贴页内嵌一块可折叠的「已保存 N 句」区域，支持单条删除与批量多选删除，删除后可撤销。**

不做的事（YAGNI）：编辑句子内容、置顶、按句定向练习、单独的管理页/新 tab、给自定义句补参考译文。

## 2. 入口与交互

入口固定在粘贴页（`PasteView`）「开始练习」按钮下方，不新增 tab、不改路由。

### 2.1 折叠区（收起态）

```
粘贴开练
随手贴一段文字，自动拆句立刻练
[ textarea ]
3 句待练
[ 开始练习 ]

┌──────────────────────────────┐
│ 已保存 12 句              ⌄  │
└──────────────────────────────┘
```

- N = 0 时整块不渲染（零句不占位）
- 整行可点，点击展开；展开后箭头变 ⌃

### 2.2 列表（展开态 · 浏览模式）

```
┌──────────────────────────────┐
│ 已保存 12 句   [管理]     ⌃  │
│ ┌──────────────────────────┐ │
│ │ 今天天气很好，适合出门走走。       │
│ │ 中 · 已练 3 次            ✕ │
│ ├──────────────────────────┤ │
│ │ The meeting will start at 9.    │
│ │ 英 · 未练                 ✕ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

- 排序固定为**新增倒序**（最近贴的在最上），不提供排序切换
- 每条：原文（正常换行，最多显示 3 行，超出省略）+ 元信息行（`中`/`英` · `已练 N 次` 或 `未练`）+ 右侧删除按钮
- 语言标签由句子实际内容判定（`item.zh` 非空即「中」，否则「英」），不依赖 direction
- 列表区 `max-height: 40dvh` 内部滚动，不撑长页面
- 视觉沿用现有 neumorphic 变量：容器 `neu-inset`，条目分隔用 `--border` 细线，删除按钮无底色只用 `--text-muted`

### 2.3 多选（管理）模式

点「管理」进入：

```
┌──────────────────────────────┐
│ 已保存 12 句   全选   [完成]  │
│ ☐ 今天天气很好，适合出门走走。      │
│   中 · 已练 3 次                 │
│ ☑ The meeting will start at 9.  │
│   英 · 未练                      │
│ ┌──────────────────────────┐ │
│ │      删除所选（1）         │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

- 管理态下每行左侧出现复选框，行点击即切换选中（删除按钮隐藏）
- 「全选」点击后切换为「取消全选」
- 「完成」退出管理态并清空选中
- 底部「删除所选（N）」在 N=0 时禁用（`opacity: .4`）

### 2.4 删除与撤销

- 单条删除或批量删除都**立即生效，不做确认弹窗**
- 删除后底部浮出轻提示条（位于 TabBar 上方 `bottom: 88px`，圆角胶囊，`--surface` 底 + `--text` 文字）：「已删除 2 句 · 撤销」，**6 秒**后自动消失
- 点「撤销」按**原始索引**恢复（批量恢复时按索引升序插回，保证位置不错乱）
- 再次删除会替换掉上一条撤销提示（不排队）

选择撤销而不是确认弹窗，是为了保持「不打扰」的调性；6 秒足够手滑挽回。

## 3. 数据语义

**只把句子移出练习池，历史记录与复习进度一律不动。**

- `custom.v1` 数组里删掉对应元素 → 该句从 `getCustomSentences()` 消失 → 抽句池与 `dueQueue(pool)` 自然不再包含它
- `records.v1` 保留：`累计句数`、`连续天数` 不回退
- `srs.v1` 保留孤立条目：不影响调度（`dueQueue` 以 pool 为准，池外 id 不会被抽出），单条仅数十字节，不清理
- 本轮练习浮层（`SessionHistory`）用的是内存中的完整句子对象，删除不影响当前会话展示

## 4. 模块改动

### 4.1 `src/lib/sentences.js`（新增两个纯函数）

```js
// 批量移除自定义句；返回被删条目及其原始索引，供撤销按位恢复
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

// 按原始索引恢复（升序插回）；已在列表中的 id 跳过，防重复
export function restoreCustomSentences(entries) {
  const list = getCustomSentences()
  const exist = new Set(list.map(s => s.id))
  const sorted = [...entries].filter(e => !exist.has(e.item.id)).sort((a, b) => a.index - b.index)
  let next = [...list]
  for (const e of sorted) next.splice(Math.min(e.index, next.length), 0, e.item)
  return save('custom.v1', next)
}
```

### 4.2 `src/lib/records.js`（新增一个纯函数）

```js
// 按句子聚合练习次数与最近练习时间，供自定义句列表展示
export function practiceCounts() {
  const counts = {}
  for (const r of getRecords()) {
    const c = counts[r.sentenceId] ??= { count: 0, lastTs: 0 }
    c.count += 1
    if (r.ts > c.lastTs) c.lastTs = r.ts
  }
  return counts
}
```

### 4.3 `src/views/PasteView.vue`

新增折叠区 + 列表 + 管理态 + 撤销提示。视图层只做编排，删除/恢复逻辑全部走上面的 lib 函数。

组件内状态：

```js
const list = ref(getCustomSentences())          // 展示用快照，删除/恢复后同步刷新
const expanded = ref(false)
const managing = ref(false)
const selected = ref(new Set())                 // 管理态选中 id
const lastRemoved = ref(null)                   // { entries } 供撤销
const undoVisible = ref(false)
let undoTimer = null
const counts = ref(practiceCounts())
```

- 每次删除后 `counts.value = practiceCounts()` 不必要（次数不会变），仅在展开时读一次即可
- `addCustomSentences` 成功后同步刷新 `list.value = getCustomSentences()`，并默认展开一次以便用户确认（可选，实现时保持不自动展开亦可——按「不打扰」原则**不自动展开**）
- 组件卸载时 `clearTimeout(undoTimer)`
- 删除失败（`persisted === false`）时显示「删除未保存：存储不可用」，列表不变

### 4.4 零改动

`picker.js`、`srs.js`、`PracticeView.vue`、`PracticeCard.vue`、`storage.js` 导出/导入、`MeView.vue` 全部不动。

## 5. 边界与错误处理

| 情形 | 行为 |
|---|---|
| 没有自定义句 | 折叠区整块不渲染 |
| 全部删除 | 折叠区消失，页面回到纯粘贴态 |
| 撤销时该句已被重新粘贴（id 相同）| 跳过该条，不重复插入 |
| 存储不可用（隐私模式）| 删除提示「删除未保存：存储不可用」，列表保持原样 |
| 管理态下切换 tab 再回来 | 组件重挂载，状态自然重置 |
| 句子超长 | 原文最多 3 行，超出省略号 |

## 6. 测试策略

单测（Vitest + happy-dom）：

- `sentences.test.js`
  - `removeCustomSentences` 删除指定 id，返回 `removed` 含原始 index 与 item，其余句子顺序不变
  - 传不存在的 id → `removed` 为空且不写存储
  - 批量删除多个 → `removed` 长度为 2 且索引正确
  - `restoreCustomSentences` 按索引插回，顺序与删除前完全一致
  - 恢复时遇到已存在 id 跳过
  - 恢复索引越界 → 追加到末尾不报错
- `records.test.js`
  - `practiceCounts` 按句子聚合次数、`lastTs` 取最大值
  - 空记录 → 空对象
- `PasteView.test.js`（新建）
  - 无自定义句时折叠区不渲染
  - 有句子时显示「已保存 N 句」，点击展开出现列表项
  - 条目显示原文、语言标签、`已练 N 次`/`未练`
  - 单条删除后条目消失并出现撤销提示；点撤销后按原位置恢复
  - 「管理」进入多选态，全选/取消全选、删除所选（N）按钮禁用态、批量删除生效
  - 撤销提示 6 秒后消失（用 `vi.useFakeTimers`）

手工验收：真机折叠/展开手感、长句换行省略、撤销提示不遮挡 TabBar。

## 7. 兼容性

- `custom.v1` 结构完全不变（仍是数组），旧备份导入导出不受影响
- 不新增 storage key
- 删除仅影响后续抽句，不回溯修改任何历史数据
