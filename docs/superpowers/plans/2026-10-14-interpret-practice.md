# Interpret（口译随手练）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个"随时来一句"的视译练习 PWA：打开即抽句口头翻译，两次点击完成一轮，零压力保持翻译敏感度。

**Architecture:** 纯前端静态站（Vite + Vue 3 SPA + vite-plugin-pwa），所有用户数据存 localStorage 并封装为独立 storage 模块（未来可换实现）。抽卡翻转练习流为核心，弱句按 30% 概率混入抽句实现零压力复习。

**Tech Stack:** Vue 3（`<script setup>`）、vue-router（hash 模式）、Vite 6、Vitest + happy-dom、@vue/test-utils、vite-plugin-pwa。

**规格文档:** `docs/superpowers/specs/2026-10-14-interpret-practice-design.md`

**环境备忘（Windows）:**
- git 在 `C:\Program Files\Git\bin`（老终端 PATH 未刷新时，命令前加 `$env:Path += ';C:\Program Files\Git\bin';`）
- 无 Node.js，Task 0 先装
- 一律用 PowerShell 语法；git 提交消息用多个 `-m` 参数（PowerShell 不支持 heredoc）

---

### Task 0: 安装 Node.js

- [ ] **Step 1: 用 winget 安装 Node.js LTS**

```powershell
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
```

预期输出含 `已成功安装`。

- [ ] **Step 2: 验证（新开的 shell 进程才拿得到新 PATH）**

```powershell
& "C:\Program Files\nodejs\node.exe" --version; & "C:\Program Files\nodejs\npm.cmd" --version
```

预期：输出 v22.x 与 10.x。若路径不存在，用 `winget list OpenJS.NodeJS.LTS` 排查实际安装路径并在后续所有命令中把 `C:\Program Files\nodejs` 加入 `$env:Path`。

---

### Task 1: 项目骨架

**Files:**
- Create: `package.json`, `vite.config.js`, `index.html`, `src/main.js`, `src/App.vue`, `src/router.js`, `src/views/PracticeView.vue`, `src/views/LibraryView.vue`, `src/views/PasteView.vue`, `src/views/ReviewView.vue`, `src/views/MeView.vue`, `src/components/TabBar.vue`

- [ ] **Step 1: 写 package.json**

```json
{
  "name": "interpret",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "vue": "^3.5.13",
    "vue-router": "^4.5.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.2.1",
    "@vue/test-utils": "^2.4.0",
    "happy-dom": "^15.11.7",
    "vite": "^6.0.0",
    "vite-plugin-pwa": "^0.21.1",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: 安装依赖**

```powershell
npm install
```

预期：无 peer 冲突错误。若有，按 npm 提示对齐版本后重跑。

- [ ] **Step 3: 写 vite.config.js**

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/interpret/',
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    globals: false
  }
})
```

- [ ] **Step 4: 写 index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>口译随手练</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

- [ ] **Step 5: 写 src/main.js、src/router.js、src/App.vue、TabBar 与 5 个占位 view**

`src/main.js`:

```js
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router.js'
import './styles/main.css'

createApp(App).use(router).mount('#app')
```

`src/router.js`:

```js
import { createRouter, createWebHashHistory } from 'vue-router'
import PracticeView from './views/PracticeView.vue'
import LibraryView from './views/LibraryView.vue'
import PasteView from './views/PasteView.vue'
import ReviewView from './views/ReviewView.vue'
import MeView from './views/MeView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'practice', component: PracticeView },
    { path: '/library', name: 'library', component: LibraryView },
    { path: '/paste', name: 'paste', component: PasteView },
    { path: '/review', name: 'review', component: ReviewView },
    { path: '/me', name: 'me', component: MeView }
  ]
})
```

`src/App.vue`:

```vue
<template>
  <div class="app-shell">
    <router-view />
    <TabBar />
  </div>
</template>

<script setup>
import TabBar from './components/TabBar.vue'
</script>
```

`src/components/TabBar.vue`:

```vue
<template>
  <nav class="tab-bar neu-raised">
    <router-link v-for="t in tabs" :key="t.to" :to="t.to" class="tab-item">
      <span class="tab-icon">{{ t.icon }}</span>
      <span class="tab-label">{{ t.label }}</span>
    </router-link>
  </nav>
</template>

<script setup>
const tabs = [
  { to: '/', icon: '🎴', label: '练习' },
  { to: '/library', icon: '📚', label: '题库' },
  { to: '/paste', icon: '📋', label: '粘贴' },
  { to: '/review', icon: '🔁', label: '复习' },
  { to: '/me', icon: '🙂', label: '我的' }
]
</script>
```

5 个占位 view 均为同一模板（替换名称即可，后续任务逐个充实），以 `src/views/PracticeView.vue` 为例：

```vue
<template>
  <main class="view"><p class="placeholder">练习页 · 待实现</p></main>
</template>
```

- [ ] **Step 6: 写最小样式占位 src/styles/main.css（Task 2 再充实）**

```css
:root[data-theme='dark'] { --bg: #1c1c1f; --text: #e7e7ea; }
:root[data-theme='light'] { --bg: #eceef1; --text: #26282c; }
body { margin: 0; background: var(--bg); color: var(--text); font-family: system-ui, 'PingFang SC', 'Segoe UI', sans-serif; }
.view { max-width: 480px; margin: 0 auto; padding: 16px 16px 88px; }
.tab-bar { position: fixed; left: 0; right: 0; bottom: 0; display: flex; justify-content: space-around; padding: 8px 0 calc(8px + env(safe-area-inset-bottom)); }
.tab-item { display: flex; flex-direction: column; align-items: center; gap: 2px; text-decoration: none; color: inherit; font-size: 12px; }
.tab-icon { font-size: 20px; }
.placeholder { opacity: 0.5; }
```

- [ ] **Step 7: 构建验证**

```powershell
npm run build
```

预期：`✓ built`，产物在 `dist/`。

- [ ] **Step 8: Commit**

```powershell
$env:Path += ';C:\Program Files\Git\bin'; git add package.json package-lock.json vite.config.js index.html src; git commit -m "chore: scaffold Vite + Vue 3 SPA skeleton with router and tab bar"
```

---

### Task 2: 主题样式（深色拟物默认 + 亮色切换）

**Files:**
- Modify: `src/styles/main.css`

- [ ] **Step 1: 用以下完整内容替换 main.css**

核心 tokens + 拟物（neumorphic）明暗双套：深色为默认，`html[data-theme='light']` 整套覆盖。

```css
:root[data-theme='dark'] {
  --bg: #1c1c1f;
  --surface: #232327;
  --surface-deep: #17171a;
  --text: #e7e7ea;
  --text-muted: #9a9aa3;
  --border: rgba(231, 231, 234, 0.1);
  --accent: #32f08c;
  --accent-soft: rgba(50, 240, 140, 0.14);
  --accent-text: #b8ffd9;
  --shadow-out: 6px 6px 14px rgba(0, 0, 0, 0.55), -6px -6px 14px rgba(255, 255, 255, 0.045);
  --shadow-in: inset 4px 4px 8px rgba(0, 0, 0, 0.5), inset -4px -4px 8px rgba(255, 255, 255, 0.04);
  --radius-card: 16px;
  color-scheme: dark;
}
:root[data-theme='light'] {
  --bg: #eceef1;
  --surface: #f2f4f7;
  --surface-deep: #e3e6ea;
  --text: #26282c;
  --text-muted: #6b7078;
  --border: rgba(38, 40, 44, 0.12);
  --accent: #0ab861;
  --accent-soft: rgba(10, 184, 97, 0.12);
  --accent-text: #00632f;
  --shadow-out: 6px 6px 14px rgba(163, 172, 184, 0.6), -6px -6px 14px rgba(255, 255, 255, 0.95);
  --shadow-in: inset 4px 4px 8px rgba(163, 172, 184, 0.55), inset -4px -4px 8px rgba(255, 255, 255, 0.9);
  color-scheme: light;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font-family: system-ui, 'PingFang SC', 'Segoe UI', sans-serif;
  -webkit-tap-highlight-color: transparent;
}
.view { max-width: 480px; margin: 0 auto; padding: 16px 16px 96px; min-height: 100dvh; }
.neu-raised { background: var(--surface); border-radius: var(--radius-card); box-shadow: var(--shadow-out); }
.neu-inset { background: var(--surface-deep); border-radius: var(--radius-card); box-shadow: var(--shadow-in); }
.btn {
  border: none; cursor: pointer; color: var(--text); background: var(--surface);
  border-radius: 14px; padding: 12px 18px; font-size: 15px; box-shadow: var(--shadow-out);
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.btn:active { transform: scale(0.97); box-shadow: var(--shadow-in); }
.btn-primary { color: #062d18; background: var(--accent); }
.tab-bar {
  position: fixed; left: 12px; right: 12px; bottom: 12px;
  display: flex; justify-content: space-around; padding: 8px 4px calc(8px + env(safe-area-inset-bottom));
  border-radius: 20px;
}
.tab-item { display: flex; flex-direction: column; align-items: center; gap: 2px; text-decoration: none; color: var(--text-muted); font-size: 12px; padding: 4px 10px; border-radius: 12px; }
.tab-item.router-link-active { color: var(--accent-text); background: var(--accent-soft); }
.tab-icon { font-size: 20px; }
.placeholder { opacity: 0.5; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
```

- [ ] **Step 2: 手动验证**

```powershell
npm run dev
```

打开本地地址：深色拟物 TabBar 可见，点 Tab 切换路由无报错。`Ctrl+C` 退出。

- [ ] **Step 3: Commit**

```powershell
$env:Path += ';C:\Program Files\Git\bin'; git add src/styles/main.css; git commit -m "feat: dark neumorphic theme tokens with light mode override"
```

---

### Task 3: storage 模块（TDD）

**Files:**
- Create: `src/lib/storage.js`, `src/lib/storage.test.js`

- [ ] **Step 1: 写失败测试 src/lib/storage.test.js**

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { load, save, storageAvailable, exportAll, importAll } from './storage.js'

beforeEach(() => localStorage.clear())

describe('load/save', () => {
  it('saves and loads JSON values', () => {
    expect(save('k', { a: 1 })).toBe(true)
    expect(load('k', null)).toEqual({ a: 1 })
  })
  it('returns fallback when key missing', () => {
    expect(load('missing', 'fb')).toBe('fb')
  })
  it('backs up corrupted data and returns fallback', () => {
    localStorage.setItem('bad', '{oops')
    expect(load('bad', 'fb')).toBe('fb')
    expect(localStorage.getItem('bad.corrupt')).toBe('{oops')
  })
})

describe('storageAvailable', () => {
  it('reflects availability', () => {
    expect(storageAvailable()).toBe(true)
  })
})

describe('export/import', () => {
  it('round-trips all keys with interpret. prefix', () => {
    save('interpret.records.v1', [{ id: 1 }])
    save('other.key', 'keep-me-out')
    const dump = exportAll()
    expect(dump.records).toEqual([{ id: 1 }])
    localStorage.clear()
    importAll(dump)
    expect(load('interpret.records.v1', [])).toEqual([{ id: 1 }])
  })
  it('rejects invalid import payload', () => {
    expect(importAll('not json')).toBe(false)
    expect(importAll({ records: 42 })).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```powershell
npx vitest run src/lib/storage.test.js
```

预期：FAIL，`Cannot find module './storage.js'`。

- [ ] **Step 3: 实现 src/lib/storage.js**

```js
const PREFIX = 'interpret.'

export function storageAvailable() {
  try {
    const k = PREFIX + '__probe__'
    localStorage.setItem(k, '1')
    localStorage.removeItem(k)
    return true
  } catch {
    return false
  }
}

export function load(key, fallback) {
  const raw = localStorage.getItem(PREFIX + key)
  if (raw === null) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    try { localStorage.setItem(PREFIX + key + '.corrupt', raw) } catch { /* ignore */ }
    return fallback
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function exportAll() {
  const dump = { version: 1, exportedAt: new Date().toISOString(), records: [], custom: [], settings: null }
  dump.records = load('records.v1', [])
  dump.custom = load('custom.v1', [])
  dump.settings = load('settings.v1', null)
  return dump
}

function isValidDump(d) {
  return d && typeof d === 'object' && Array.isArray(d.records) && Array.isArray(d.custom)
}

export function importAll(payload) {
  let d = payload
  if (typeof payload === 'string') {
    try { d = JSON.parse(payload) } catch { return false }
  }
  if (!isValidDump(d)) return false
  save('records.v1', d.records)
  save('custom.v1', d.custom)
  if (d.settings) save('settings.v1', d.settings)
  return true
}
```

- [ ] **Step 4: 跑测试确认通过**

```powershell
npx vitest run src/lib/storage.test.js
```

预期：7 passed。

- [ ] **Step 5: Commit**

```powershell
$env:Path += ';C:\Program Files\Git\bin'; git add src/lib/storage.js src/lib/storage.test.js; git commit -m "feat: storage module with corruption backup, quota guard, export/import"
```

---

### Task 4: sentences 模块（TDD）

**Files:**
- Create: `src/lib/sentences.js`, `src/lib/sentences.test.js`, `src/data/library/daily.json`, `src/data/library/economy.json`

- [ ] **Step 1: 先建两个种子题库文件（各 3 句，Task 5 扩充到 8 主题 × 20+）**

`src/data/library/daily.json`:

```json
[
  { "id": "daily_001", "zh": "今天天气不错，我们去公园走走吧。", "en": "The weather is nice today. Let's take a walk in the park." },
  { "id": "daily_002", "zh": "这家餐厅的招牌菜是红烧肉。", "en": "The signature dish at this restaurant is braised pork." },
  { "id": "daily_003", "zh": "记得提前十分钟到会议室。", "en": "Remember to arrive at the meeting room ten minutes early." }
]
```

`src/data/library/economy.json`:

```json
[
  { "id": "economy_001", "zh": "全球经济正在缓慢复苏。", "en": "The global economy is recovering slowly." },
  { "id": "economy_002", "zh": "通货膨胀率已连续三个月回落。", "en": "The inflation rate has fallen for three consecutive months." },
  { "id": "economy_003", "zh": "中小企业是就业的主要来源。", "en": "Small and medium-sized enterprises are a major source of employment." }
]
```

- [ ] **Step 2: 写失败测试 src/lib/sentences.test.js**

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { TOPICS, allBuiltinSentences, splitPasteText, detectLang, addCustomSentences, getCustomSentences, sentenceById } from './sentences.js'

beforeEach(() => localStorage.clear())

describe('builtin library', () => {
  it('exposes 8 topics with labels', () => {
    expect(TOPICS.map(t => t.id)).toEqual(['daily', 'economy', 'diplomacy', 'tech', 'environment', 'education', 'sports', 'culture'])
    expect(TOPICS.every(t => typeof t.label === 'string')).toBe(true)
  })
  it('loads sentences with id/zh/en/topic', () => {
    const all = allBuiltinSentences()
    expect(all.length).toBeGreaterThanOrEqual(6)
    expect(all[0]).toEqual(expect.objectContaining({ id: expect.any(String), zh: expect.any(String), en: expect.any(String) }))
  })
  it('sentenceById finds builtin and custom', () => {
    const first = allBuiltinSentences()[0]
    expect(sentenceById(first.id).id).toBe(first.id)
    addCustomSentences(['这是自定义的句子。'])
    const custom = getCustomSentences()[0]
    expect(sentenceById(custom.id).zh).toBe('这是自定义的句子。')
  })
})

describe('splitPasteText', () => {
  it('splits on Chinese and English punctuation and newlines', () => {
    const out = splitPasteText('第一句。第二句！\nThird one. Fourth? ')
    expect(out).toEqual(['第一句。', '第二句！', 'Third one.', 'Fourth?'])
  })
  it('keeps abbreviations with trailing dot intact-ish (no empty parts)', () => {
    expect(splitPasteText('Hello Mr. Wang. 再见。')).toEqual(['Hello Mr. Wang.', '再见。'])
  })
  it('drops fragments shorter than 2 chars', () => {
    expect(splitPasteText('a。好的。')).toEqual(['好的。'])
  })
})

describe('detectLang', () => {
  it('detects zh vs en', () => {
    expect(detectLang('这是中文句子')).toBe('zh')
    expect(detectLang('This is English')).toBe('en')
  })
})

describe('custom sentences', () => {
  it('adds with generated id, source custom, topic paste', () => {
    addCustomSentences(['你好。', 'Hello.'])
    const list = getCustomSentences()
    expect(list).toHaveLength(2)
    expect(list[0]).toEqual(expect.objectContaining({ zh: '你好。', en: '', source: 'custom', topic: 'paste' }))
    expect(list[0].id).toMatch(/^c_/)
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

```powershell
npx vitest run src/lib/sentences.test.js
```

预期：FAIL（模块不存在）。

- [ ] **Step 4: 实现 src/lib/sentences.js**

```js
import { load, save } from './storage.js'
import daily from '../data/library/daily.json'
import economy from '../data/library/economy.json'
import diplomacy from '../data/library/diplomacy.json'
import tech from '../data/library/tech.json'
import environment from '../data/library/environment.json'
import education from '../data/library/education.json'
import sports from '../data/library/sports.json'
import culture from '../data/library/culture.json'

export const TOPICS = [
  { id: 'daily', label: '日常' },
  { id: 'economy', label: '经济' },
  { id: 'diplomacy', label: '外交' },
  { id: 'tech', label: '科技' },
  { id: 'environment', label: '环保' },
  { id: 'education', label: '教育' },
  { id: 'sports', label: '体育' },
  { id: 'culture', label: '文化' }
]

const BUILTIN = { daily, economy, diplomacy, tech, environment, education, sports, culture }

export function allBuiltinSentences() {
  return TOPICS.flatMap(t => BUILTIN[t.id].map(s => ({ ...s, topic: t.id, source: 'builtin' })))
}

export function sentenceById(id) {
  return allBuiltinSentences().find(s => s.id === id) || getCustomSentences().find(s => s.id === id) || null
}

export function detectLang(text) {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length
  return cjk / text.replace(/\s/g, '').length > 0.3 ? 'zh' : 'en'
}

export function splitPasteText(text) {
  return text
    .split(/(?<=[。！？!?])|[\n；;]+/)
    .map(s => s.trim())
    .filter(s => s.length >= 2)
}

export function addCustomSentences(texts) {
  const list = getCustomSentences()
  const added = texts.map((t, i) => ({
    id: `c_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
    zh: detectLang(t) === 'zh' ? t : '',
    en: detectLang(t) === 'en' ? t : '',
    topic: 'paste',
    source: 'custom'
  }))
  save('custom.v1', [...list, ...added])
  return added
}

export function getCustomSentences() {
  return load('custom.v1', [])
}
```

注意：`splitPasteText` 用了 lookbehind `(?<=…)`，Node 22 与现代浏览器均支持。

- [ ] **Step 5: 跑测试确认通过**

```powershell
npx vitest run src/lib/sentences.test.js
```

预期：9 passed。若 `Mr. Wang.` 一句断言失败，将正则改为 `/(?<=[。！？!?])|(?<=[.!?])\s+|[\n；;]+/` 再跑。

- [ ] **Step 6: Commit**

```powershell
$env:Path += ';C:\Program Files\Git\bin'; git add src/data/library/daily.json src/data/library/economy.json src/lib/sentences.js src/lib/sentences.test.js; git commit -m "feat: sentence library loader, paste splitting, custom sentence storage"
```

---

### Task 5: 题库内容扩充（8 主题 × ≥20 句）+ 校验测试

**Files:**
- Create: `src/data/library/diplomacy.json`, `tech.json`, `environment.json`, `education.json`, `sports.json`, `culture.json`, `src/data/library.test.js`
- Modify: `daily.json`, `economy.json`（各扩到 ≥20 句）

- [ ] **Step 1: 写失败测试 src/data/library.test.js**

```js
import { describe, it, expect } from 'vitest'
import { TOPICS, allBuiltinSentences } from '../lib/sentences.js'

describe('library content', () => {
  it('every topic has at least 20 sentences', () => {
    for (const t of TOPICS) {
      const n = allBuiltinSentences().filter(s => s.topic === t.id).length
      expect(n, `topic ${t.id} has ${n}`).toBeGreaterThanOrEqual(20)
    }
  })
  it('ids are unique and match topic prefix', () => {
    const all = allBuiltinSentences()
    const ids = all.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(all.every(s => s.id.startsWith(`${s.topic}_`))).toBe(true)
  })
  it('every sentence has non-empty zh and en, 5-120 chars', () => {
    for (const s of allBuiltinSentences()) {
      expect(s.zh.length, s.id).toBeGreaterThanOrEqual(5)
      expect(s.zh.length, s.id).toBeLessThanOrEqual(120)
      expect(s.en.length, s.id).toBeGreaterThanOrEqual(5)
      expect(s.en.length, s.id).toBeLessThanOrEqual(200)
    }
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```powershell
npx vitest run src/data/library.test.js
```

预期：FAIL（6 个主题文件不存在导致 sentences.js 导入报错，或句数不足 20）。

- [ ] **Step 3: 创建其余 6 个主题文件并把 daily/economy 扩到 ≥20 句**

每个文件形如 Task 4 Step 1 的 JSON 数组，id 规则 `{topic}_三位序号`。内容要求：中英对照、单句 10–30 秒口译时长、地道不说教。各主题取材方向：

- `diplomacy`：双边关系、峰会声明、记者会表态、国际组织合作
- `tech`：人工智能、芯片、新能源、航天、数字经济
- `environment`：碳中和、可再生能源、生物多样性、污染治理
- `education`：双减政策、职业教育、留学、终身学习
- `sports`：奥运会、全民健身、电竞、足球赛事
- `culture`：非遗、博物馆、影视出海、传统节日

注意：内置 JSON 里的 id 不含 `source`/`topic` 字段（加载器统一注入）。

- [ ] **Step 4: 跑测试确认通过**

```powershell
npx vitest run src/data/library.test.js
```

预期：3 passed。

- [ ] **Step 5: Commit**

```powershell
$env:Path += ';C:\Program Files\Git\bin'; git add src/data; git commit -m "feat: seed library to 8 topics x 20+ bilingual sentences with validator"
```

---

### Task 6: records 模块与统计（TDD）

**Files:**
- Create: `src/lib/records.js`, `src/lib/records.test.js`

- [ ] **Step 1: 写失败测试**

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { addRecord, getRecords, stats } from './records.js'
import { save } from './storage.js'

const now = new Date('2026-10-14T12:00:00+08:00').getTime()
const day = 86400000

beforeEach(() => localStorage.clear())

describe('addRecord', () => {
  it('appends with id and defaults ts to now', () => {
    addRecord({ sentenceId: 'daily_001', direction: 'zh2en', rating: 'ok' }, () => now)
    const list = getRecords()
    expect(list).toHaveLength(1)
    expect(list[0]).toEqual(expect.objectContaining({ sentenceId: 'daily_001', direction: 'zh2en', rating: 'ok', ts: now, id: expect.any(String) }))
  })
})

describe('stats', () => {
  it('counts today/total, streak, and topic strength', () => {
    save('records.v1', [
      { id: 'r1', sentenceId: 'daily_001', direction: 'zh2en', rating: 'ok', ts: now },
      { id: 'r2', sentenceId: 'economy_001', direction: 'en2zh', rating: 'miss', ts: now },
      { id: 'r3', sentenceId: 'economy_002', direction: 'zh2en', rating: 'ok', ts: now - day },
      { id: 'r4', sentenceId: 'daily_002', direction: 'zh2en', rating: 'ok', ts: now - 2 * day }
    ])
    const s = stats(() => now)
    expect(s.todayCount).toBe(2)
    expect(s.totalCount).toBe(4)
    expect(s.streakDays).toBe(3)
    expect(s.topicStrength.daily).toEqual({ ok: 2, shaky: 0, miss: 0, rate: 1 })
    expect(s.topicStrength.economy.rate).toBeCloseTo(0.5)
  })
  it('streak is 0 when no practice today', () => {
    save('records.v1', [{ id: 'r1', sentenceId: 'daily_001', direction: 'zh2en', rating: 'ok', ts: now - day }])
    expect(stats(() => now).streakDays).toBe(0)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```powershell
npx vitest run src/lib/records.test.js
```

预期：FAIL。

- [ ] **Step 3: 实现 src/lib/records.js**

```js
import { load, save } from './storage.js'
import { sentenceById } from './sentences.js'

export function addRecord({ sentenceId, direction, rating }, nowFn = Date.now) {
  const list = getRecords()
  list.push({ id: `r_${nowFn()}_${Math.random().toString(36).slice(2, 6)}`, sentenceId, direction, rating, ts: nowFn() })
  return save('records.v1', list)
}

export function getRecords() {
  return load('records.v1', [])
}

export function stats(nowFn = Date.now) {
  const records = getRecords()
  const localDate = ts => {
    const d = new Date(ts)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const today = localDate(nowFn())
  const byDay = new Set(records.map(r => localDate(r.ts)))
  let streakDays = 0
  for (let i = 0; ; i++) {
    const probe = new Date(nowFn() - i * 86400000)
    const key = `${probe.getFullYear()}-${String(probe.getMonth() + 1).padStart(2, '0')}-${String(probe.getDate()).padStart(2, '0')}`
    if (byDay.has(key)) streakDays++
    else break
  }
  const strength = {}
  for (const r of records) {
    const s = sentenceById(r.sentenceId)
    if (!s) continue
    strength[s.topic] ??= { ok: 0, shaky: 0, miss: 0, rate: 0 }
    strength[s.topic][r.rating]++
  }
  for (const t of Object.values(strength)) {
    const total = t.ok + t.shaky + t.miss
    t.rate = total ? t.ok / total : 0
  }
  return {
    todayCount: records.filter(r => localDate(r.ts) === today).length,
    totalCount: records.length,
    streakDays,
    topicStrength: strength
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

```powershell
npx vitest run src/lib/records.test.js
```

预期：3 passed。

- [ ] **Step 5: Commit**

```powershell
$env:Path += ';C:\Program Files\Git\bin'; git add src/lib/records.js src/lib/records.test.js; git commit -m "feat: practice records with streak and topic-strength stats"
```

---

### Task 7: review 弱句模块（TDD）

**Files:**
- Create: `src/lib/review.js`, `src/lib/review.test.js`

- [ ] **Step 1: 写失败测试**

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { weakIds, reviewList } from './review.js'
import { save } from './storage.js'

const now = new Date('2026-10-14T12:00:00+08:00').getTime()
const day = 86400000

beforeEach(() => localStorage.clear())

describe('weakIds (7 days)', () => {
  it('returns deduped ids with latest shaky/miss within 7d, newest first', () => {
    save('records.v1', [
      { id: 'r1', sentenceId: 'a', direction: 'zh2en', rating: 'miss', ts: now - 2 * day },
      { id: 'r2', sentenceId: 'a', direction: 'zh2en', rating: 'ok', ts: now - 3 * day },
      { id: 'r3', sentenceId: 'b', direction: 'zh2en', rating: 'shaky', ts: now - day },
      { id: 'r4', sentenceId: 'c', direction: 'zh2en', rating: 'miss', ts: now - 8 * day },
      { id: 'r5', sentenceId: 'd', direction: 'zh2en', rating: 'ok', ts: now - day }
    ])
    expect(weakIds(() => now)).toEqual(['b', 'a'])
  })
})

describe('reviewList (30 days)', () => {
  it('lists latest weak event per sentence with sentence object', () => {
    save('records.v1', [
      { id: 'r1', sentenceId: 'a', direction: 'zh2en', rating: 'miss', ts: now - 2 * day },
      { id: 'r2', sentenceId: 'a', direction: 'zh2en', rating: 'shaky', ts: now - day },
      { id: 'r3', sentenceId: 'c', direction: 'zh2en', rating: 'miss', ts: now - 40 * day }
    ])
    const list = reviewList(() => now)
    expect(list).toHaveLength(1)
    expect(list[0].sentenceId).toBe('a')
    expect(list[0].rating).toBe('shaky')
    expect(list[0].sentence).toBe(null) // unknown ids resolve to null in unit test
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```powershell
npx vitest run src/lib/review.test.js
```

预期：FAIL。

- [ ] **Step 3: 实现 src/lib/review.js**

```js
import { getRecords } from './records.js'
import { sentenceById } from './sentences.js'

export function weakIds(nowFn = Date.now, withinDays = 7) {
  const cutoff = nowFn() - withinDays * 86400000
  const latest = new Map()
  for (const r of getRecords()) {
    if ((r.rating === 'shaky' || r.rating === 'miss') && r.ts >= cutoff) {
      if (!latest.has(r.sentenceId) || latest.get(r.sentenceId) < r.ts) latest.set(r.sentenceId, r.ts)
    }
  }
  return [...latest.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => id)
}

export function reviewList(nowFn = Date.now, withinDays = 30) {
  const cutoff = nowFn() - withinDays * 86400000
  const latest = new Map()
  for (const r of getRecords()) {
    if ((r.rating === 'shaky' || r.rating === 'miss') && r.ts >= cutoff) {
      if (!latest.has(r.sentenceId) || latest.get(r.sentenceId) < r.ts) latest.set(r.sentenceId, r)
    }
  }
  return [...latest.values()].sort((x, y) => y.ts - x.ts).map(r => ({ ...r, sentence: sentenceById(r.sentenceId) }))
}
```

- [ ] **Step 4: 跑测试确认通过**

```powershell
npx vitest run src/lib/review.test.js
```

预期：2 passed。

- [ ] **Step 5: Commit**

```powershell
$env:Path += ';C:\Program Files\Git\bin'; git add src/lib/review.js src/lib/review.test.js; git commit -m "feat: weak-sentence lookup for zero-pressure review"
```

---

### Task 8: picker 抽句模块（TDD）

**Files:**
- Create: `src/lib/picker.js`, `src/lib/picker.test.js`

- [ ] **Step 1: 写失败测试**

```js
import { describe, it, expect, vi } from 'vitest'
import { drawSentence } from './picker.js'

const pool = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

describe('drawSentence', () => {
  it('returns a sentence from pool', () => {
    const s = drawSentence({ pool, lastId: null, weakIds: [], random: () => 0.9 })
    expect(pool.map(p => p.id)).toContain(s.id)
  })
  it('mixes a weak sentence ~30% of the time', () => {
    const random = vi.fn().mockReturnValue(0.1) // < 0.3 → weak path
    const pick = vi.fn().mockReturnValue(0)
    const s = drawSentence({ pool, lastId: null, weakIds: ['w1', 'w2'], random, pickIndex: pick, sentenceById: id => ({ id }) })
    expect(s.id).toBe('w1')
    expect(pick).toHaveBeenCalledWith(2)
  })
  it('falls back to pool when weak path picks nothing usable', () => {
    const s = drawSentence({ pool, lastId: null, weakIds: ['gone'], random: () => 0.1, sentenceById: () => null })
    expect(pool.map(p => p.id)).toContain(s.id)
  })
  it('never repeats lastId when pool has alternatives', () => {
    const random = vi.fn().mockReturnValue(0.9)
    const pick = vi.fn().mockReturnValue(0)
    for (let i = 0; i < 20; i++) {
      const s = drawSentence({ pool, lastId: 'a', weakIds: [], random, pickIndex: pick })
      expect(s.id).not.toBe('a')
    }
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```powershell
npx vitest run src/lib/picker.test.js
```

预期：FAIL。

- [ ] **Step 3: 实现 src/lib/picker.js**

```js
import { sentenceById } from './sentences.js'

const WEAK_RATIO = 0.3

export function drawSentence({ pool, lastId, weakIds = [], random = Math.random, pickIndex = arr => Math.floor(Math.random() * arr.length), sentenceByIdFn = sentenceById }) {
  if (pool.length === 0) return null
  if (random() < WEAK_RATIO && weakIds.length > 0) {
    const id = weakIds[pickIndex(weakIds)]
    const weak = id ? sentenceByIdFn(id) : null
    if (weak && weak.id !== lastId) return weak
  }
  const candidates = pool.length > 1 && lastId ? pool.filter(s => s.id !== lastId) : pool
  return candidates[pickIndex(candidates)]
}
```

- [ ] **Step 4: 跑测试确认通过**

```powershell
npx vitest run src/lib/picker.test.js
```

预期：4 passed。

- [ ] **Step 5: Commit**

```powershell
$env:Path += ';C:\Program Files\Git\bin'; git add src/lib/picker.js src/lib/picker.test.js; git commit -m "feat: sentence picker with 30% weak-mix and no-immediate-repeat"
```

---

### Task 9: settings store（TDD）

**Files:**
- Create: `src/stores/settings.js`, `src/stores/settings.test.js`

- [ ] **Step 1: 写失败测试**

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { settings, loadSettings, setDirection, setTheme, setShowTimer, applyTheme } from './settings.js'

beforeEach(() => { localStorage.clear(); loadSettings() })

describe('settings store', () => {
  it('has defaults: zh2en, dark, timer off', () => {
    expect(settings.value).toEqual({ direction: 'zh2en', theme: 'dark', showTimer: false })
  })
  it('setters persist via storage module', () => {
    setDirection('en2zh')
    setTheme('light')
    setShowTimer(true)
    expect(JSON.parse(localStorage.getItem('interpret.settings.v1'))).toEqual({ direction: 'en2zh', theme: 'light', showTimer: true })
    expect(settings.value.direction).toBe('en2zh')
  })
  it('applyTheme toggles html data-theme', () => {
    setTheme('light')
    applyTheme()
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```powershell
npx vitest run src/stores/settings.test.js
```

预期：FAIL。

- [ ] **Step 3: 实现 src/stores/settings.js**

```js
import { ref } from 'vue'
import { load, save } from '../lib/storage.js'

const DEFAULTS = { direction: 'zh2en', theme: 'dark', showTimer: false }

export const settings = ref({ ...DEFAULTS })

export function loadSettings() {
  settings.value = { ...DEFAULTS, ...load('settings.v1', {}) }
  applyTheme()
}

export function saveSettings() {
  save('settings.v1', { ...settings.value })
}

export function setDirection(v) { settings.value.direction = v; saveSettings() }
export function setTheme(v) { settings.value.theme = v; saveSettings(); applyTheme() }
export function setShowTimer(v) { settings.value.showTimer = v; saveSettings() }

export function applyTheme() {
  document.documentElement.dataset.theme = settings.value.theme
}
```

- [ ] **Step 4: 跑测试确认通过**

```powershell
npx vitest run src/stores/settings.test.js
```

预期：3 passed。然后在 `src/main.js` 的 `createApp(App)` 之前加一行 `import { loadSettings } from './stores/settings.js'; loadSettings()`，并把 index.html 的 `data-theme="dark"` 保留（作为首帧默认）。

- [ ] **Step 5: Commit**

```powershell
$env:Path += ';C:\Program Files\Git\bin'; git add src/stores/settings.js src/stores/settings.test.js src/main.js; git commit -m "feat: reactive settings store with theme persistence"
```

---

### Task 10: PracticeCard 翻转卡组件（组件测试）

**Files:**
- Create: `src/components/PracticeCard.vue`, `src/components/PracticeCard.test.js`

- [ ] **Step 1: 写失败测试**

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PracticeCard from './PracticeCard.vue'

const sentence = { id: 'daily_001', zh: '你好。', en: 'Hello.', topic: 'daily', source: 'builtin' }

describe('PracticeCard', () => {
  it('shows source text by direction zh2en', () => {
    const w = mount(PracticeCard, { props: { sentence, direction: 'zh2en' } })
    expect(w.text()).toContain('你好。')
    expect(w.text()).not.toContain('Hello.')
  })
  it('reveals reference on button click and emits revealed', async () => {
    const w = mount(PracticeCard, { props: { sentence, direction: 'zh2en' } })
    await w.find('.btn-reveal').trigger('click')
    expect(w.text()).toContain('Hello.')
    expect(w.emitted('revealed')).toBeTruthy()
  })
  it('shows hint when reference side missing (custom paste)', async () => {
    const w = mount(PracticeCard, { props: { sentence: { ...sentence, en: '' }, direction: 'zh2en' } })
    await w.find('.btn-reveal').trigger('click')
    expect(w.text()).toContain('此句无参考译文')
  })
  it('skip button emits skip', async () => {
    const w = mount(PracticeCard, { props: { sentence, direction: 'zh2en' } })
    await w.find('.btn-skip').trigger('click')
    expect(w.emitted('skip')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```powershell
npx vitest run src/components/PracticeCard.test.js
```

预期：FAIL。

- [ ] **Step 3: 实现 src/components/PracticeCard.vue**

```vue
<template>
  <div class="card neu-raised" :class="{ flipped: revealed }">
    <div class="card-face">
      <span class="dir-pill">{{ direction === 'zh2en' ? '中 → 英' : '英 → 中' }}</span>
      <p class="source">{{ sourceText }}</p>
      <button class="btn btn-primary btn-reveal" v-if="!revealed" @click="revealed = true; emit('revealed')">看参考译文</button>
      <div class="reference neu-inset" v-else>
        <p>{{ referenceText }}</p>
      </div>
      <button class="btn btn-skip" @click="emit('skip')">跳过</button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  sentence: { type: Object, required: true },
  direction: { type: String, default: 'zh2en' }
})
const emit = defineEmits(['revealed', 'skip'])

const revealed = ref(false)
watch(() => props.sentence, () => { revealed.value = false })

const sourceText = computed(() => (props.direction === 'zh2en' ? props.sentence.zh : props.sentence.en) || props.sentence.zh || props.sentence.en)
const referenceText = computed(() => {
  const t = props.direction === 'zh2en' ? props.sentence.en : props.sentence.zh
  return t || '（此句无参考译文，凭感觉评即可）'
})
</script>

<style scoped>
.card { padding: 28px 20px; display: flex; justify-content: center; }
.card-face { display: flex; flex-direction: column; align-items: center; gap: 20px; width: 100%; }
.dir-pill { font-size: 12px; color: var(--accent-text); background: var(--accent-soft); border-radius: 999px; padding: 4px 12px; }
.source { font-size: 22px; line-height: 1.6; text-align: center; margin: 12px 0; }
.reference { padding: 14px 16px; width: 100%; text-align: center; font-size: 16px; line-height: 1.6; color: var(--accent-text); }
.btn-skip { font-size: 13px; opacity: 0.6; }
</style>
```

- [ ] **Step 4: 跑测试确认通过**

```powershell
npx vitest run src/components/PracticeCard.test.js
```

预期：4 passed。

- [ ] **Step 5: Commit**

```powershell
$env:Path += ';C:\Program Files\Git\bin'; git add src/components/PracticeCard.vue src/components/PracticeCard.test.js; git commit -m "feat: flip practice card component"
```

---

### Task 11: RatingButtons + PracticeView 会话流（组件测试）

**Files:**
- Create: `src/components/RatingButtons.vue`, `src/components/RatingButtons.test.js`, `src/views/PracticeView.vue`（替换占位）

- [ ] **Step 1: 写 RatingButtons 失败测试**

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RatingButtons from './RatingButtons.vue'

describe('RatingButtons', () => {
  it('renders three ratings in fixed order and emits on click', async () => {
    const w = mount(RatingButtons)
    const btns = w.findAll('button')
    expect(btns.map(b => b.text())).toEqual(['能译', '磕绊', '不会'])
    await btns[1].trigger('click')
    expect(w.emitted('rate')).toEqual([['shaky']])
  })
})
```

- [ ] **Step 2: 跑测试确认失败，然后实现 RatingButtons.vue 使其通过**

```vue
<template>
  <div class="rating-row">
    <button v-for="r in ratings" :key="r.value" class="btn" @click="emit('rate', r.value)">{{ r.label }}</button>
  </div>
</template>

<script setup>
const emit = defineEmits(['rate'])
const ratings = [
  { value: 'ok', label: '能译' },
  { value: 'shaky', label: '磕绊' },
  { value: 'miss', label: '不会' }
]
</script>

<style scoped>
.rating-row { display: flex; gap: 14px; justify-content: center; }
.rating-row .btn { min-width: 84px; }
</style>
```

```powershell
npx vitest run src/components/RatingButtons.test.js
```

预期：1 passed。

- [ ] **Step 3: 实现 PracticeView.vue（替换占位）**

```vue
<template>
  <main class="view">
    <header class="practice-header">
      <span class="count">{{ done }}</span>
      <span v-if="settings.showTimer" class="timer">{{ elapsed }}s</span>
      <button class="btn btn-history" @click="showHistory = true">历史</button>
    </header>

    <template v-if="current">
      <PracticeCard :sentence="current.sentence" :direction="current.direction" @revealed="onRevealed" @skip="next(false)" />
      <div class="rating-zone">
        <RatingButtons v-if="current.revealed" @rate="rate" />
        <p v-else class="hint">口头译出后，点「看参考译文」对照</p>
      </div>
      <button class="btn dir-toggle" @click="flipDirection">{{ current.direction === 'zh2en' ? '英 → 中' : '中 → 英' }}</button>
    </template>
    <div v-else class="empty neu-raised">
      <p>这里空空的</p>
      <p class="hint">去「题库」挑个主题，或到「粘贴」丢一段文字进来</p>
    </div>

    <SessionHistory v-if="showHistory" :items="history" @close="showHistory = false" />
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import PracticeCard from '../components/PracticeCard.vue'
import RatingButtons from '../components/RatingButtons.vue'
import SessionHistory from '../components/SessionHistory.vue'
import { settings } from '../stores/settings.js'
import { allBuiltinSentences, getCustomSentences } from '../lib/sentences.js'
import { drawSentence } from '../lib/picker.js'
import { weakIds } from '../lib/review.js'
import { addRecord } from '../lib/records.js'

const pool = ref([])
const current = ref(null)
const history = ref([])
const showHistory = ref(false)
const done = computed(() => history.value.length)
const elapsed = ref(0)
let startedAt = 0
let timerId = null

function startTimer() {
  if (!settings.value.showTimer) return
  startedAt = Date.now(); elapsed.value = 0
  clearInterval(timerId)
  timerId = setInterval(() => { elapsed.value = Math.floor((Date.now() - startedAt) / 1000) }, 1000)
}

function next(counted) {
  if (counted) history.value.push({ ...current.value })
  const weak = weakIds()
  const s = drawSentence({ pool: pool.value, lastId: current.value?.sentence.id ?? null, weakIds: weak })
  current.value = s ? { sentence: s, direction: settings.value.direction, revealed: false } : null
  startTimer()
}

function onRevealed() {
  if (current.value) current.value.revealed = true
}

function rate(rating) {
  addRecord({ sentenceId: current.value.sentence.id, direction: current.value.direction, rating })
  next(true)
}

function flipDirection() {
  current.value.direction = current.value.direction === 'zh2en' ? 'en2zh' : 'zh2en'
}

onMounted(() => {
  pool.value = [...allBuiltinSentences(), ...getCustomSentences()]
  next(false)
})
</script>

<style scoped>
.practice-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.count { font-size: 14px; color: var(--text-muted); }
.timer { font-size: 14px; color: var(--accent-text); }
.btn-history { margin-left: auto; font-size: 13px; padding: 8px 14px; }
.rating-zone { margin-top: 20px; min-height: 56px; display: flex; align-items: center; justify-content: center; }
.hint { font-size: 13px; color: var(--text-muted); }
.dir-toggle { display: block; margin: 20px auto 0; font-size: 13px; opacity: 0.7; }
.empty { padding: 40px 20px; text-align: center; }
</style>
```

- [ ] **Step 4: 手动验证**

```powershell
npm run dev
```

首页：出句 → 点「看参考译文」→ 点自评 → 自动下一句；「历史」弹层可看已练句；方向切换即时生效。`Ctrl+C` 退出。

- [ ] **Step 5: Commit**

```powershell
$env:Path += ';C:\Program Files\Git\bin'; git add src/components/RatingButtons.vue src/components/RatingButtons.test.js src/views/PracticeView.vue; git commit -m "feat: practice session flow with rating, history and direction toggle"
```

---

### Task 12: SessionHistory 组件

**Files:**
- Create: `src/components/SessionHistory.vue`, `src/components/SessionHistory.test.js`

- [ ] **Step 1: 写失败测试**

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SessionHistory from './SessionHistory.vue'

const items = [
  { sentence: { id: 'a', zh: '原文一。', en: 'Source one.' }, direction: 'zh2en', revealed: true },
  { sentence: { id: 'b', zh: '原文二。', en: 'Source two.' }, direction: 'zh2en', revealed: true }
]

describe('SessionHistory', () => {
  it('lists each practiced item as chat bubbles and closes on button', async () => {
    const w = mount(SessionHistory, { props: { items } })
    expect(w.text()).toContain('原文一。')
    expect(w.text()).toContain('Source two.')
    await w.find('.btn-close').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })
  it('shows empty hint when no items', () => {
    const w = mount(SessionHistory, { props: { items: [] } })
    expect(w.text()).toContain('还没有练过')
  })
})
```

- [ ] **Step 2: 跑测试确认失败，然后实现**

```vue
<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="panel neu-raised">
      <header>
        <h3>本轮练习</h3>
        <button class="btn btn-close" @click="emit('close')">关闭</button>
      </header>
      <p v-if="items.length === 0" class="hint">还没有练过，先来一句吧</p>
      <ol v-else class="thread">
        <li v-for="(it, i) in items" :key="i">
          <div class="bubble src">{{ sourceOf(it) }}</div>
          <div class="bubble ref">{{ refOf(it) }}</div>
        </li>
      </ol>
    </div>
  </div>
</template>

<script setup>
defineProps({ items: { type: Array, default: () => [] } })
const emit = defineEmits(['close'])
const sourceOf = it => (it.direction === 'zh2en' ? it.sentence.zh : it.sentence.en)
const refOf = it => (it.direction === 'zh2en' ? it.sentence.en || '（无参考译文）' : it.sentence.zh || '（无参考译文）')
</script>

<style scoped>
.overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); display: flex; align-items: flex-end; justify-content: center; z-index: 10; }
.panel { width: min(480px, 100%); max-height: 75dvh; overflow-y: auto; padding: 16px; border-radius: 20px 20px 0 0; }
header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
h3 { margin: 0; font-size: 16px; }
.btn-close { font-size: 13px; padding: 8px 14px; }
.thread { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.bubble { max-width: 85%; padding: 8px 12px; border-radius: 12px; font-size: 14px; }
.bubble.src { background: var(--surface-deep); box-shadow: var(--shadow-in); }
.bubble.ref { background: var(--accent-soft); color: var(--accent-text); margin-left: auto; }
.hint { color: var(--text-muted); font-size: 13px; }
</style>
```

```powershell
npx vitest run src/components/SessionHistory.test.js
```

预期：2 passed。

- [ ] **Step 3: Commit**

```powershell
$env:Path += ';C:\Program Files\Git\bin'; git add src/components/SessionHistory.vue src/components/SessionHistory.test.js; git commit -m "feat: session history chat-flow overlay"
```

---

### Task 13: LibraryView 题库页

**Files:**
- Modify: `src/views/LibraryView.vue`（替换占位）

- [ ] **Step 1: 实现**

```vue
<template>
  <main class="view">
    <h2>题库</h2>
    <p class="hint">点主题进入连续练习；练习中会有约三成机会碰到你最近磕绊的老朋友</p>
    <div class="topic-grid">
      <button v-for="t in topics" :key="t.id" class="btn topic-card neu-raised" @click="start(t.id)">
        <span class="topic-label">{{ t.label }}</span>
        <span class="topic-count">{{ countOf(t.id) }} 句</span>
      </button>
    </div>
  </main>
</template>

<script setup>
import { TOPICS, allBuiltinSentences } from '../lib/sentences.js'

const topics = TOPICS
const countOf = id => allBuiltinSentences().filter(s => s.topic === id).length

function start(topicId) {
  location.hash = `/#/` // 回练习页
  sessionStorage.setItem('interpret.session', JSON.stringify({ mode: 'topic', topicId }))
}
</script>

<style scoped>
h2 { font-size: 20px; }
.hint { font-size: 13px; color: var(--text-muted); }
.topic-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.topic-card { display: flex; flex-direction: column; gap: 6px; padding: 18px; align-items: flex-start; }
.topic-label { font-size: 17px; }
.topic-count { font-size: 12px; color: var(--text-muted); }
</style>
```

同时修改 PracticeView 的 `onMounted`，读取 `sessionStorage.getItem('interpret.session')`：存在则 `pool` 只取该主题句子，并 `sessionStorage.removeItem('interpret.session')`。

- [ ] **Step 2: 手动验证**

`npm run dev`：题库页显示 8 主题与句数；点「日常」回到练习页，连续出句均为日常主题。`Ctrl+C` 退出。

- [ ] **Step 3: Commit**

```powershell
$env:Path += ';C:\Program Files\Git\bin'; git add src/views/LibraryView.vue src/views/PracticeView.vue; git commit -m "feat: topic library view and topic-scoped practice sessions"
```

---

### Task 14: PasteView 粘贴页

**Files:**
- Modify: `src/views/PasteView.vue`（替换占位）

- [ ] **Step 1: 实现**

```vue
<template>
  <main class="view">
    <h2>粘贴开练</h2>
    <p class="hint">随手贴一段文字，自动拆句立刻练</p>
    <textarea v-model="text" class="neu-inset" rows="8" placeholder="把文章、新闻、讲稿……任何文字丢进来"></textarea>
    <p v-if="sentences.length" class="preview">{{ sentences.length }} 句待练</p>
    <p v-if="error" class="error">{{ error }}</p>
    <button class="btn btn-primary" :disabled="!sentences.length" @click="start">开始练习</button>
  </main>
</template>

<script setup>
import { computed, ref } from 'vue'
import { splitPasteText, addCustomSentences } from '../lib/sentences.js'

const text = ref('')
const error = ref('')
const sentences = computed(() => splitPasteText(text.value))

function start() {
  if (sentences.value.length === 0) { error.value = '没有拆出可练的句子，检查一下内容'; return }
  error.value = ''
  addCustomSentences(sentences.value)
  sessionStorage.setItem('interpret.session', JSON.stringify({ mode: 'paste' }))
  location.hash = '/#/'
}
</script>

<style scoped>
h2 { font-size: 20px; }
.hint { font-size: 13px; color: var(--text-muted); }
textarea { width: 100%; border: none; resize: vertical; padding: 14px; font-size: 15px; color: var(--text); font-family: inherit; }
.preview { font-size: 13px; color: var(--accent-text); }
.error { font-size: 13px; color: #e8463a; }
.btn-primary:disabled { opacity: 0.4; }
</style>
```

同时修改 PracticeView 的 `onMounted`：`session.mode === 'paste'` 时 `pool` 只取 `getCustomSentences()`，并清除该标记。

- [ ] **Step 2: 手动验证**

粘贴一段中英混合文字 → 显示句数 → 开始练习后只出刚粘贴的句子；空文本点按钮出现红色提示。`Ctrl+C` 退出。

- [ ] **Step 3: Commit**

```powershell
$env:Path += ';C:\Program Files\Git\bin'; git add src/views/PasteView.vue src/views/PracticeView.vue; git commit -m "feat: paste-to-practice view with sentence splitting preview"
```

---

### Task 15: ReviewView 弱项回顾页

**Files:**
- Modify: `src/views/ReviewView.vue`（替换占位）

- [ ] **Step 1: 实现**

```vue
<template>
  <main class="view">
    <h2>弱项回顾</h2>
    <p class="hint">最近 30 天磕绊过的句子。只是回顾工具——不看不欠</p>
    <p v-if="list.length === 0" class="empty neu-raised">目前没有弱句，太稳了</p>
    <ul v-else class="weak-list">
      <li v-for="it in list" :key="it.sentenceId + it.ts" class="neu-raised">
        <p class="weak-src">{{ it.sentence?.zh || it.sentence?.en || it.sentenceId }}</p>
        <p class="weak-meta">{{ it.rating === 'miss' ? '不会' : '磕绊' }} · {{ fmt(it.ts) }}</p>
      </li>
    </ul>
    <button v-if="list.length" class="btn btn-primary" @click="replay">重练这 {{ list.length }} 句</button>
  </main>
</template>

<script setup>
import { reviewList } from '../lib/review.js'

const list = reviewList()
const fmt = ts => new Date(ts).toLocaleDateString('zh-CN')

function replay() {
  sessionStorage.setItem('interpret.session', JSON.stringify({ mode: 'replay', ids: list.map(i => i.sentenceId) }))
  location.hash = '/#/'
}
</script>

<style scoped>
h2 { font-size: 20px; }
.hint { font-size: 13px; color: var(--text-muted); }
.weak-list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.weak-list li { padding: 14px 16px; }
.weak-src { margin: 0 0 6px; font-size: 15px; }
.weak-meta { margin: 0; font-size: 12px; color: var(--text-muted); }
.empty { padding: 32px; text-align: center; color: var(--text-muted); }
.btn-primary { width: 100%; margin-top: 16px; }
</style>
```

同时修改 PracticeView 的 `onMounted`：`session.mode === 'replay'` 时 `pool` 取 `ids.map(sentenceById).filter(Boolean)`，清除标记。

- [ ] **Step 2: 手动验证**

练几句并点「磕绊/不会」→ 复习页出现对应列表 → 点重练，练习页只出这些句子。`Ctrl+C` 退出。

- [ ] **Step 3: Commit**

```powershell
$env:Path += ';C:\Program Files\Git\bin'; git add src/views/ReviewView.vue src/views/PracticeView.vue; git commit -m "feat: weak-sentence review list with replay session"
```

---

### Task 16: MeView 我的页（统计 + 导出导入 + 设置）

**Files:**
- Modify: `src/views/MeView.vue`（替换占位）

- [ ] **Step 1: 实现**

```vue
<template>
  <main class="view">
    <h2>我的</h2>
    <div class="stat-row">
      <div class="stat neu-raised"><b>{{ s.streakDays }}</b><span>连续天数</span></div>
      <div class="stat neu-raised"><b>{{ s.todayCount }}</b><span>今日句数</span></div>
      <div class="stat neu-raised"><b>{{ s.totalCount }}</b><span>累计句数</span></div>
    </div>

    <h3>主题强弱</h3>
    <p v-if="topics.length === 0" class="hint">练几句就有数据啦</p>
    <div v-for="t in topics" :key="t.id" class="topic-row">
      <span class="topic-name">{{ t.label }}</span>
      <div class="bar neu-inset"><div class="bar-fill" :style="{ width: (t.rate * 100).toFixed(0) + '%' }"></div></div>
      <span class="topic-rate">{{ (t.rate * 100).toFixed(0) }}%</span>
    </div>

    <h3>设置</h3>
    <label class="setting">默认方向
      <select :value="settings.direction" @change="setDirection($event.target.value)">
        <option value="zh2en">中 → 英</option>
        <option value="en2zh">英 → 中</option>
      </select>
    </label>
    <label class="setting">计时显示 <input type="checkbox" :checked="settings.showTimer" @change="setShowTimer($event.target.checked)" /></label>
    <label class="setting">深色主题 <input type="checkbox" :checked="settings.theme === 'dark'" @change="setTheme($event.target.checked ? 'dark' : 'light')" /></label>

    <h3>数据</h3>
    <div class="data-row">
      <button class="btn" @click="exportData">导出 JSON</button>
      <button class="btn" @click="fileInput.click()">导入 JSON</button>
      <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="importData" />
    </div>
    <p v-if="msg" class="msg">{{ msg }}</p>
  </main>
</template>

<script setup>
import { computed, ref } from 'vue'
import { stats } from '../lib/records.js'
import { TOPICS } from '../lib/sentences.js'
import { settings, setDirection, setTheme, setShowTimer } from '../stores/settings.js'
import { exportAll, importAll, storageAvailable } from '../lib/storage.js'

const s = stats()
const fileInput = ref(null)
const msg = ref('')

const topics = computed(() =>
  Object.entries(s.topicStrength)
    .map(([id, v]) => ({ ...v, id, label: TOPICS.find(t => t.id === id)?.label || id }))
    .sort((a, b) => b.rate - a.rate)
)

function exportData() {
  const blob = new Blob([JSON.stringify(exportAll(), null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `interpret-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

function importData(e) {
  const file = e.target.files?.[0]
  if (!file) return
  file.text().then(t => {
    msg.value = importAll(t) ? '导入成功' : '文件格式不对，没有覆盖任何数据'
  })
  e.target.value = ''
}
</script>

<style scoped>
h2 { font-size: 20px; } h3 { font-size: 15px; margin-top: 24px; }
.stat-row { display: flex; gap: 12px; }
.stat { flex: 1; padding: 14px; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.stat b { font-size: 20px; } .stat span { font-size: 12px; color: var(--text-muted); }
.topic-row { display: flex; align-items: center; gap: 10px; margin: 10px 0; }
.topic-name { width: 40px; font-size: 13px; }
.bar { flex: 1; height: 10px; border-radius: 999px; overflow: hidden; }
.bar-fill { height: 100%; background: var(--accent); border-radius: 999px; }
.topic-rate { width: 40px; text-align: right; font-size: 12px; color: var(--text-muted); }
.setting { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; font-size: 14px; }
.data-row { display: flex; gap: 12px; }
.msg { font-size: 13px; color: var(--accent-text); }
select { background: var(--surface); color: var(--text); border: none; border-radius: 8px; padding: 6px 10px; box-shadow: var(--shadow-in); }
</style>
```

- [ ] **Step 2: 手动验证**

练几句后：三个统计正确；导出 JSON 可下载；导入刚导出的文件提示"导入成功"；导入随便一个非法文件提示错误且原数据未变。`Ctrl+C` 退出。

- [ ] **Step 3: Commit**

```powershell
$env:Path += ';C:\Program Files\Git\bin'; git add src/views/MeView.vue; git commit -m "feat: stats, settings and data export/import on profile view"
```

---

### Task 17: PWA 可安装与离线

**Files:**
- Create: `public/favicon.svg`, `public/icon-192.svg`, `public/icon-512.svg`
- Modify: `vite.config.js`, `src/main.js`

- [ ] **Step 1: 写三个 SVG 图标（同源不同尺寸声明，简单配色：深底 + 绿色话筒气泡）**

`public/favicon.svg`（icon-192/512 内容相同，仅文件名不同，manifest 中用 sizes 声明）:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#1c1c1f"/>
  <path d="M150 200c0-44 47-72 106-72s106 28 106 72-47 72-106 72c-10 0-20-1-29-3l-45 28 9-40c-25-14-41-34-41-57z" fill="#32f08c"/>
  <rect x="196" y="300" width="120" height="12" rx="6" fill="#e7e7ea"/>
  <rect x="216" y="328" width="80" height="12" rx="6" fill="#9a9aa3"/>
</svg>
```

- [ ] **Step 2: vite.config.js 加 PWA 插件**

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/interpret/',
  plugins: [
    vue(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '口译随手练',
        short_name: '随手练',
        description: '随时来一句，保持翻译敏感度',
        theme_color: '#1c1c1f',
        background_color: '#1c1c1f',
        display: 'standalone',
        start_url: '/interpret/',
        icons: [
          { src: 'icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' }
        ]
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,json,woff2}'] }
    })
  ],
  test: { environment: 'happy-dom', globals: false }
})
```

- [ ] **Step 3: src/main.js 注册 SW 与更新提示**

```js
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router.js'
import { loadSettings } from './stores/settings.js'
import './styles/main.css'

import { registerSW } from 'virtual:pwa-register'

loadSettings()
const app = createApp(App)
app.use(router)
app.mount('#app')

const updateSW = registerSW({
  onNeedRefresh() {
    const bar = document.createElement('div')
    bar.textContent = '有新版本，点击刷新'
    bar.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#32f08c;color:#062d18;padding:10px 18px;border-radius:999px;font-size:14px;cursor:pointer;z-index:99'
    bar.onclick = () => updateSW(true)
    document.body.appendChild(bar)
  }
})
```

- [ ] **Step 4: 构建 + 离线验证**

```powershell
npm run build; npm run preview
```

预期：dist 含 `sw.js` 与 `manifest.webmanifest`；预览页可安装（地址栏安装图标）；断网刷新仍可用。`Ctrl+C` 退出。

- [ ] **Step 5: Commit + 推送**

```powershell
$env:Path += ';C:\Program Files\Git\bin'; git add vite.config.js src/main.js public; git commit -m "feat: installable PWA with offline cache and update toast"; git push
```

---

### Task 18: 终验（对照规格 §10 验收清单）

- [ ] **Step 1: 全量测试**

```powershell
npx vitest run
```

预期：全部 passed，0 failed。

- [ ] **Step 2: 手动验收清单（npm run dev 逐项过）**

1. 打开页面 3 秒内可译第一句（无注册/配置）
2. 一轮 = 点「看参考」+ 点自评，共 2 次点击
3. 方向切换、跳过、历史弹层正常
4. 题库 8 主题进入正常；粘贴中文/英文段落拆句正确；空粘贴有提示
5. 自评后"我的"页统计更新；连续天数正确
6. 弱句回顾列表与重练正常；无"待复习 N 句"类义务文案
7. 导出→清空 localStorage→导入，数据还原
8. localStorage 禁用（DevTools → Application → Cookies/Language 选 Block）时练习仍可用且有提示
9. 深色默认、亮色切换、手机宽度（DevTools 375px）单手可操作

- [ ] **Step 3: 构建 + 部署产物核验 + 推送**

```powershell
npm run build
```

预期：`✓ built`。`git push` 确认远端同步（`git status -sb` 显示无 ahead/behind）。

---

## 自审记录（writing-plans Self-Review）

- **Spec 覆盖**：随时开练/3秒(Task 10/11)、两次点击(Task 10/11)、PWA+离线(Task 17)、内置题库+粘贴(Task 4/5/14)、自评三档本地记录(Task 6/11)、零打字纯口头(Task 10/11)、中英双向(Task 10/16)、A 布局+历史入口(Task 10/12)、零压力复习 30% 弱句混入(Task 8)+弱项回顾(Task 7/15)、统计(Task 6/16)、导出导入(Task 3/16)、错误处理——损坏备份/配额满/非法导入/空粘贴/隐私模式(Task 3/4/14/16)、深色拟物(Task 2)、测试策略(Task 3-9 单测 + Task 18 验收) — 全覆盖
- **占位符扫描**：无 TBD/TODO；Task 5 题库内容由校验测试锁定数量与格式，主题取材方向已列明
- **类型一致性**：sentence `{id,zh,en,topic,source}`、record `{id,sentenceId,direction,rating,ts}`、rating `ok|shaky|miss`、direction `zh2en|en2zh`、storage key `interpret.{records.v1|custom.v1|settings.v1}`、session 标记 `interpret.session` 各任务间一致
