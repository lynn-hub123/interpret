# 音频功能（听辨 + 发音 + 录音）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为口译随手练 PWA 增加音频能力：听辨练习模式（先听后看）、原句发音参考按钮、说译文阶段录音回放。

**Architecture:** 新增两个可注入依赖的 lib 模块（tts.js / recorder.js）封装 Web Speech API 与 MediaRecorder；settings 增加 `mode` 字段；PracticeCard 增加听辨两态与音频控件；PracticeView 接线模式切换与生命周期清理。现有练习流（抽卡、弱句混抽、三级自评、历史、统计）完全不动。

**Tech Stack:** Web Speech API（speechSynthesis）、MediaRecorder + getUserMedia、Vitest mock（happy-dom 无这两个浏览器 API）。

**规格文档:** `docs/superpowers/specs/2026-10-16-audio-features-design.md`

**环境备忘（Windows）:**
- 一律 `npm.cmd` / `npx.cmd`，且先 `$env:Path += ';C:\Program Files\nodejs'`
- git 前 `$env:Path += ';C:\Program Files\Git\bin'`；提交消息用多个 `-m`，文本不得含内嵌双引号（禁 heredoc）
- 不提交 untracked 的 debug.log（搜狗输入法写入）
- PowerShell profile 的 ExecutionPolicy 报错是噪音，忽略
- 测试命令：`npm.cmd run test`（vitest run）；构建：`npm.cmd run build`
- 不要 push（最后 Task 6 统一 push）

**现状基准（截至 6d54df4）:** 45/45 测试通过、build ✓。PracticeCard 现有 props 仅 sentence/direction；PracticeView 控件在卡片下方（.dir-toggle）；settings DEFAULTS 三字段，测试文件 3 处 `toEqual` 断言需随 mode 同步更新。

---

### Task 1: tts 模块（TDD）

**Files:**
- Create: `src/lib/tts.js`
- Test: `src/lib/tts.test.js`

- [ ] **Step 1: 写失败测试**

```js
import { describe, it, expect, afterEach, vi } from 'vitest'
import { ttsSupported, voicesFor, speak, cancel } from './tts.js'

function stubSynth({ voices = [] } = {}) {
  const calls = { speak: [], cancel: 0 }
  const synth = {
    getVoices: () => voices,
    speak: u => calls.speak.push(u),
    cancel: () => { calls.cancel++ }
  }
  vi.stubGlobal('speechSynthesis', synth)
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(t) { this.text = t } })
  return calls
}

afterEach(() => { vi.unstubAllGlobals() })

describe('tts', () => {
  it('reports unsupported without speechSynthesis', () => {
    expect(ttsSupported()).toBe(false)
    expect(speak('hi', 'en')).toBe(false)
  })
  it('speak fails when voices exist but language pack missing', () => {
    const calls = stubSynth({ voices: [{ lang: 'zh-CN' }] })
    expect(speak('hello', 'en')).toBe(false)
    expect(calls.speak).toHaveLength(0)
  })
  it('speak works with empty voice list using engine default', () => {
    const calls = stubSynth()
    expect(speak('你好', 'zh')).toBe(true)
    expect(calls.speak).toHaveLength(1)
    expect(calls.speak[0].lang).toBe('zh-CN')
  })
  it('picks matching voice and maps lang', () => {
    const calls = stubSynth({ voices: [{ lang: 'en-US' }, { lang: 'zh-CN' }] })
    expect(speak('hello world', 'en')).toBe(true)
    expect(calls.speak[0].lang).toBe('en-US')
  })
  it('cancels previous before speaking a new one', () => {
    const calls = stubSynth()
    speak('a', 'en')
    speak('b', 'en')
    expect(calls.cancel).toBeGreaterThanOrEqual(1)
  })
  it('voicesFor matches language prefix', () => {
    stubSynth({ voices: [{ lang: 'zh-TW' }] })
    expect(voicesFor('zh')).toEqual({ lang: 'zh-TW' })
    expect(voicesFor('en')).toBeNull()
  })
  it('cancel is safe without engine', () => {
    expect(() => cancel()).not.toThrow()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `$env:Path += ';C:\Program Files\nodejs'; npx.cmd vitest run src/lib/tts.test.js`
Expected: FAIL（Cannot find module './tts.js'）

- [ ] **Step 3: 写实现**

```js
// TTS 封装：按语言朗读，同一时刻只播一句（播新先停旧）。
// 依赖全局 speechSynthesis / SpeechSynthesisUtterance，测试中用 vi.stubGlobal 注入 mock。
export function ttsSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function voicesFor(lang) {
  if (!ttsSupported()) return null
  const prefix = lang === 'zh' ? 'zh' : 'en'
  const list = window.speechSynthesis
    .getVoices()
    .filter(v => (v.lang || '').toLowerCase().startsWith(prefix))
  return list[0] || null
}

export function speak(text, lang) {
  if (!ttsSupported()) return false
  const synth = window.speechSynthesis
  cancel()
  const v = voicesFor(lang)
  // 语音列表非空但缺该语言语音包 → 失败；列表为空（Chrome 首次异步加载）→ 交给引擎默认语音
  if (synth.getVoices().length && !v) return false
  const u = new window.SpeechSynthesisUtterance(text)
  u.lang = lang === 'zh' ? 'zh-CN' : 'en-US'
  if (v) u.voice = v
  synth.speak(u)
  return true
}

export function cancel() {
  if (ttsSupported()) window.speechSynthesis.cancel()
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx.cmd vitest run src/lib/tts.test.js`
Expected: 7 passed

- [ ] **Step 5: 全量测试确认无回归**

Run: `npm.cmd run test`
Expected: 52 passed（45 旧 + 7 新）

- [ ] **Step 6: Commit**

```powershell
$env:Path += ';C:\Program Files\Git\bin'; git add src/lib/tts.js src/lib/tts.test.js; git commit -m 'feat: tts module with language voice matching' -m 'web speech synthesis wrapper, injectable for tests'
```

---

### Task 2: recorder 模块（TDD）

**Files:**
- Create: `src/lib/recorder.js`
- Test: `src/lib/recorder.test.js`

- [ ] **Step 1: 写失败测试**

完整测试文件终稿：

```js
import { describe, it, expect, afterEach, vi } from 'vitest'
import { recorderSupported, startRecording, isRecording, stopRecording, revoke } from './recorder.js'

function stubRecorderEnv({ reject = false } = {}) {
  const calls = { getUserMedia: 0, start: 0, stop: 0, tracksStopped: 0, createdURLs: [], revoked: [] }
  const track = { stop: () => { calls.tracksStopped++ } }
  const stream = { getTracks: () => [track] }
  class FakeRecorder {
    constructor() {
      this.state = 'inactive'; this.ondataavailable = null; this.onstop = null; this.mimeType = 'audio/webm'
      FakeRecorder.last = this
    }
    start() { calls.start++; this.state = 'recording' }
    stop() { calls.stop++; this.state = 'inactive'; if (this.onstop) this.onstop() }
  }
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: async () => {
        calls.getUserMedia++
        if (reject) throw new Error('denied')
        return stream
      }
    }
  })
  vi.stubGlobal('URL', {
    createObjectURL: b => { const u = 'blob:fake-' + calls.createdURLs.length; calls.createdURLs.push(b); return u },
    revokeObjectURL: u => calls.revoked.push(u)
  })
  return calls
}

afterEach(() => { vi.unstubAllGlobals() })

describe('recorder', () => {
  it('reports unsupported without MediaRecorder', async () => {
    expect(recorderSupported()).toBe(false)
    expect(await startRecording()).toBe(false)
    expect(await stopRecording()).toBeNull()
  })
  it('start fails when permission denied', async () => {
    stubRecorderEnv({ reject: true })
    expect(await startRecording()).toBe(false)
    expect(isRecording()).toBe(false)
  })
  it('full cycle: start, record, stop returns url and releases mic', async () => {
    const calls = stubRecorderEnv()
    expect(await startRecording()).toBe(true)
    expect(isRecording()).toBe(true)
    FakeRecorder.last.ondataavailable({ data: { size: 5 } })
    const url = await stopRecording()
    expect(url).toBe('blob:fake-0')
    expect(isRecording()).toBe(false)
    expect(calls.tracksStopped).toBe(1)
  })
  it('stop without active recording returns null', async () => {
    stubRecorderEnv()
    expect(await stopRecording()).toBeNull()
  })
  it('revoke releases object url', async () => {
    const calls = stubRecorderEnv()
    await startRecording()
    FakeRecorder.last.ondataavailable({ data: { size: 5 } })
    const url = await stopRecording()
    revoke(url)
    expect(calls.revoked).toEqual(['blob:fake-0'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx.cmd vitest run src/lib/recorder.test.js`
Expected: FAIL（Cannot find module './recorder.js'）

- [ ] **Step 3: 写实现**

```js
// 录音封装：MediaRecorder 状态机。录音仅会话级（浏览器限制，不持久化），
// Blob URL 由调用方负责 revoke。
const state = { recorder: null, stream: null, chunks: [] }

export function recorderSupported() {
  return typeof window !== 'undefined' &&
    typeof window.MediaRecorder === 'function' &&
    !!navigator.mediaDevices?.getUserMedia
}

export async function startRecording() {
  if (!recorderSupported()) return false
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    return false // 不支持或权限被拒
  }
  state.chunks = []
  state.recorder = new MediaRecorder(state.stream)
  state.recorder.ondataavailable = e => { if (e.data && e.data.size) state.chunks.push(e.data) }
  state.recorder.start()
  return true
}

export function isRecording() {
  return !!state.recorder && state.recorder.state === 'recording'
}

export function stopRecording() {
  if (!state.recorder) return Promise.resolve(null)
  const rec = state.recorder
  const stream = state.stream
  const chunks = state.chunks
  return new Promise(resolve => {
    rec.onstop = () => {
      stream.getTracks().forEach(t => t.stop()) // 熄灭麦克风指示灯
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
      const url = URL.createObjectURL(blob)
      state.recorder = null; state.stream = null; state.chunks = []
      resolve(url)
    }
    rec.stop()
  })
}

export function revoke(url) {
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx.cmd vitest run src/lib/recorder.test.js`
Expected: 5 passed

- [ ] **Step 5: 全量测试确认无回归**

Run: `npm.cmd run test`
Expected: 57 passed

- [ ] **Step 6: Commit**

```powershell
$env:Path += ';C:\Program Files\Git\bin'; git add src/lib/recorder.js src/lib/recorder.test.js; git commit -m 'feat: recorder module with session-scoped blob urls' -m 'media recorder state machine, mic release on stop'
```

---

### Task 3: settings 增加 mode 字段（TDD）

**Files:**
- Modify: `src/stores/settings.js`
- Test: `src/stores/settings.test.js`

- [ ] **Step 1: 更新测试（3 处旧断言同步 + 4 个新用例）**

现有 3 处 `toEqual` 断言必须同步加 `mode: 'sight'`，否则新字段导致全文件失败。完整测试文件终稿：

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { settings, loadSettings, setDirection, setTheme, setShowTimer, setMode, applyTheme } from './settings.js'

beforeEach(() => { localStorage.clear(); loadSettings() })

describe('settings store', () => {
  it('has defaults: zh2en, dark, timer off, sight mode', () => {
    expect(settings.value).toEqual({ direction: 'zh2en', theme: 'dark', showTimer: false, mode: 'sight' })
  })
  it('setters persist via storage module', () => {
    setDirection('en2zh')
    setTheme('light')
    setShowTimer(true)
    expect(JSON.parse(localStorage.getItem('interpret.settings.v1'))).toEqual({ direction: 'en2zh', theme: 'light', showTimer: true, mode: 'sight' })
    expect(settings.value.direction).toBe('en2zh')
  })
  it('applyTheme toggles html data-theme', () => {
    setTheme('light')
    applyTheme()
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})

describe('settings persistence signal and stored shape', () => {
  it('loadSettings merges persisted settings over defaults', () => {
    localStorage.setItem('interpret.settings.v1', JSON.stringify({ direction: 'en2zh' }))
    loadSettings()
    expect(settings.value).toEqual({ direction: 'en2zh', theme: 'dark', showTimer: false, mode: 'sight' })
  })
  it('loadSettings ignores non-object stored value', () => {
    localStorage.setItem('interpret.settings.v1', '[1,2]')
    loadSettings()
    expect(settings.value).toEqual({ direction: 'zh2en', theme: 'dark', showTimer: false, mode: 'sight' })
  })
  it('setters return persistence boolean', () => {
    expect(setDirection('en2zh')).toBe(true)
  })
})

describe('mode setting', () => {
  it('mode defaults to sight', () => {
    expect(settings.value.mode).toBe('sight')
  })
  it('setMode persists valid mode', () => {
    expect(setMode('listen')).toBe(true)
    expect(settings.value.mode).toBe('listen')
    expect(JSON.parse(localStorage.getItem('interpret.settings.v1')).mode).toBe('listen')
  })
  it('setMode rejects invalid value', () => {
    expect(setMode('bogus')).toBe(false)
    expect(settings.value.mode).toBe('sight')
    expect(JSON.parse(localStorage.getItem('interpret.settings.v1')).mode).toBe('sight')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx.cmd vitest run src/stores/settings.test.js`
Expected: FAIL（setMode 未定义 / mode 断言不匹配）

- [ ] **Step 3: 修改实现**

`src/stores/settings.js` 只改两处：

第 4 行 DEFAULTS：

```js
const DEFAULTS = { direction: 'zh2en', theme: 'dark', showTimer: false, mode: 'sight' }
```

第 21 行 setShowTimer 之后新增：

```js
export function setMode(v) {
  if (v !== 'sight' && v !== 'listen') return false
  settings.value.mode = v
  return saveSettings()
}
```

其余代码不动（loadSettings 的 `{ ...DEFAULTS, ...stored }` 已天然兼容旧备份缺 mode 的情况）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx.cmd vitest run src/stores/settings.test.js`
Expected: 10 passed

- [ ] **Step 5: 全量测试确认无回归**

Run: `npm.cmd run test`
Expected: 61 passed

- [ ] **Step 6: Commit**

```powershell
$env:Path += ';C:\Program Files\Git\bin'; git add src/stores/settings.js src/stores/settings.test.js; git commit -m 'feat: settings mode field for sight and listen practice'
```

---

### Task 4: PracticeCard 听辨两态 + 发音喇叭

**Files:**
- Modify: `src/components/PracticeCard.vue`（完整替换）
- Test: `src/components/PracticeCard.test.js`

**现状提醒**：现有 4 个测试用例（source 回退链 / 揭示 / 参考缺失 / skip 事件）必须保持通过——模板重构保留 `.source`、`.btn-reveal`、`.reference`、`.btn-skip` 这些 class 与既有 emits。

- [ ] **Step 1: 更新测试文件（保留旧 4 用例 + 新增 6 用例）**

在 `src/components/PracticeCard.test.js` 顶部 import 区之后加入模块 mock（放在所有 import 之后、用例之前）：

```js
vi.mock('../lib/tts.js', () => ({
  ttsSupported: vi.fn(() => true),
  speak: vi.fn(() => true),
  cancel: vi.fn()
}))
```

import 行补上：

```js
import { speak, ttsSupported } from '../lib/tts.js'
```

新增用例（追加到现有 describe 内或新 describe 均可）：

```js
describe('speak button (sight mode)', () => {
  it('shows source with speaker and speaks on click', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    expect(wrapper.find('.source').exists()).toBe(true)
    expect(wrapper.find('.btn-speak').exists()).toBe(true)
    await wrapper.find('.btn-speak').trigger('click')
    expect(speak).toHaveBeenCalledWith('你好', 'zh')
  })
  it('shows missing voicepack warning when speak fails', async () => {
    speak.mockReturnValueOnce(false)
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    await wrapper.find('.btn-speak').trigger('click')
    expect(wrapper.text()).toContain('语音包')
  })
  it('hides speaker when tts unsupported', () => {
    ttsSupported.mockReturnValueOnce(false)
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    expect(wrapper.find('.btn-speak').exists()).toBe(false)
  })
})

describe('listen mode', () => {
  it('hides source initially, plays on click, reveals text on demand', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en', mode: 'listen' } })
    expect(wrapper.find('.source').exists()).toBe(false)
    await wrapper.find('.btn-listen').trigger('click')
    expect(speak).toHaveBeenCalledWith('你好', 'zh')
    expect(wrapper.find('.source').exists()).toBe(false)
    await wrapper.findAll('button').find(b => b.text() === '显示原文').trigger('click')
    expect(wrapper.find('.source').exists()).toBe(true)
  })
  it('degrades to text when no voice engine', async () => {
    speak.mockReturnValueOnce(false)
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en', mode: 'listen' } })
    await wrapper.find('.btn-listen').trigger('click')
    expect(wrapper.find('.source').exists()).toBe(true)
    expect(wrapper.text()).toContain('无语音引擎')
  })
  it('resets listen state on sentence change', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en', mode: 'listen' } })
    await wrapper.findAll('button').find(b => b.text() === '显示原文').trigger('click')
    expect(wrapper.find('.source').exists()).toBe(true)
    await wrapper.setProps({ sentence: { id: 'x_002', zh: '世界', en: 'world' } })
    expect(wrapper.find('.source').exists()).toBe(false)
  })
})
```

**实现者注意**：`wrapper.findAll('button').find(...)` 若当前测试工具版本返回的是 DOMWrapper 数组，`find` 可直接用；若报错，改用：

```js
const showBtn = wrapper.findAll('button').wrappers.find(b => b.text() === '显示原文')
await showBtn.trigger('click')
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx.cmd vitest run src/components/PracticeCard.test.js`
Expected: 新 6 用例 FAIL（找不到 .btn-speak/.btn-listen），旧 4 用例 PASS

- [ ] **Step 3: 完整替换 PracticeCard.vue**

```vue
<template>
  <div class="card neu-raised" :class="{ flipped: revealed }">
    <div class="card-face">
      <span class="dir-pill">{{ direction === 'zh2en' ? '中 → 英' : '英 → 中' }}</span>
      <template v-if="mode === 'listen' && !listenTextShown && !revealed">
        <button class="btn btn-primary btn-listen" @click="onListenPlay">🎧 播放原句</button>
        <button class="btn btn-skip" @click="listenTextShown = true">显示原文</button>
        <p v-if="listenError" class="audio-warn">{{ listenError }}</p>
      </template>
      <template v-else>
        <p class="source">
          {{ sourceText }}
          <button v-if="ttsOK" class="btn-speak" title="朗读原句" @click="onSpeak">🔊</button>
        </p>
        <p v-if="speakError" class="audio-warn">{{ speakError }}</p>
        <button class="btn btn-primary btn-reveal" v-if="!revealed" @click="revealed = true; emit('revealed')">看参考译文</button>
        <div class="reference neu-inset" v-else>
          <p>{{ referenceText }}</p>
        </div>
      </template>
      <button class="btn btn-skip" @click="emit('skip')">跳过</button>
    </div>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { cancel, speak, ttsSupported } from '../lib/tts.js'

const props = defineProps({
  sentence: { type: Object, required: true },
  direction: { type: String, default: 'zh2en' },
  mode: { type: String, default: 'sight' }
})
const emit = defineEmits(['revealed', 'skip'])

const revealed = ref(false)
const listenTextShown = ref(false)
const listenError = ref('')
const speakError = ref('')
const ttsOK = ttsSupported() // 运行期不变，无需响应式

watch(() => props.sentence, () => {
  revealed.value = false
  listenTextShown.value = false
  listenError.value = ''
  speakError.value = ''
  cancel()
})

const sourceText = computed(() => (props.direction === 'zh2en' ? props.sentence.zh : props.sentence.en) || props.sentence.zh || props.sentence.en)
// 源语言按实际文本判定：自定义句可能缺 zh 或 en 字段，direction 与实际语言可能不一致
const sourceLang = computed(() => (/[\u4e00-\u9fff]/.test(sourceText.value) ? 'zh' : 'en'))
const referenceText = computed(() => {
  const t = props.direction === 'zh2en' ? props.sentence.en : props.sentence.zh
  return t || '（此句无参考译文，凭感觉评即可）'
})

function onSpeak() {
  speakError.value = ''
  if (!speak(sourceText.value, sourceLang.value)) {
    speakError.value = `设备缺少${sourceLang.value === 'zh' ? '中文' : '英文'}语音包`
  }
}

function onListenPlay() {
  listenError.value = ''
  if (!speak(sourceText.value, sourceLang.value)) {
    listenError.value = '当前设备无语音引擎，已显示原文'
    listenTextShown.value = true
  }
}

onUnmounted(() => cancel())
</script>

<style scoped>
.card { padding: 28px 20px; display: flex; justify-content: center; }
.card-face { display: flex; flex-direction: column; align-items: center; gap: 20px; width: 100%; }
.dir-pill { font-size: 12px; color: var(--accent-text); background: var(--accent-soft); border-radius: 999px; padding: 4px 12px; }
.source { font-size: 22px; line-height: 1.6; text-align: center; margin: 12px 0; }
.reference { padding: 14px 16px; width: 100%; text-align: center; font-size: 16px; line-height: 1.6; color: var(--accent-text); }
.btn-skip { font-size: 13px; opacity: 0.6; }
.btn-speak { border: none; background: none; cursor: pointer; font-size: 16px; vertical-align: middle; margin-left: 6px; opacity: 0.7; padding: 4px; }
.btn-speak:active { transform: scale(0.92); }
.audio-warn { font-size: 12px; color: #e8463a; opacity: 0.8; margin: 0; }
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx.cmd vitest run src/components/PracticeCard.test.js`
Expected: 10 passed（旧 4 + 新 6）

- [ ] **Step 5: 全量测试确认无回归**

Run: `npm.cmd run test`
Expected: 67 passed

- [ ] **Step 6: Commit**

```powershell
$env:Path += ';C:\Program Files\Git\bin'; git add src/components/PracticeCard.vue src/components/PracticeCard.test.js; git commit -m 'feat: listen mode states and speak button on practice card' -m 'degrades to text without voice engine'
```

---

### Task 5: PracticeCard 录音区

**Files:**
- Modify: `src/components/PracticeCard.vue`（在 Task 4 终稿上增量修改）
- Test: `src/components/PracticeCard.test.js`

- [ ] **Step 1: 测试文件加 recorder mock 与新用例**

import 区后追加（与 tts 的 vi.mock 并列）：

```js
vi.mock('../lib/recorder.js', () => ({
  recorderSupported: vi.fn(() => true),
  startRecording: vi.fn(async () => true),
  stopRecording: vi.fn(async () => 'blob:fake-rec'),
  revoke: vi.fn(),
  isRecording: vi.fn(() => false)
}))
```

import 行补上：

```js
import { recorderSupported, startRecording, stopRecording, revoke } from '../lib/recorder.js'
```

新用例（新 describe）：

```js
import { flushPromises } from '@vue/test-utils'

describe('recording zone', () => {
  it('hides when recorder unsupported', () => {
    recorderSupported.mockReturnValueOnce(false)
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    expect(wrapper.find('.rec-zone').exists()).toBe(false)
  })
  it('records, stops, shows playback', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    expect(wrapper.find('.rec-zone').exists()).toBe(true)
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
    expect(startRecording).toHaveBeenCalled()
    expect(wrapper.text()).toContain('停止')
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
    expect(stopRecording).toHaveBeenCalled()
    expect(wrapper.find('.rec-playback').exists()).toBe(true)
  })
  it('shows mic error when start fails', async () => {
    startRecording.mockReturnValueOnce(false)
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('无法访问麦克风')
  })
  it('revokes url on sentence change', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
    await wrapper.setProps({ sentence: { id: 'x_002', zh: '世界', en: 'world' } })
    expect(revoke).toHaveBeenCalledWith('blob:fake-rec')
    expect(wrapper.find('.rec-playback').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx.cmd vitest run src/components/PracticeCard.test.js`
Expected: 新 4 用例 FAIL（无 .rec-zone），其余 PASS

- [ ] **Step 3: 增量修改 PracticeCard.vue**

模板：在"跳过"按钮（`<button class="btn btn-skip" @click="emit('skip')">跳过</button>`）**之前**插入：

```html
      <div class="rec-zone" v-if="recOK && !revealed">
        <button v-if="!isRec" class="btn btn-rec" @click="onRecStart">🎙 录音</button>
        <button v-else class="btn btn-rec recording" @click="onRecStop">⏹ 停止</button>
        <audio v-if="recUrl" class="rec-playback" :src="recUrl" controls></audio>
      </div>
      <p v-if="recError" class="audio-warn">{{ recError }}</p>
```

script 增量——import 区加：

```js
import { recorderSupported, startRecording, stopRecording, revoke } from '../lib/recorder.js'
```

状态与函数（放在 `function onListenPlay` 之后）：

```js
const recOK = recorderSupported() // 运行期不变
const isRec = ref(false)
const recUrl = ref('')
const recError = ref('')

async function onRecStart() {
  recError.value = ''
  if (recUrl.value) { revoke(recUrl.value); recUrl.value = '' }
  const ok = await startRecording()
  isRec.value = ok
  if (!ok) recError.value = '无法访问麦克风'
}

async function onRecStop() {
  const url = await stopRecording()
  isRec.value = false
  if (url) recUrl.value = url
}
```

sentence watch 回调追加两行（保持函数体在既有 `cancel()` 之后）：

```js
  isRec.value = false
  if (recUrl.value) { revoke(recUrl.value); recUrl.value = '' }
```

onUnmounted 改为：

```js
onUnmounted(() => {
  cancel()
  if (recUrl.value) revoke(recUrl.value)
})
```

样式追加：

```css
.rec-zone { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.btn-rec { font-size: 13px; padding: 8px 16px; }
.btn-rec.recording { color: #e8463a; }
.rec-playback { width: 100%; max-width: 260px; height: 36px; }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx.cmd vitest run src/components/PracticeCard.test.js`
Expected: 14 passed

- [ ] **Step 5: 全量测试确认无回归**

Run: `npm.cmd run test`
Expected: 71 passed

- [ ] **Step 6: Commit**

```powershell
$env:Path += ';C:\Program Files\Git\bin'; git add src/components/PracticeCard.vue src/components/PracticeCard.test.js; git commit -m 'feat: session-scoped recording and playback on practice card'
```

---

### Task 6: PracticeView 接线 + 终验 + 推送

**Files:**
- Modify: `src/views/PracticeView.vue`

- [ ] **Step 1: 模板改动**

将现有（卡片下方）：

```html
      <button class="btn dir-toggle" @click="flipDirection">{{ current.direction === 'zh2en' ? '英 → 中' : '中 → 英' }}</button>
```

替换为：

```html
      <div class="toggles">
        <button class="btn dir-toggle" @click="flipDirection">{{ current.direction === 'zh2en' ? '英 → 中' : '中 → 英' }}</button>
        <div class="mode-toggle">
          <button class="btn mode-btn" :class="{ active: settings.mode === 'sight' }" @click="applyMode('sight')">视译</button>
          <button class="btn mode-btn" :class="{ active: settings.mode === 'listen' }" @click="applyMode('listen')">听辨</button>
        </div>
      </div>
```

PracticeCard 行补 mode 透传：

```html
      <PracticeCard :sentence="current.sentence" :direction="current.direction" :mode="settings.mode" @revealed="onRevealed" @skip="next(false)" />
```

- [ ] **Step 2: script 改动**

import 区补两行：

```js
import { settings, setMode } from '../stores/settings.js'
import { cancel } from '../lib/tts.js'
```

（现有 `import { settings } from '../stores/settings.js'` 一行替换为上面第一行，勿重复 import settings。）

`flipDirection` 函数之后新增：

```js
function applyMode(m) {
  if (m === settings.value.mode) return
  cancel() // 切模式立即停止朗读
  setMode(m)
}
```

`onUnmounted` 改为：

```js
onUnmounted(() => { clearInterval(timerId); cancel() })
```

- [ ] **Step 3: 样式改动**

`.dir-toggle` 规则由 `display: block; margin: 20px auto 0; ...` 改为：

```css
.toggles { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
.dir-toggle { font-size: 13px; opacity: 0.7; }
.mode-toggle { display: flex; gap: 4px; }
.mode-btn { font-size: 13px; opacity: 0.7; padding: 8px 12px; }
.mode-btn.active { opacity: 1; color: var(--accent-text); box-shadow: var(--shadow-in); }
```

- [ ] **Step 4: 全量测试 + 构建**

Run: `npm.cmd run test`
Expected: 71 passed

Run: `npm.cmd run build`
Expected: `✓ built`

- [ ] **Step 5: Commit**

```powershell
$env:Path += ';C:\Program Files\Git\bin'; git add src/views/PracticeView.vue; git commit -m 'feat: sight and listen mode toggle on practice view'
```

- [ ] **Step 6: 推送（触发 GitHub Pages 自动部署）**

```powershell
$env:Path += ';C:\Program Files\Git\bin'; git push
```

Expected: master → origin/master 同步。约 1 分钟后 https://lynn-hub123.github.io/interpret/ 更新。

- [ ] **Step 7: 真机手工验收（转述给用户）**

无法自动化，交用户按以下清单验收（需真实麦克风与扬声器）：
1. 听感：听辨模式点 🎧 能听到中文/英文原句；发音清晰度依设备语音包而定
2. 先听后看：听辨卡片无文字 → 点"显示原文"出现文字；再次抽句后状态重置
3. 降级：无语音引擎设备点播放 → 自动显示原文 + 提示
4. 模式切换记住选择：切到听辨 → 刷新页面仍是听辨
5. 录音：点 🎙 说话 → 停止 → 出现回放控件可播放；换句后回放消失
6. 麦克风权限：首次点录音浏览器弹授权；拒绝后提示"无法访问麦克风"，重新授权可恢复
7. 中途翻面/切页：朗读立即停止
8. PWA 安装场景：手机安装后进入听辨/录音各试一次（iOS PWA 窗口 TTS 有历史兼容问题，降级路径生效即算通过）
