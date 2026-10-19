# 语音识别转文字（跟录音绑定）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 点「🎙 录音」时同步启动 Web Speech API 识别，口译输出实时逐字显示在录音区内，停止后保留；识别任何失败不影响录音主功能。

**Architecture:** 新建 `src/lib/speech.js` 模块级单例状态机（与 recorder.js 同风格），内部自治断流重启，视图层只调 start/stop 收回调；PracticeCard 接线复用现有录音生命周期（onRecStart/onRecStop/换句 watch/卸载清理）。

**Tech Stack:** Vue 3 `<script setup>` + Vitest happy-dom；Web Speech API（`SpeechRecognition` / `webkitSpeechRecognition`）。

**规格：** `docs/superpowers/specs/2026-10-19-speech-recognition-design.md`（已批准）

---

**环境备忘（Windows PowerShell 5）：**

- npm/npx 一律 `.cmd` 后缀（`npm.cmd` / `npx.cmd`）；多命令用 `;` 分隔，禁用 `&&`；提交信息中文单行无空格
- PowerShell profile 报错（ExecutionPolicy/CLIXML）是噪音，忽略
- **PracticeCard.vue 有工具层 Edit 显示成功但未落盘的已知异常**：每次编辑后必须 `git diff` 核验落盘内容；若未落盘，改用 Node 脚本写入再核验
- 沙箱拦截时命令加 `dangerouslyDisableSandbox`

**文件结构：**

| 文件 | 动作 | 职责 |
|------|------|------|
| `src/lib/speech.js` | 新建 | 识别状态机：能力检测/启动/停止/自动重启/错误分发 |
| `src/lib/speech.test.js` | 新建 | speech.js 单测（FakeRecognition 桩类） |
| `src/components/PracticeCard.vue` | 修改 | 接线 + 识别文字区 UI + CSS |
| `src/components/PracticeCard.test.js` | 修改 | speech mock + 接线用例 |

---

### Task 1: speech.js 纯函数库（TDD）

**Files:**
- Create: `src/lib/speech.js`
- Create: `src/lib/speech.test.js`

- [ ] **Step 1: 写失败测试 `src/lib/speech.test.js`**

```js
import { describe, it, expect, vi, afterEach } from 'vitest'
import { speechSupported, start, stop } from './speech.js'

class FakeRecognition {
  constructor() {
    this.lang = ''
    this.continuous = false
    this.interimResults = false
    this.onresult = null
    this.onerror = null
    this.onend = null
    this.started = false
    this.stopped = false
    this.aborted = false
    FakeRecognition.all.push(this)
  }
  start() { this.started = true }
  stop() { this.stopped = true }
  abort() { this.aborted = true }
  // —— 测试辅助：模拟引擎事件 ——
  emitFinal(transcript) { this.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript } }] }) }
  emitInterim(transcript) { this.onresult({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript } }] }) }
  emitError(name) { this.onerror({ error: name }) }
  emitEnd() { this.onend() }
}
FakeRecognition.all = []

function install(webkitOnly = false) {
  FakeRecognition.all = []
  if (!webkitOnly) window.SpeechRecognition = FakeRecognition
  window.webkitSpeechRecognition = FakeRecognition
}

afterEach(() => {
  delete window.SpeechRecognition
  delete window.webkitSpeechRecognition
  FakeRecognition.all = []
})

describe('speechSupported', () => {
  it('true when native API exists', () => {
    install()
    expect(speechSupported()).toBe(true)
  })
  it('true when only webkit prefix exists', () => {
    install(true)
    expect(speechSupported()).toBe(true)
  })
  it('false when neither exists', () => {
    expect(speechSupported()).toBe(false)
  })
})

describe('start', () => {
  it('returns false and does nothing when unsupported', () => {
    expect(start('en-US', {})).toBe(false)
  })
  it('configures lang/continuous/interim and starts', () => {
    install()
    expect(start('zh-CN', {})).toBe(true)
    const rec = FakeRecognition.all[0]
    expect(rec.lang).toBe('zh-CN')
    expect(rec.continuous).toBe(true)
    expect(rec.interimResults).toBe(true)
    expect(rec.started).toBe(true)
  })
  it('dispatches final and interim transcripts', () => {
    install()
    const finals = []; const interims = []
    start('en-US', { onFinal: t => finals.push(t), onInterim: t => interims.push(t) })
    const rec = FakeRecognition.all[0]
    rec.emitFinal('Hello world.')
    rec.emitInterim('how are')
    expect(finals).toEqual(['Hello world.'])
    expect(interims).toEqual(['how are'])
  })
  it('restarts with same lang when onend fires (not manual)', () => {
    install()
    start('en-US', {})
    FakeRecognition.all[0].emitEnd()
    expect(FakeRecognition.all.length).toBe(2)
    expect(FakeRecognition.all[1].lang).toBe('en-US')
    expect(FakeRecognition.all[1].started).toBe(true)
  })
  it('repeated start aborts old session and spawns new one', () => {
    install()
    start('en-US', {})
    const first = FakeRecognition.all[0]
    start('zh-CN', {})
    expect(first.aborted).toBe(true)
    expect(FakeRecognition.all.length).toBe(2)
    expect(FakeRecognition.all[1].lang).toBe('zh-CN')
  })
  it('ignores stale events from replaced instance', () => {
    install()
    const onError = vi.fn()
    start('en-US', { onFinal: () => {}, onInterim: () => {}, onError })
    const stale = FakeRecognition.all[0]
    start('zh-CN', {})
    stale.emitEnd()
    stale.emitError('network')
    expect(FakeRecognition.all.length).toBe(2)
    expect(onError).not.toHaveBeenCalled()
  })
  it('stop() is graceful then manual end does not restart', () => {
    install()
    start('en-US', {})
    const rec = FakeRecognition.all[0]
    stop()
    expect(rec.stopped).toBe(true)
    rec.emitEnd()
    expect(FakeRecognition.all.length).toBe(1)
  })
  it('stop() when idle is a safe no-op', () => {
    expect(() => stop()).not.toThrow()
  })
})

describe('error handling', () => {
  it('no-speech is silent and still restarts', () => {
    install()
    const onError = vi.fn()
    start('en-US', { onFinal: () => {}, onInterim: () => {}, onError })
    const rec = FakeRecognition.all[0]
    rec.emitError('no-speech')
    rec.emitEnd()
    expect(onError).not.toHaveBeenCalled()
    expect(FakeRecognition.all.length).toBe(2)
  })
  it('aborted is silent', () => {
    install()
    const onError = vi.fn()
    start('en-US', { onFinal: () => {}, onInterim: () => {}, onError })
    FakeRecognition.all[0].emitError('aborted')
    expect(onError).not.toHaveBeenCalled()
  })
  it('not-allowed is fatal: onError fired and no restart', () => {
    install()
    const onError = vi.fn()
    start('en-US', { onFinal: () => {}, onInterim: () => {}, onError })
    const rec = FakeRecognition.all[0]
    rec.emitError('not-allowed')
    rec.emitEnd()
    expect(onError).toHaveBeenCalledWith('not-allowed')
    expect(FakeRecognition.all.length).toBe(1)
  })
  it('service-not-allowed normalizes to not-allowed', () => {
    install()
    const onError = vi.fn()
    start('en-US', { onFinal: () => {}, onInterim: () => {}, onError })
    FakeRecognition.all[0].emitError('service-not-allowed')
    expect(onError).toHaveBeenCalledWith('not-allowed')
  })
  it('network is fatal', () => {
    install()
    const onError = vi.fn()
    start('en-US', { onFinal: () => {}, onInterim: () => {}, onError })
    FakeRecognition.all[0].emitError('network')
    expect(onError).toHaveBeenCalledWith('network')
  })
  it('unknown error names pass through as fatal', () => {
    install()
    const onError = vi.fn()
    start('en-US', { onFinal: () => {}, onInterim: () => {}, onError })
    FakeRecognition.all[0].emitError('weird-error')
    expect(onError).toHaveBeenCalledWith('weird-error')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx.cmd vitest run src/lib/speech.test.js`
Expected: FAIL（`Cannot find module './speech.js'` 或导入为空）

- [ ] **Step 3: 实现 `src/lib/speech.js`**

```js
// 语音识别封装：Web Speech API 单例状态机（Chrome/Edge/Safari 支持，Firefox 无此 API）。
// 识别为会话级：跟录音绑定启停，文字仅供实时展示，不持久化。
// 内部自治重启：静音/单句结束触发 onend 时自动重启，直到手动 stop 或致命错误。
export function speechSupported() {
  return typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

const state = { rec: null, manual: false }

// handlers = { onFinal(text), onInterim(text), onError(name) }
// 返回 boolean；重复 start 先 abort 旧会话（幂等，避免旧 final 串入新会话）
export function start(lang, handlers) {
  if (!speechSupported()) return false
  stopSession(true)
  state.manual = false
  spawn(lang, handlers)
  return true
}

// 手动停止：优雅停（rec.stop），最后半句 final 仍会吐出；不再自动重启
export function stop() {
  stopSession(false)
}

function stopSession(abort) {
  state.manual = true
  const rec = state.rec
  state.rec = null
  if (rec) { try { abort ? rec.abort() : rec.stop() } catch { /* 已停止/未启动，忽略 */ } }
}

function spawn(lang, handlers) {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
  const rec = new Ctor()
  rec.lang = lang
  rec.continuous = true
  rec.interimResults = true
  rec.onresult = e => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      if (r.isFinal) handlers.onFinal(r[0].transcript)
      else handlers.onInterim(r[0].transcript)
    }
  }
  rec.onerror = e => {
    if (state.rec !== rec) return // 已被新会话顶替的旧实例，静默
    const name = (e && e.error) || ''
    if (name === 'no-speech' || name === 'aborted') return // 瞬态：交给 onend 决定重启
    state.manual = true // 致命：停止重启循环
    handlers.onError(name === 'service-not-allowed' ? 'not-allowed' : name)
  }
  rec.onend = () => {
    if (state.rec !== rec) return // 旧实例不再接管
    state.rec = null
    if (!state.manual) spawn(lang, handlers) // 断流自动重启
  }
  state.rec = rec
  try {
    rec.start()
  } catch {
    stopSession(true) // start 抛错（状态非法等）：按致命收场
    handlers.onError('unknown')
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx.cmd vitest run src/lib/speech.test.js`
Expected: PASS（17 用例全绿）

- [ ] **Step 5: 提交**

```powershell
git add src/lib/speech.js src/lib/speech.test.js
git commit -m "语音识别speech封装与单元测试"
```

---

### Task 2: PracticeCard 接线（TDD）

**Files:**
- Modify: `src/components/PracticeCard.vue`（template rec-zone、script 接线、scoped CSS）
- Modify: `src/components/PracticeCard.test.js`（speech mock + 新 describe 块）

- [ ] **Step 1: 加 speech mock 与接线用例**

`src/components/PracticeCard.test.js` 顶部（现有 vi.mock 块之后）加：

```js
vi.mock('../lib/speech.js', () => ({
  speechSupported: vi.fn(() => true),
  start: vi.fn(() => true),
  stop: vi.fn()
}))
```

import 区加（从 speech.js 导入）：

```js
import { speechSupported, start as srStart, stop as srStop } from '../lib/speech.js'
```

现有 `afterEach` 追加重置：

```js
afterEach(() => {
  // ……现有 playText/tts 重置保持不动……
  speechSupported.mockReturnValue(true)
  srStart.mockClear()
  srStop.mockClear()
})
```

文件末尾追加新 describe 块：

```js
describe('speech recognition zone', () => {
  const srSentence = { id: 'x_001', zh: '你好', en: 'hello' }

  it('hides recognition ui and skips start when unsupported', async () => {
    speechSupported.mockReturnValueOnce(false)
    const wrapper = mount(PracticeCard, { props: { sentence: srSentence, direction: 'zh2en' } })
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
    expect(srStart).not.toHaveBeenCalled()
    expect(wrapper.find('.rec-sr').exists()).toBe(false)
    expect(wrapper.find('.rec-zone').exists()).toBe(true)
  })

  it('starts recognition with target language by direction', async () => {
    const w1 = mount(PracticeCard, { props: { sentence: srSentence, direction: 'zh2en' } })
    await w1.find('.btn-rec').trigger('click')
    await flushPromises()
    expect(srStart.mock.calls.at(-1)[0]).toBe('en-US')
    const w2 = mount(PracticeCard, { props: { sentence: srSentence, direction: 'en2zh' } })
    await w2.find('.btn-rec').trigger('click')
    await flushPromises()
    expect(srStart.mock.calls.at(-1)[0]).toBe('zh-CN')
  })

  it('renders interim and final text from handlers', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence: srSentence, direction: 'zh2en' } })
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
    const handlers = srStart.mock.calls.at(-1)[1]
    handlers.onFinal('Hello world.')
    handlers.onInterim('how are')
    await nextTick()
    const sr = wrapper.find('.rec-sr')
    expect(sr.text()).toContain('Hello world.')
    expect(sr.text()).toContain('how are')
    expect(wrapper.find('.sr-interim').exists()).toBe(true)
  })

  it('joins english finals with space and chinese finals directly', async () => {
    const w1 = mount(PracticeCard, { props: { sentence: srSentence, direction: 'zh2en' } })
    await w1.find('.btn-rec').trigger('click')
    await flushPromises()
    let h = srStart.mock.calls.at(-1)[1]
    h.onFinal('Hello.'); h.onFinal('How are you.')
    await nextTick()
    expect(w1.find('.rec-sr').text()).toContain('Hello. How are you.')
    const w2 = mount(PracticeCard, { props: { sentence: srSentence, direction: 'en2zh' } })
    await w2.find('.btn-rec').trigger('click')
    await flushPromises()
    h = srStart.mock.calls.at(-1)[1]
    h.onFinal('你好。'); h.onFinal('今天天气不错。')
    await nextTick()
    expect(w2.find('.rec-sr').text()).toContain('你好。今天天气不错。')
  })

  it('keeps text after stopping recording', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence: srSentence, direction: 'zh2en' } })
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
    srStart.mock.calls.at(-1)[1].onFinal('Hello world.')
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
    expect(wrapper.find('.rec-sr').text()).toContain('Hello world.')
    expect(srStop).toHaveBeenCalled()
  })

  it('clears text on rerecord', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence: srSentence, direction: 'zh2en' } })
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
    srStart.mock.calls.at(-1)[1].onFinal('Hello world.')
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
    expect(wrapper.find('.rec-sr').exists()).toBe(false)
  })

  it('shows sr error without breaking recording zone', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence: srSentence, direction: 'zh2en' } })
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
    srStart.mock.calls.at(-1)[1].onError('network')
    await nextTick()
    expect(wrapper.text()).toContain('需联网')
    expect(wrapper.find('.rec-zone').exists()).toBe(true)
    expect(wrapper.find('.btn-rec.recording').exists()).toBe(true)
  })

  it('clears text and stops recognition on sentence change', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence: srSentence, direction: 'zh2en' } })
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
    srStart.mock.calls.at(-1)[1].onFinal('Hello world.')
    await wrapper.setProps({ sentence: { id: 'x_002', zh: '世界', en: 'world' } })
    expect(wrapper.find('.rec-sr').exists()).toBe(false)
    expect(srStop).toHaveBeenCalled()
  })

  it('stops recognition on unmount', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence: srSentence, direction: 'zh2en' } })
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
    wrapper.unmount()
    expect(srStop).toHaveBeenCalled()
  })
})
```

注意：`nextTick` 已在该测试文件顶部导入（`import { nextTick } from 'vue'`），无需重复。

- [ ] **Step 2: 运行确认失败**

Run: `npx.cmd vitest run src/components/PracticeCard.test.js`
Expected: FAIL（新增用例大多失败：`.rec-sr` 不存在、srStart 未被调用等）

- [ ] **Step 3: 改 PracticeCard.vue — script 接线**

import 区追加：

```js
import { speechSupported, start as srStart, stop as srStop } from '../lib/speech.js'
```

换句 watch（`watch(() => props.sentence, ...)`）改为（新增 srStop 与三个 ref 清空两行）：

```js
watch(() => props.sentence, () => {
  revealed.value = false
  listenTextShown.value = false
  listenError.value = ''
  speakError.value = ''
  stop()
  playing.value = false
  isRec.value = false
  stopRecTimer()
  srStop() // 防旧句识别跨句继续出字
  recFinal.value = ''; recInterim.value = ''; srError.value = ''
  if (recUrl.value) { revoke(recUrl.value); recUrl.value = '' }
})
```

`onRecStart` 改为（清空行 + 启动识别行）：

```js
async function onRecStart() {
  recError.value = ''
  if (recUrl.value) { revoke(recUrl.value); recUrl.value = '' }
  recFinal.value = ''; recInterim.value = ''; srError.value = '' // 文字与回放同生命周期
  const ok = await startRecording()
  isRec.value = ok && alive
  if (ok && alive) startRecTimer()
  if (ok && alive && srOK) srStart(srLang.value, srHandlers)
  if (!ok) recError.value = REC_ERROR_TEXT[lastErrorName()] || '无法访问麦克风'
}
```

`onRecStop` 改为（加 srStop）：

```js
async function onRecStop() {
  stopRecTimer()
  srStop()
  const url = await stopRecording()
  isRec.value = false
  if (url) recUrl.value = url
}
```

`onUnmounted` 改为（加 srStop）：

```js
onUnmounted(() => {
  alive = false
  stop()
  srStop()
  stopRecTimer()
  if (recUrl.value) revoke(recUrl.value)
})
```

`recOK` 声明之后新增整段（识别状态与回调）：

```js
// —— 语音识别：跟录音绑定，识别是增强功能，任何失败不影响录音 ——
const srOK = speechSupported()
const recFinal = ref('')
const recInterim = ref('')
const srError = ref('')
const srLang = computed(() => (props.direction === 'zh2en' ? 'en-US' : 'zh-CN'))
const SR_ERROR_TEXT = {
  'not-allowed': '语音识别权限被拒，可在地址栏允许后重试；录音不受影响',
  network: '语音识别服务不可用（需联网）；录音不受影响',
  'audio-capture': '麦克风不可用于识别；录音不受影响'
}
function onSrFinal(text) {
  if (!text) return
  recFinal.value += (props.direction === 'zh2en' && recFinal.value ? ' ' : '') + text
}
function onSrInterim(text) { recInterim.value = text }
const srHandlers = {
  onFinal: onSrFinal,
  onInterim: onSrInterim,
  onError: name => { srError.value = SR_ERROR_TEXT[name] || '语音识别暂不可用；录音不受影响' }
}
```

- [ ] **Step 4: 改 PracticeCard.vue — template 与 CSS**

rec-zone 内、`.rec-live` 之后 `RecPlayback` 之前插入识别文字区与错误行：

```html
        <p v-if="recFinal || recInterim" class="rec-sr">
          <span>{{ recFinal }}</span><span v-if="recInterim" class="sr-interim">{{ recInterim }}</span>
        </p>
        <p v-if="srError" class="audio-warn">{{ srError }}</p>
```

scoped style 末尾（`.rec-actions` 相关规则之后、`@keyframes` 之前）追加：

```css
.rec-sr { font-size: 13px; line-height: 1.6; color: var(--text-muted); text-align: center; margin: 0; }
.sr-interim { opacity: 0.45; }
```

- [ ] **Step 5: git diff 核验落盘（必做）**

Run: `git diff --stat; git diff src/components/PracticeCard.vue | Select-String -Pattern 'rec-sr|srStart|srStop' | Select-Object -First 10`
Expected: diff 中可见上述新增内容；若 diff 为空说明写盘异常，改用 Node 脚本写入后重新核验

- [ ] **Step 6: 运行确认通过**

Run: `npx.cmd vitest run src/components/PracticeCard.test.js`
Expected: PASS（原 45 个左右用例 + 新 9 个全绿）

- [ ] **Step 7: 提交**

```powershell
git add src/components/PracticeCard.vue src/components/PracticeCard.test.js
git commit -m "练习卡接线录音同步语音识别"
```

---

### Task 3: 全量回归 + 构建上线 + 线上验证

**Files:** 无代码改动（验证与发布）

- [ ] **Step 1: 全量测试**

Run: `npm.cmd run test`
Expected: 全部用例通过（此前基线 169 + 新增 26 ≈ 195）

- [ ] **Step 2: 构建**

Run: `npm.cmd run build`
Expected: 构建成功无报错

- [ ] **Step 3: push**

```powershell
git push
```

Expected: push 成功，CI（Actions node 22）触发

- [ ] **Step 4: 线上部署确认（勿用本地 dist 哈希比对）**

Run: `curl.exe -s -x http://127.0.0.1:7897 https://lynn-hub123.github.io/interpret/sw.js | Select-String -Pattern 'index-[A-Za-z0-9_-]+\.js' -AllMatches | ForEach-Object { $_.Matches.Value } | Select-Object -Unique`
Expected: 资产名 ≠ 当前 HEAD 构建名（本轮 push 前线上为 `index-C_Wk8jWe.js`）；CI 部署历史耗时 2.5-12 分钟，未生效则等待后重查（最多 3 次，仍不行查 Actions）

- [ ] **Step 5: 真机验收清单（转交用户，建议 Edge）**

1. 点「🎙 录音」说一句英文 → 文字实时出现在录音按钮下方，未定稿半透明、定稿正常色
2. 点「⏹ 停止」→ 录音回放出现，文字保留在回放上方
3. 点「↻ 重录」→ 文字清空重新识别
4. 中→英识别英文、英→中识别中文
5. 断网再录 → 红字「语音识别服务不可用（需联网）；录音不受影响」，录音与回放正常
6. Firefox 打开 → 无任何识别 UI 痕迹，录音照常

---

## 自审记录

- **规格覆盖**：§1 speech.js → Task 1；§2 接线 → Task 2 Step 3；§3 UI/文案/CSS → Task 2 Step 3-4；§4 测试 → Task 1 Step 1 + Task 2 Step 1；§5 明确不做 → 无对应代码（正确）；§6 风险 → Task 3 Step 5 验收清单。无缺口
- **占位符**：无 TBD/TODO；所有代码步骤含完整代码
- **类型一致性**：`speechSupported/start/stop` 导出名与两处导入一致；handlers 三键 `onFinal/onInterim/onError` 在 lib、视图、测试三处一致；`srLang` 取值 `en-US`/`zh-CN` 一致
- **已知偏差修正**：换句 watch 中 srStop 无条件调用（未录音时为安全 no-op），测试断言「被调用」不受影响
