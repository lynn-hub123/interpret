# 录音回放升级（自定义回放控件 + 录后引导）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 录音停止后用自定义回放控件（播放/暂停 + 可拖进度条 + 时间）替换原生 `<audio controls>`，并加「听原句」「重录」引导按钮与声音互斥。

**Architecture:** 新建自包含子组件 RecPlayback.vue（自管播放/进度/时长状态，暴露 `pause()`、`emit('playing')`），PracticeCard 只做接线：复用 `onSpeak`/`playing` 状态实现听原句，`onRerecord` 复用 `onRecStart` 清理逻辑，互斥双向各一处。

**Tech Stack:** Vue 3 `<script setup>`（+ 普通 `<script>` 具名导出 formatTime）+ Vitest happy-dom（手动派发媒体事件模拟播放状态）。

**规格：** `docs/superpowers/specs/2026-10-18-recording-playback-design.md`

**环境备忘（Windows PowerShell 5）：** `npm.cmd` / `npx.cmd` 带 `.cmd` 后缀；多命令用 `;` 禁 `&&`；提交信息中文单行无空格；若 npx 被执行策略阻拦改用 `node node_modules/vitest/vitest.mjs run <文件>`。

**现状基线：** master HEAD=2b5600e，143 测试全绿。PracticeCard.vue rec-zone 现有模板为 `🎙 录音` 按钮 / `.rec-live`（停止+计时）/ 原生 `<audio class="rec-playback" :src="recUrl" controls>`。

---

### Task 1: RecPlayback 自定义回放组件（TDD）

**Files:**
- Create: `src/components/RecPlayback.vue`
- Test: `src/components/RecPlayback.test.js`

- [ ] **Step 1: 写失败测试（完整新建文件）**

`src/components/RecPlayback.test.js` 全文：

```js
import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import RecPlayback, { formatTime } from './RecPlayback.vue'

const SRC = 'blob:fake-rec'

// happy-dom 不驱动媒体状态：在 audio 元素上补属性（可记录赋值）再手动派发事件
function patchAudio(wrapper) {
  const a = wrapper.find('audio').element
  let ct = 0
  Object.defineProperty(a, 'currentTime', { configurable: true, get: () => ct, set: v => { ct = v } })
  Object.defineProperty(a, 'duration', { configurable: true, get: () => 7, set: () => {} })
  a.play = vi.fn()
  a.pause = vi.fn()
  return a
}

const fire = (el, type) => el.dispatchEvent(new Event(type))

describe('formatTime', () => {
  it.each([
    [0, '0:00'], [-3, '0:00'], [NaN, '0:00'], [Infinity, '0:00'],
    [59, '0:59'], [60, '1:00'], [61, '1:01'], [125, '2:05'], [600, '10:00'], [61.9, '1:01']
  ])('formats %p as %p', (input, expected) => {
    expect(formatTime(input)).toBe(expected)
  })
})

describe('RecPlayback', () => {
  it('renders toggle, bar and time', () => {
    const w = mount(RecPlayback, { props: { src: SRC } })
    expect(w.find('.pb-toggle').exists()).toBe(true)
    expect(w.find('.pb-bar').exists()).toBe(true)
    expect(w.find('.pb-time').text()).toBe('0:00 / 0:00')
  })
  it('toggle calls play, play event flips state and emits playing', async () => {
    const w = mount(RecPlayback, { props: { src: SRC } })
    const a = patchAudio(w)
    await w.find('.pb-toggle').trigger('click')
    expect(a.play).toHaveBeenCalled()
    fire(a, 'play')
    await nextTick()
    expect(w.find('.pb-toggle').text()).toBe('⏸')
    expect(w.emitted('playing')).toBeTruthy()
  })
  it('pause event reverts state, second toggle pauses audio', async () => {
    const w = mount(RecPlayback, { props: { src: SRC } })
    const a = patchAudio(w)
    fire(a, 'play')
    await nextTick()
    await w.find('.pb-toggle').trigger('click')
    expect(a.pause).toHaveBeenCalled()
    fire(a, 'pause')
    await nextTick()
    expect(w.find('.pb-toggle').text()).toBe('▶')
  })
  it('loadedmetadata enables bar and shows duration, timeupdate shows current', async () => {
    const w = mount(RecPlayback, { props: { src: SRC } })
    const a = patchAudio(w)
    expect(w.find('.pb-bar').element.disabled).toBe(true)
    fire(a, 'loadedmetadata')
    await nextTick()
    expect(w.find('.pb-bar').element.disabled).toBe(false)
    expect(w.find('.pb-bar').element.max).toBe('7')
    expect(w.find('.pb-time').text()).toBe('0:00 / 0:07')
    a.currentTime = 2.5
    fire(a, 'timeupdate')
    await nextTick()
    expect(w.find('.pb-time').text()).toBe('0:02 / 0:07')
  })
  it('seek updates audio currentTime and displayed time', async () => {
    const w = mount(RecPlayback, { props: { src: SRC } })
    const a = patchAudio(w)
    fire(a, 'loadedmetadata')
    await nextTick()
    await w.find('.pb-bar').setValue('3')
    expect(a.currentTime).toBe(3)
    expect(w.find('.pb-time').text()).toBe('0:03 / 0:07')
  })
  it('ended resets to start and stops', async () => {
    const w = mount(RecPlayback, { props: { src: SRC } })
    const a = patchAudio(w)
    fire(a, 'loadedmetadata')
    await nextTick()
    a.currentTime = 7
    fire(a, 'timeupdate')
    fire(a, 'play')
    await nextTick()
    fire(a, 'ended')
    await nextTick()
    expect(w.find('.pb-toggle').text()).toBe('▶')
    expect(w.find('.pb-time').text()).toBe('0:00 / 0:07')
  })
  it('src change resets state', async () => {
    const w = mount(RecPlayback, { props: { src: SRC } })
    const a = patchAudio(w)
    fire(a, 'loadedmetadata')
    fire(a, 'play')
    await nextTick()
    await w.setProps({ src: 'blob:other' })
    expect(w.find('.pb-toggle').text()).toBe('▶')
    expect(w.find('.pb-time').text()).toBe('0:00 / 0:00')
  })
  it('exposed pause pauses while playing, unmount pauses too', async () => {
    const w = mount(RecPlayback, { props: { src: SRC } })
    const a = patchAudio(w)
    fire(a, 'play')
    await nextTick()
    w.vm.pause()
    expect(a.pause).toHaveBeenCalledTimes(1)
    fire(a, 'pause')
    await nextTick()
    w.unmount()
    expect(a.pause).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx.cmd vitest run src/components/RecPlayback.test.js`
Expected: FAIL（找不到 `./RecPlayback.vue` 模块），无法解析导入

- [ ] **Step 3: 实现组件（完整新建文件）**

`src/components/RecPlayback.vue` 全文：

```vue
<template>
  <div class="rec-playback">
    <button class="pb-toggle" :title="isPlaying ? '暂停' : '播放'" @click="onToggle">{{ isPlaying ? '⏸' : '▶' }}</button>
    <input
      class="pb-bar"
      type="range"
      min="0"
      :max="ready ? duration : 0"
      step="0.1"
      :value="current"
      :disabled="!ready"
      :style="{ '--pct': pct + '%' }"
      aria-label="回放进度"
      @input="onSeek"
    />
    <span class="pb-time">{{ formatTime(current) }} / {{ formatTime(duration) }}</span>
    <audio
      ref="audio"
      :src="src"
      preload="metadata"
      @play="onPlayEvt"
      @pause="onPauseEvt"
      @ended="onEnded"
      @timeupdate="onTimeUpdate"
      @loadedmetadata="onMeta"
    ></audio>
  </div>
</template>

<script>
// 回放时间格式化（m:ss），纯函数便于单测；非法输入一律回 0:00
export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
</script>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'

const props = defineProps({
  src: { type: String, required: true }
})
const emit = defineEmits(['playing'])

const audio = ref(null)
const isPlaying = ref(false)
const current = ref(0)
const duration = ref(0)
const ready = computed(() => Number.isFinite(duration.value) && duration.value > 0)
const pct = computed(() => (ready.value ? Math.min(100, (current.value / duration.value) * 100) : 0))

function onToggle() {
  const a = audio.value
  if (!a) return
  if (isPlaying.value) a.pause()
  else a.play()
}

// 供父级互斥调用：仅在自己播放中时暂停
function pause() {
  const a = audio.value
  if (a && isPlaying.value) a.pause()
}
defineExpose({ pause })

// 播放状态以元素事件为准（真实浏览器 play()/pause() 会触发对应事件）
function onPlayEvt() { isPlaying.value = true; emit('playing') }
function onPauseEvt() { isPlaying.value = false }
// 自然播完只有 ended 事件（paused 变 true 但不派发 pause），需自行复位
function onEnded() { isPlaying.value = false; current.value = 0 }
function onTimeUpdate() { if (audio.value) current.value = audio.value.currentTime }
function onMeta() {
  if (audio.value && Number.isFinite(audio.value.duration)) duration.value = audio.value.duration
}

function onSeek(e) {
  if (!ready.value) return
  const v = Number(e.target.value)
  current.value = v
  if (audio.value) audio.value.currentTime = v
}

// 换录音（src 变化）：状态归零，等新音频的 loadedmetadata
watch(() => props.src, () => {
  isPlaying.value = false
  current.value = 0
  duration.value = 0
})

onUnmounted(() => { pause() })
</script>

<style scoped>
.rec-playback { display: flex; align-items: center; gap: 10px; width: 100%; max-width: 260px; }
.pb-toggle {
  width: 34px; height: 34px; border-radius: 50%; border: none; cursor: pointer;
  background: var(--accent-soft); color: var(--accent-text); font-size: 13px; flex-shrink: 0;
  transition: transform 0.12s ease;
}
.pb-toggle:active { transform: scale(0.92); }
.pb-bar {
  flex: 1; min-width: 0; height: 4px; appearance: none; -webkit-appearance: none;
  border-radius: 999px; cursor: pointer; outline: none;
  background: linear-gradient(to right, var(--accent) var(--pct, 0%), var(--surface-deep) var(--pct, 0%));
}
.pb-bar::-webkit-slider-thumb {
  appearance: none; -webkit-appearance: none;
  width: 12px; height: 12px; border-radius: 50%; background: var(--accent); border: none;
}
.pb-bar::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: var(--accent); border: none; }
.pb-bar:disabled { opacity: 0.4; cursor: default; }
.pb-time { font-size: 11px; color: var(--text-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
</style>
```

- [ ] **Step 4: 运行单文件确认通过**

Run: `npx.cmd vitest run src/components/RecPlayback.test.js`
Expected: 18 个用例全部 PASS（formatTime 矩阵 10 + 组件行为 8）

- [ ] **Step 5: 全量回归**

Run: `npm.cmd test`
Expected: 143 + 18 = 161 个用例全部通过，无失败无跳过

- [ ] **Step 6: 提交**

```bash
git add src/components/RecPlayback.vue src/components/RecPlayback.test.js
git commit -m "自定义回放控件组件"
```

---

### Task 2: PracticeCard 接线（回放替换 + 听原句/重录 + 互斥）

**Files:**
- Modify: `src/components/PracticeCard.vue`
- Test: `src/components/PracticeCard.test.js`

依赖：Task 1 已完成（RecPlayback 组件存在，根类名 `.rec-playback`）。

- [ ] **Step 1: 写失败测试**

1a. `src/components/PracticeCard.test.js` 顶部 import 区（`import PracticeCard from './PracticeCard.vue'` 之后）加：

```js
import { nextTick } from 'vue'
import RecPlayback from './RecPlayback.vue'
```

1b. `describe('recording zone')` 块末尾（`revokes url on sentence change` 用例之后）追加 5 个用例。注意：`revoke`/`startRecording` 是顶部已有的 recorder.js mock；辅助函数 `recordOnce(wrapper)` 封装「录音并停止」两步：

```js
  // 辅助：完成一次录音并停止，得到 blob:fake-rec 回放
  async function recordOnce(wrapper) {
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
  }
  it('shows custom playback and guide buttons without native controls after stop', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    await recordOnce(wrapper)
    expect(wrapper.findComponent(RecPlayback).exists()).toBe(true)
    expect(wrapper.find('audio[controls]').exists()).toBe(false)
    const aux = wrapper.findAll('.btn-rec-aux')
    expect(aux.length).toBe(2)
    expect(wrapper.text()).toContain('听原句')
    expect(wrapper.text()).toContain('重录')
  })
  it('hears original sentence via playText from guide button', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    await recordOnce(wrapper)
    await wrapper.findAll('.btn-rec-aux')[0].trigger('click')
    await flushPromises()
    expect(playText).toHaveBeenCalledWith(expect.objectContaining({ text: '你好', lang: 'zh' }))
  })
  it('rerecord revokes old url and restarts recording', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    await recordOnce(wrapper)
    revoke.mockClear()
    startRecording.mockClear()
    await wrapper.findAll('.btn-rec-aux')[1].trigger('click')
    await flushPromises()
    expect(revoke).toHaveBeenCalledWith('blob:fake-rec')
    expect(startRecording).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('停止')
  })
  it('pauses own playback when original voice starts', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    await recordOnce(wrapper)
    const a = wrapper.find('audio').element
    a.pause = vi.fn()
    a.dispatchEvent(new Event('play'))
    await nextTick()
    await wrapper.find('.btn-speak').trigger('click')
    await flushPromises()
    expect(a.pause).toHaveBeenCalled()
  })
  it('stops original voice when own playback starts', async () => {
    playText.mockImplementation(() => new Promise(() => {}))
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    await recordOnce(wrapper)
    await wrapper.find('.btn-speak').trigger('click')
    await flushPromises()
    expect(wrapper.find('.btn-speak').text()).toBe('⏹')
    wrapper.find('audio').element.dispatchEvent(new Event('play'))
    await nextTick()
    expect(stop).toHaveBeenCalled()
  })
```

说明：现有用例 `records, stops, shows playback` 断言 `.rec-playback` 存在——RecPlayback 根类名同为 `rec-playback`，该用例无需改动即可继续通过；组件内 `<audio>` 无 `controls` 属性。

- [ ] **Step 2: 运行确认失败**

Run: `npx.cmd vitest run src/components/PracticeCard.test.js`
Expected: 新增 5 个用例 FAIL（`.btn-rec-aux` 不存在 / findComponent 找不到 RecPlayback），原有用例全 PASS

- [ ] **Step 3: 接线实现（PracticeCard.vue 三处改动）**

3a. 模板：rec-zone 内第 27 行的原生 audio：

```html
        <audio v-if="recUrl" class="rec-playback" :src="recUrl" controls></audio>
```

替换为：

```html
        <RecPlayback v-if="recUrl" ref="recPlayback" :src="recUrl" @playing="onRecPlaying" />
        <div v-if="recUrl" class="rec-actions">
          <button class="btn-rec-aux" :title="playing ? '停止' : '对照原句再听一遍'" @click="onSpeak">{{ playing ? '⏹ 停止' : '🔊 听原句' }}</button>
          <button class="btn-rec-aux" title="重新录一遍" @click="onRerecord">↻ 重录</button>
        </div>
```

3b. 脚本：import 区（`import { recorderSupported, ... } from '../lib/recorder.js'` 之后）加：

```js
import RecPlayback from './RecPlayback.vue'
```

`const recError = ref('')` 之后加：

```js
const recPlayback = ref(null)
```

`playCurrent` 函数头部加互斥暂停（改后完整函数）：

```js
async function playCurrent() {
  if (recPlayback.value) recPlayback.value.pause() // 互斥：播原句前先停自己的回放
  const r = await playText({ id: props.sentence.id, source: props.sentence.source, text: sourceText.value, lang: sourceLang.value })
  playing.value = false
  return r !== 'failed'
}
```

`onRecStop` 函数之后加两个函数：

```js
// 互斥：自己的回放开播时停掉原句（听原句与上方 🔊 共用 playing 状态）
function onRecPlaying() {
  if (playing.value) { stop(); playing.value = false }
}

// 重录：停掉回放后直接开始新录音（revoke 旧 URL 由 onRecStart 处理）
async function onRerecord() {
  if (recPlayback.value) recPlayback.value.pause()
  await onRecStart()
}
```

3c. 样式：删除这行（样式已移入 RecPlayback）：

```css
.rec-playback { width: 100%; max-width: 260px; height: 36px; }
```

同位置加：

```css
.rec-actions { display: flex; gap: 18px; }
.btn-rec-aux {
  border: none; background: none; cursor: pointer; font: inherit;
  font-size: 13px; color: var(--text-muted); padding: 2px 4px; border-radius: 8px;
  transition: color 0.15s ease, transform 0.12s ease;
}
.btn-rec-aux:active { transform: scale(0.95); color: var(--accent-text); }
```

- [ ] **Step 4: 运行单文件确认通过**

Run: `npx.cmd vitest run src/components/PracticeCard.test.js`
Expected: 全部 PASS（原 26 + 新 5 = 31）

- [ ] **Step 5: 全量回归**

Run: `npm.cmd test`
Expected: 161 + 5 = 166 个用例全部通过，无失败无跳过

- [ ] **Step 6: 提交**

```bash
git add src/components/PracticeCard.vue src/components/PracticeCard.test.js
git commit -m "回放接线与录后引导按钮"
```

---

### Task 3: 构建终验 + push + 线上验收

**Files:** 无代码改动，验证与发布。

- [ ] **Step 1: 构建**

Run: `npm.cmd run build`
Expected: 构建成功无报错

- [ ] **Step 2: push**

```bash
git push
```

Expected: push 成功，GitHub Actions 部署正常。

- [ ] **Step 3: 线上验收（CI 构建哈希与本地不同，勿用本地哈希判断；抓 sw.js 预缓存清单或产物内容特征确认）**

部署完成后在 https://lynn-hub123.github.io/interpret/ 用浏览器验证（headless 无麦克风，走错误路径为主）：

1. 新 bundle 生效：线上产物 JS 中可搜到 `btn-rec-aux`、`.pb-toggle`（CSS 文件中可搜到 `rec-pulse` 之外的 `pb-bar`）
2. 录音区错误路径不回归：点「🎙 录音」→ 错误文案照旧、无计时器、无回放控件
3. 页面渲染无布局错乱（rec-zone 结构变化后卡片高度正常）

真实麦克风的完整路径（录完出现自定义控件、听原句、重录）由用户真机验收。

---

## 自审记录

- 规格覆盖：RecPlayback 组件（Task 1）、PracticeCard 接线 + 听原句 + 重录 + 互斥（Task 2）、formatTime 纯函数（Task 1 测试）、native controls 移除（Task 2 测试 1）、清理与边界（Task 1 src watch/unmount + Task 2 现有 watch 不动）、YAGNI 未引入波形/倍速/自动播放 ✔
- 占位符扫描：无 TBD/TODO，所有代码步骤含完整代码 ✔
- 类型/命名一致性：`pause`（defineExpose）、`playing` 事件、`formatTime`、`recPlayback` ref、`onRecPlaying`/`onRerecord`/`onSpeak`/`onRecStart` 各任务间一致 ✔
- 测试计数核对：现 143 + RecPlayback 18 + PracticeCard 5 = 166 ✔
