# 复述模式实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增源语复述练习模式（第三种模式），含语速切换、不限次重听、盲听自评。

**Architecture:** 零新增 lib 模块，全部为现有模块定向扩展：settings/tts/voice 加可选参数（默认值保证旧调用零改动），PracticeCard 加 retell 分支，PracticeView 接线评分提前显示。评分/调度/记录走现有通道零改动。

**Tech Stack:** Vue 3 + Vitest(happy-dom)。TDD，每任务独立提交。

**规格：** `docs/superpowers/specs/2026-10-21-retell-mode-design.md`（已批准）
**原型：** `docs/superpowers/prototypes/2026-10-21-retell-mode-prototype.html`（已验证）

**环境注意（PowerShell 5）：** 多命令用 `;` 分隔不用 `&&`；npm 命令直接可用；改完 PracticeCard.vue 必须 `git diff` 核验落盘（工具层曾出现假成功）。

---

### Task 1: settings.setMode 扩 retell

**Files:**
- Modify: `src/stores/settings.js:23-27`
- Test: `src/stores/settings.test.js`（describe 'mode setting' 内追加）

- [ ] **Step 1: 写失败测试**

在 `src/stores/settings.test.js` 的 `describe('mode setting', ...)` 内追加：

```js
  it('setMode accepts retell and persists', () => {
    expect(setMode('retell')).toBe(true)
    expect(settings.value.mode).toBe('retell')
    expect(JSON.parse(localStorage.getItem('interpret.settings.v1')).mode).toBe('retell')
  })
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- src/stores/settings.test.js`
Expected: FAIL — `expect(setMode('retell')).toBe(true)` 收到 false

- [ ] **Step 3: 最小实现**

`src/stores/settings.js` 的 setMode 改为：

```js
export function setMode(v) {
  if (v !== 'sight' && v !== 'listen' && v !== 'retell') return false
  settings.value.mode = v
  return saveSettings()
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- src/stores/settings.test.js`
Expected: PASS（全部用例绿）

- [ ] **Step 5: 提交**

```bash
git add src/stores/settings.js src/stores/settings.test.js
git commit -m "feat: setMode accepts retell"
```

---

### Task 2: tts.speak 加 rate 参数

**Files:**
- Modify: `src/lib/tts.js:19-32`
- Test: `src/lib/tts.test.js`（describe 'tts' 内追加）

- [ ] **Step 1: 写失败测试**

在 `src/lib/tts.test.js` 的 `describe('tts', ...)` 内追加：

```js
  it('speak forwards rate to utterance', () => {
    const calls = stubSynth()
    speak('你好', 'zh', null, 0.75)
    expect(calls.speak[0].rate).toBe(0.75)
  })
  it('speak defaults rate to 1', () => {
    const calls = stubSynth()
    speak('你好', 'zh')
    expect(calls.speak[0].rate).toBe(1)
  })
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- src/lib/tts.test.js`
Expected: FAIL — `rate` 为 undefined

- [ ] **Step 3: 最小实现**

`src/lib/tts.js` 的 speak 改为（签名与 `u.rate` 两行）：

```js
export function speak(text, lang, onend, rate = 1) {
  if (!ttsSupported()) return false
  const synth = window.speechSynthesis
  cancel()
  const v = voicesFor(lang)
  // 语音列表非空但缺该语言语音包 → 失败；列表为空（Chrome 首次异步加载）→ 交给引擎默认语音
  if (synth.getVoices().length && !v) return false
  const u = new window.SpeechSynthesisUtterance(text)
  u.lang = lang === 'zh' ? 'zh-CN' : 'en-US'
  if (v) u.voice = v
  u.rate = rate
  if (onend) u.onend = onend
  synth.speak(u)
  return true
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- src/lib/tts.test.js`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/tts.js src/lib/tts.test.js
git commit -m "feat: speak accepts optional rate"
```

---

### Task 3: voice.playText 加 rate 参数

**Files:**
- Modify: `src/lib/voice.js:24-48`
- Test: `src/lib/voice.test.js`

- [ ] **Step 1: 写失败测试**

在 `src/lib/voice.test.js` 的 `describe('voice.playText', ...)` 内追加：

```js
  it('builtin applies rate to prerecorded audio', async () => {
    const p = playText({ id: 'a', source: 'builtin', text: 'a', lang: 'zh', rate: 0.75 })
    expect(FakeAudio.instances[0].playbackRate).toBe(0.75)
    FakeAudio.instances[0].onended()
    await expect(p).resolves.toBe('played')
  })
  it('default rate does not touch playbackRate, tts fallback forwards rate', async () => {
    const p = playText({ id: 'a', source: 'builtin', text: 'a', lang: 'zh', rate: 1.25 })
    expect(FakeAudio.instances[0].playbackRate).toBe(1.25)
    FakeAudio.instances[0].onerror()
    expect(speak).toHaveBeenCalledWith('a', 'zh', expect.any(Function), 1.25)
    speak.mock.calls[0][2]()
    await expect(p).resolves.toBe('played')
  })
  it('omitted rate leaves playbackRate untouched and tts fallback gets rate 1', async () => {
    const p = playText({ id: 'a', source: 'builtin', text: 'a', lang: 'zh' })
    expect(FakeAudio.instances[0].playbackRate).toBeUndefined()
    FakeAudio.instances[0].onerror()
    expect(speak).toHaveBeenCalledWith('a', 'zh', expect.any(Function), 1)
    speak.mock.calls[0][2]()
    await expect(p).resolves.toBe('played')
  })
```

同时把现有断言 `expect(speak).toHaveBeenCalledWith('hi', 'en', expect.any(Function))`（'falls back to TTS when audio errors' 用例内）改为：

```js
    expect(speak).toHaveBeenCalledWith('hi', 'en', expect.any(Function), 1)
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- src/lib/voice.test.js`
Expected: FAIL — 新用例 `playbackRate`/`rate` 断言不满足

- [ ] **Step 3: 最小实现**

`src/lib/voice.js` 的 playText 改为：

```js
// Promise<'played' | 'stopped' | 'failed'>：正常播完 / 被新播放或 stop() 打断 / 兜底 TTS 也不可用
// rate：语速（0.75/1/1.25），MP3 走 playbackRate（preservesPitch 默认 true 变速不变调），TTS 透传
export function playText({ id, source, text, lang, rate = 1 }) {
  stop() // 播新停旧
  return new Promise(resolve => {
    let state = null
    const settle = r => {
      if (!state || state.done) return
      state.done = true
      if (current === state) current = null
      detachAudio(state.audio)
      resolve(r)
    }
    state = { audio: null, done: false, settle }
    current = state // custom 句 TTS 播放期间也要可被 stop()
    // TTS 播放：custom 句直接走此路径；builtin 句音频失败后也落到这里
    const speakFallback = () => {
      const ok = speak(text, lang, () => settle('played'), rate)
      if (!ok) settle('failed')
    }
    if (source !== 'builtin') { speakFallback(); return }
    const audio = new Audio(`${import.meta.env.BASE_URL}audio/${id}.${lang}.mp3`)
    state.audio = audio
    audio.playbackRate = rate
    audio.onended = () => settle('played')
    audio.onerror = () => speakFallback()
    audio.play().catch(() => {}) // 播放失败最终会走 onerror 回退 TTS；autoplay 策略拒绝（NotAllowedError）只拒 promise 不触发 error，此处静默（接线处均为点击触发，有用户激活）
  })
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- src/lib/voice.test.js`
Expected: PASS（注意 FakeAudio 无 playbackRate 预设属性，断言 undefined 路径成立）

- [ ] **Step 5: 提交**

```bash
git add src/lib/voice.js src/lib/voice.test.js
git commit -m "feat: playText accepts optional rate"
```

---

### Task 4: RatingButtons variant 文案

**Files:**
- Modify: `src/components/RatingButtons.vue`
- Test: `src/components/RatingButtons.test.js`

- [ ] **Step 1: 写失败测试**

在 `src/components/RatingButtons.test.js` 的 `describe('RatingButtons', ...)` 内追加：

```js
  it('retell variant shows retell labels with same emit values', async () => {
    const w = mount(RatingButtons, { props: { variant: 'retell' } })
    const btns = w.findAll('button')
    expect(btns.map(b => b.text())).toEqual(['流畅', '磕绊', '没记住'])
    await btns[0].trigger('click')
    expect(w.emitted('rate')).toEqual([['ok']])
  })
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- src/components/RatingButtons.test.js`
Expected: FAIL — 文案仍是 能译/磕绊/不会

- [ ] **Step 3: 最小实现**

`src/components/RatingButtons.vue` 的 script 部分改为：

```js
const props = defineProps({
  variant: { type: String, default: 'translate' }
})
const emit = defineEmits(['rate'])
const LABELS = {
  translate: [
    { value: 'ok', label: '能译' },
    { value: 'shaky', label: '磕绊' },
    { value: 'miss', label: '不会' }
  ],
  retell: [
    { value: 'ok', label: '流畅' },
    { value: 'shaky', label: '磕绊' },
    { value: 'miss', label: '没记住' }
  ]
}
const ratings = LABELS[props.variant] || LABELS.translate
```

（template 与 style 不动；`props` 声明替代原裸 `defineEmits` 上方注释行，保留 `const emit = defineEmits(['rate'])` 原行）

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- src/components/RatingButtons.test.js`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/RatingButtons.vue src/components/RatingButtons.test.js
git commit -m "feat: RatingButtons retell variant labels"
```

---

### Task 5: PracticeCard retell 分支

**Files:**
- Modify: `src/components/PracticeCard.vue`（template 分支 + script 逻辑 + style 追加）
- Test: `src/components/PracticeCard.test.js`（新增 describe 'retell mode'）

- [ ] **Step 1: 写失败测试**

在 `src/components/PracticeCard.test.js` 末尾追加：

```js
const RETELL_SPEEDS = ['0.75x', '1x', '1.25x']

describe('retell mode', () => {
  it('hides source text and shows speed control on front', () => {
    const wrapper = mount(PracticeCard, { props: { sentence, direction: 'zh2en', mode: 'retell' } })
    expect(wrapper.text()).not.toContain('你好。')
    expect(wrapper.find('.speed-seg').exists()).toBe(true)
    expect(wrapper.findAll('.speed-btn').map(b => b.text())).toEqual(RETELL_SPEEDS)
  })
  it('plays with rate from speed control', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence, direction: 'zh2en', mode: 'retell' } })
    await wrapper.findAll('.speed-btn')[0].trigger('click') // 0.75x
    await wrapper.find('.btn-listen').trigger('click')
    await flushPromises()
    expect(playText).toHaveBeenCalledWith(expect.objectContaining({ text: '你好', lang: 'zh', rate: 0.75 }))
    expect(wrapper.find('.btn-listen').text()).toBe('↻ 重听')
  })
  it('shows play label initially and stop while playing', async () => {
    playText.mockImplementation(() => new Promise(() => {}))
    const wrapper = mount(PracticeCard, { props: { sentence, direction: 'zh2en', mode: 'retell' } })
    expect(wrapper.find('.btn-listen').text()).toBe('▶ 播放原句')
    await wrapper.find('.btn-listen').trigger('click')
    await flushPromises()
    expect(wrapper.find('.btn-listen').text()).toBe('⏹ 停止')
  })
  it('recognizes source language: zh2en sentence retells zh (opposite of translate modes)', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence, direction: 'zh2en', mode: 'retell' } })
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
    expect(srStart).toHaveBeenCalledWith('zh-CN', expect.anything())
  })
  it('emits recStopped on stop and shows reveal button only after recording', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence, direction: 'zh2en', mode: 'retell' } })
    expect(wrapper.find('.btn-reveal').exists()).toBe(false)
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('recStopped')).toBeFalsy()
    await wrapper.find('.btn-rec.recording').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('recStopped')).toBeTruthy()
    expect(wrapper.find('.btn-reveal').exists()).toBe(true)
  })
  it('reveal shows source and reference together in one step', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence, direction: 'zh2en', mode: 'retell' } })
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
    await wrapper.find('.btn-rec.recording').trigger('click')
    await flushPromises()
    await wrapper.find('.btn-reveal').trigger('click')
    expect(wrapper.text()).toContain('你好。')
    expect(wrapper.text()).toContain('Hello.')
    expect(wrapper.text()).toContain('参考译文')
    expect(wrapper.emitted('revealed')).toBeTruthy()
  })
  it('auto-reveals when play fails (no speech engine)', async () => {
    playText.mockResolvedValueOnce('failed')
    const wrapper = mount(PracticeCard, { props: { sentence, direction: 'zh2en', mode: 'retell' } })
    await wrapper.find('.btn-listen').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('无语音引擎')
    expect(wrapper.emitted('revealed')).toBeTruthy()
  })
  it('keeps speed across sentence change but resets played/recDone state', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence, direction: 'zh2en', mode: 'retell' } })
    await wrapper.findAll('.speed-btn')[2].trigger('click') // 1.25x
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
    await wrapper.find('.btn-rec.recording').trigger('click')
    await flushPromises()
    expect(wrapper.find('.btn-reveal').exists()).toBe(true)
    await wrapper.setProps({ sentence: { ...sentence, id: 'daily_002', zh: '新句子。' } })
    expect(wrapper.find('.btn-reveal').exists()).toBe(false) // retellRecDone 已重置
    await wrapper.find('.btn-listen').trigger('click')
    await flushPromises()
    expect(playText).toHaveBeenLastCalledWith(expect.objectContaining({ rate: 1.25 })) // 语速保留
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- src/components/PracticeCard.test.js`
Expected: FAIL — `.speed-seg` 不存在等

- [ ] **Step 3: 实现 template**

`src/components/PracticeCard.vue` template 中，在现有听辨分支 `</template>`（L8 后）与新 `rec-zone` 之间改为三分支结构。现有：

```html
      <template v-if="mode === 'listen' && !listenTextShown && !revealed">
        <button class="btn btn-primary btn-listen" @click="onListenPlay">{{ playing ? '⏹ 停止' : '🎧 播放原句' }}</button>
        <button class="btn btn-skip" @click="listenTextShown = true">显示原文</button>
      </template>
      <template v-else>
```

改为：

```html
      <template v-if="mode === 'listen' && !listenTextShown && !revealed">
        <button class="btn btn-primary btn-listen" @click="onListenPlay">{{ playing ? '⏹ 停止' : '🎧 播放原句' }}</button>
        <button class="btn btn-skip" @click="listenTextShown = true">显示原文</button>
      </template>
      <template v-else-if="mode === 'retell' && !revealed">
        <button class="btn btn-primary btn-listen" @click="onRetellPlay">{{ playing ? '⏹ 停止' : (retellPlayed ? '↻ 重听' : '▶ 播放原句') }}</button>
        <div class="speed-seg">
          <button v-for="r in SPEEDS" :key="r" class="speed-btn" :class="{ active: speed === r }" @click="speed = r">{{ r }}x</button>
        </div>
      </template>
      <template v-else>
```

v-else 分支内的 reference 块（原 L16-18）改为带条件 label：

```html
        <div class="reference neu-inset" v-else>
          <p v-if="mode === 'retell'" class="reference-label">参考译文</p>
          <p>{{ referenceText }}</p>
        </div>
```

- [ ] **Step 4: 实现 script**

defineEmits 行改为：

```js
const emit = defineEmits(['revealed', 'skip', 'recStopped'])
```

在 `const playing = ref(false)` 之后追加：

```js
// —— 复述模式：语速跟句保持（换句不重置），重听/已录状态随句重置 ——
const SPEEDS = [0.75, 1, 1.25]
const speed = ref(1)
const retellPlayed = ref(false)
const retellRecDone = ref(false)

function onRetellPlay() {
  listenError.value = ''
  if (playing.value) { stop(); return }
  playing.value = true
  playCurrent().then(ok => {
    if (ok) retellPlayed.value = true
    else {
      listenError.value = '当前设备无语音引擎，已显示原文'
      revealed.value = true
      emit('revealed')
    }
  })
}
```

`playCurrent` 的 playText 调用加 rate（互斥与返回值不变）：

```js
async function playCurrent() {
  if (recPlayback.value) recPlayback.value.pause() // 互斥：播原句前先停自己的回放
  const r = await playText({ id: props.sentence.id, source: props.sentence.source, text: sourceText.value, lang: sourceLang.value, rate: speed.value })
  playing.value = false
  return r !== 'failed'
}
```

`srLang` 改为（复述模式识别源语，与翻译模式相反；源语按实际文本判定）：

```js
const srLang = computed(() => {
  if (props.mode === 'retell') return sourceLang.value === 'zh' ? 'zh-CN' : 'en-US'
  return props.direction === 'zh2en' ? 'en-US' : 'zh-CN'
})
```

`onRecStop` 末尾追加两行（`if (url) recUrl.value = url` 之后）：

```js
  if (props.mode === 'retell') { retellRecDone.value = true; emit('recStopped') }
```

换句 watch（`watch(() => props.sentence, ...)`）内，`playing.value = false` 之后追加：

```js
  retellPlayed.value = false
  retellRecDone.value = false
  // speed 故意不重置：调一次多句沿用
```

- [ ] **Step 5: 实现 style**

`<style scoped>` 末尾（`@keyframes rec-pulse` 之前）追加：

```css
.play-zone { display: flex; flex-direction: column; align-items: center; gap: 12px; width: 100%; }
.speed-seg { display: flex; gap: 4px; }
.speed-btn {
  border: none; cursor: pointer; font: inherit; font-size: 12px; color: var(--text-muted);
  background: var(--surface); border-radius: 10px; padding: 6px 12px; box-shadow: var(--shadow-out);
  transition: box-shadow 0.12s ease, color 0.12s ease;
}
.speed-btn.active { color: var(--accent-text); box-shadow: var(--shadow-in); }
.reference-label { font-size: 12px; color: var(--text-muted); margin: 0 0 6px; }
```

- [ ] **Step 6: 运行测试 + git diff 核验**

Run: `npm test -- src/components/PracticeCard.test.js`
Expected: PASS（新 8 用例 + 既有全部绿）

Run: `git diff src/components/PracticeCard.vue`
Expected: 确认上述改动全部落盘（该文件曾有工具层假成功先例）

- [ ] **Step 7: 提交**

```bash
git add src/components/PracticeCard.vue src/components/PracticeCard.test.js
git commit -m "feat: retell mode card branch with speed control"
```

---

### Task 6: PracticeView 接线（新建测试）

**Files:**
- Modify: `src/views/PracticeView.vue`（template 两处 + script 三处）
- Test: Create `src/views/PracticeView.test.js`

- [ ] **Step 1: 写失败测试（新建文件）**

`src/views/PracticeView.test.js` 全文：

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PracticeView from './PracticeView.vue'
import PracticeCard from '../components/PracticeCard.vue'
import { drawSentence } from '../lib/picker.js'
import { loadSettings } from '../stores/settings.js'

vi.mock('../lib/sentences.js', () => ({
  allBuiltinSentences: () => [
    { id: 't1', zh: '第一句。', en: 'one', topic: 'daily', source: 'builtin' },
    { id: 't2', zh: '第二句。', en: 'two', topic: 'daily', source: 'builtin' }
  ],
  getCustomSentences: () => []
}))
vi.mock('../lib/picker.js', () => ({
  drawSentence: vi.fn(({ pool, lastId }) => pool.find(s => s.id !== lastId) || pool[0])
}))
vi.mock('../lib/srs.js', () => ({
  dueQueue: vi.fn(() => []),
  quotaAvailable: vi.fn(() => true),
  isDue: vi.fn(() => false),
  onRated: vi.fn()
}))
vi.mock('../lib/records.js', () => ({ addRecord: vi.fn(() => true) }))
vi.mock('../lib/storage.js', () => ({ storageAvailable: () => true }))
vi.mock('../lib/voice.js', () => ({ stop: vi.fn() }))

beforeEach(() => { localStorage.clear(); loadSettings() })

function mountView() {
  return mount(PracticeView, { global: { stubs: { SessionHistory: true } } })
}

describe('PracticeView rating visibility', () => {
  it('retell mode: rating appears after recStopped without reveal, with retell labels', async () => {
    const { setMode } = await import('../stores/settings.js')
    setMode('retell')
    const w = mountView()
    expect(w.text()).toContain('听完 → 开口复述 → 对照原文后自评')
    w.findComponent(PracticeCard).vm.$emit('recStopped')
    await w.vm.$nextTick()
    const btns = w.findAll('.rating-row .btn')
    expect(btns.map(b => b.text())).toEqual(['流畅', '磕绊', '没记住'])
  })
  it('sight mode: rating requires reveal, translate labels', async () => {
    const w = mountView()
    expect(w.find('.rating-row').exists()).toBe(false)
    w.findComponent(PracticeCard).vm.$emit('revealed')
    await w.vm.$nextTick()
    expect(w.findAll('.rating-row .btn').map(b => b.text())).toEqual(['能译', '磕绊', '不会'])
  })
  it('retell mode: recDone resets on next sentence (new sentence starts unrated)', async () => {
    const { setMode } = await import('../stores/settings.js')
    setMode('retell')
    const w = mountView()
    w.findComponent(PracticeCard).vm.$emit('recStopped')
    await w.vm.$nextTick()
    await w.findAll('.rating-row .btn')[0].trigger('click') // 流畅 → 下一句
    await w.vm.$nextTick()
    expect(w.find('.rating-row').exists()).toBe(false) // 新句 recDone=false
  })
  it('mode toggle shows three modes and applies on click', async () => {
    const w = mountView()
    const modes = w.findAll('.mode-btn').map(b => b.text())
    expect(modes).toEqual(['视译', '听辨', '复述'])
    await w.findAll('.mode-btn')[2].trigger('click')
    const { settings } = await import('../stores/settings.js')
    expect(settings.value.mode).toBe('retell')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- src/views/PracticeView.test.js`
Expected: FAIL — 评分不出现 / 只有 2 个 mode-btn / labels 不匹配

- [ ] **Step 3: 实现 template 改动**

评分区（原 L11-14）改为：

```html
      <div class="rating-zone">
        <RatingButtons v-if="showRating" :variant="settings.mode === 'retell' ? 'retell' : 'translate'" @rate="rate" />
        <p v-else class="hint">{{ modeHint }}</p>
      </div>
```

模式切换组（原 L17-20）加第三段：

```html
        <div class="mode-toggle">
          <button class="btn mode-btn" :class="{ active: settings.mode === 'sight' }" @click="applyMode('sight')">视译</button>
          <button class="btn mode-btn" :class="{ active: settings.mode === 'listen' }" @click="applyMode('listen')">听辨</button>
          <button class="btn mode-btn" :class="{ active: settings.mode === 'retell' }" @click="applyMode('retell')">复述</button>
        </div>
```

PracticeCard 标签（L10）加监听：

```html
      <PracticeCard :sentence="current.sentence" :direction="current.direction" :mode="settings.mode" @revealed="onRevealed" @rec-stopped="onRecStopped" @skip="next(false)" />
```

- [ ] **Step 4: 实现 script 改动**

`next()` 内 current 赋值（L66）改为：

```js
  current.value = s ? { sentence: { ...s }, direction: settings.value.direction, revealed: false, recDone: false } : null
```

`onRevealed` 之后追加：

```js
function onRecStopped() {
  if (current.value) current.value.recDone = true
}
```

computed 区（`done` 之后）追加：

```js
const showRating = computed(() => current.value && (current.value.revealed || (settings.value.mode === 'retell' && current.value.recDone)))
const modeHint = computed(() => settings.value.mode === 'retell' ? '听完 → 开口复述 → 对照原文后自评' : '口头译出后，点「看参考译文」对照')
```

- [ ] **Step 5: 运行测试**

Run: `npm test -- src/views/PracticeView.test.js`
Expected: PASS（4 用例）

- [ ] **Step 6: 提交**

```bash
git add src/views/PracticeView.vue src/views/PracticeView.test.js
git commit -m "feat: wire retell mode into practice view"
```

---

### Task 7: 全量回归 + 构建 + 部署

**Files:** 无代码改动

- [ ] **Step 1: 全量测试**

Run: `npm test`
Expected: 全绿（现有 ~207+ 新增 ~17 用例）

- [ ] **Step 2: 本地构建验证**

Run: `npm run build`
Expected: 构建成功无报错

- [ ] **Step 3: 提交部署**

```bash
git push
```

（若代理未开报 `Failed to connect over proxy 127.0.0.1`：用 `git -c http.https://github.com.proxy= push` 直连）

- [ ] **Step 4: 线上验证（CI 构建哈希≠本地，不比哈希）**

抓线上 sw.js 预缓存清单，在 JS bundle 内容里搜特征串 `对照原文`（retell 分支文案，仅本功能引入）：
Expected: 预缓存清单中出现新哈希的 index-*.js 且内容含特征串 → 部署生效

- [ ] **Step 5: 真机手工验收清单（转告用户）**

1. 复述模式切换（练习页底部三段切换），刷新页面后模式记忆保持
2. 0.75x/1.25x 变速听感（内置句 MP3 变速不变调；粘贴句 TTS 变速）
3. 中文原声复述时识别出中文字、英文原声时出英文（与翻译模式相反）
4. 录完不点对照原文直接评分（盲听自评路径）
5. 播放→重听多次；播放与录音回放互斥
6. 换句后语速保留；评分链路照常入历史与 SRS

---

## Self-Review 记录

1. **规格覆盖**：§3.1→T1；§3.2→T2；§3.3→T3；§3.4→T5；§3.5→T4；§3.6→T6；§3.7 零改动（无任务，正确）；§4→T5 模板（已含原型验证的布局）；§5 错误处理→T5（播放失败自动揭晓用例）；§6→T1-T6 测试 + T7 手工清单；§7 兼容→T2/T3 默认参数设计 + T1 旧备份合并逻辑零改动。无缺口。
2. **占位符扫描**：无 TBD/TODO/「适当处理」类表述。
3. **类型一致性**：`rate`（tts 第 4 参 / playText 字段 / playCurrent 传参）一致；`variant`（prop 名 / 传参）一致；`recStopped`（emit 名 / @rec-stopped 监听 / vm.$emit 触发）一致；`recDone`（PracticeView 会话项 / showRating 条件）一致；`SPEEDS`/`speed`/`retellPlayed`/`retellRecDone` 命名前后一致。
