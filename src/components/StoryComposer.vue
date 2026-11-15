<template>
  <section class="composer" :class="{ 'is-gate': isGate, 'is-locked': locked }">
    <p v-if="isGate && tries === 0" class="prehalt">……</p>

    <div class="axis">
      <div v-if="candidates.length" class="cands" :class="{ 'has-sel': !!selId }">
        <button
          v-for="c in candidates"
          :key="c.id"
          class="cand"
          :class="{ sel: c.id === selId }"
          :aria-pressed="c.id === selId"
          type="button"
          @click="select(c)"
        >
          {{ c.zh }}
        </button>
      </div>

      <div class="input-block">
        <textarea
          ref="inputEl"
          class="line"
          rows="1"
          :value="text"
          :readonly="locked && !readMode"
          :placeholder="placeholder"
          :aria-label="placeholder"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          @input="onInput"
          @keydown.enter.exact.prevent="onSend"
        ></textarea>
        <button
          class="mic"
          type="button"
          :class="{ on: recording }"
          :disabled="locked"
          :aria-label="recording ? '停止录音' : '录音'"
          @click="toggleMic"
        >
          <PixelIcon :name="recording ? 'stop' : 'mic'" :size="16" />
        </button>
        <span v-if="recording" class="rec-clock">{{ clock }}</span>

        <button
          v-if="!isGate"
          class="send"
          type="button"
          :disabled="!canSend"
          @click="onSend"
        >发送</button>
        <button
          v-else
          class="gate-key"
          type="button"
          :disabled="!canSend"
          aria-label="发送"
          @click="onSend"
        >
          <svg class="wave" width="28" height="16" viewBox="0 0 28 16" aria-hidden="true">
            <rect x="0" y="6" width="3" height="4" fill="currentColor" />
            <rect x="5" y="3" width="3" height="10" fill="currentColor" />
            <rect x="10" y="0" width="3" height="16" fill="currentColor" />
            <rect x="15" y="3" width="3" height="10" fill="currentColor" />
            <rect x="20" y="5" width="3" height="6" fill="currentColor" />
            <rect x="25" y="7" width="3" height="2" fill="currentColor" />
          </svg>
        </button>
      </div>

      <p v-if="interim" class="interim">{{ interim }}</p>
      <p v-if="recError || srError" class="issue">{{ recError || srError }}</p>
      <RecPlayback v-if="recUrl" ref="playback" :src="recUrl" class="playback" />

      <p v-if="hint" class="hint">{{ hint }}</p>

      <div v-if="phase === 'r3'" class="reference">
        <p class="ref-line">{{ gate.reference }}</p>
        <div class="ref-actions">
          <button class="read" type="button" @click="readReference">照读</button>
          <button class="silence" type="button" @click="silence">说不出口</button>
        </div>
      </div>
      <button
        v-else-if="isGate && tries > 0"
        class="silence solo"
        type="button"
        @click="silence"
      >说不出口</button>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PixelIcon from './PixelIcon.vue'
import RecPlayback from './RecPlayback.vue'
import { judge } from '../lib/gate.js'
import { comprehends } from '../lib/comprehend.js'
import {
  recorderSupported, startRecording, stopRecording, revoke, isRecording, lastErrorName
} from '../lib/recorder.js'
import { speechSupported, start as srStart, stop as srStop } from '../lib/speech.js'

const props = defineProps({
  beat: { type: Object, required: true }
})
const emit = defineEmits(['commit'])

const candidates = computed(() => props.beat.candidates || [])
const gate = computed(() => props.beat.gate || null)
const isGate = computed(() => !!gate.value)

const selId = ref(candidates.value[0]?.id || '')
const text = ref('')
const tries = ref(0)
const phase = ref('compose')
const hint = ref('')
const readMode = ref(false)
const inputEl = ref(null)

const recording = ref(false)
const recUrl = ref('')
const interim = ref('')
const recError = ref('')
const srError = ref('')
const secs = ref(0)
const playback = ref(null)
let recTimer = null
let alive = true

const locked = computed(() => isGate.value && tries.value >= 3)
const canSend = computed(() =>
  !!text.value.trim() && !recording.value && (!locked.value || readMode.value)
)

const placeholder = computed(() => {
  if (isGate.value && !readMode.value) return '这句话说出去就收不回'
  return '按话筒说英文，也可以直接打字'
})

function select(c) {
  if (c.id === selId.value || locked.value) return
  selId.value = c.id
  text.value = ''
  readMode.value = false
  hint.value = ''
  inputEl.value?.focus()
}

/* ---------- 输入框随内容增高：单行起，最多五行，再超在框内滚动 ---------- */
const MAX_ROWS = 5
const LINE_H = 26
const MAX_H = MAX_ROWS * LINE_H

function resize() {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  const next = Math.min(el.scrollHeight, MAX_H)
  el.style.height = `${next}px`
  el.style.overflowY = el.scrollHeight > MAX_H ? 'auto' : 'hidden'
}

watch(text, () => nextTick(resize))
// 计时出现 / 消失会改变输入条可用宽度，重新分行
watch(recording, () => nextTick(resize))
onMounted(resize)

function onInput(e) {
  text.value = e.target.value
  resize()
}

function onSend() {
  if (!canSend.value) return
  if (!isGate.value) {
    // 普通回合只分两档：听懂 / 没听懂，交给对方用一句反应回应
    const picked = candidates.value.find(c => c.id === selId.value)
    emit('commit', {
      text: text.value.trim(),
      passed: true,
      heard: picked ? comprehends(text.value, picked.en) : true
    })
    return
  }
  if (readMode.value) {
    emit('commit', { text: text.value.trim(), passed: true, read: true })
    return
  }
  const result = judge(text.value, gate.value)
  if (result.pass || result.degraded) {
    emit('commit', { text: text.value.trim(), passed: true, degraded: result.degraded })
    return
  }
  tries.value += 1
  if (tries.value >= 3) {
    phase.value = 'r3'
    hint.value = ''
    return
  }
  hint.value = tries.value === 1 ? gate.value.hints.r1 : gate.value.hints.r2
}

function readReference() {
  text.value = gate.value.reference
  readMode.value = true
  hint.value = ''
  inputEl.value?.focus()
}

function silence() {
  emit('commit', { text: '', passed: false, silent: true })
}

/* ---------- 录音 / 识别 / 回放：复用 lib 实现 ---------- */
const recOK = recorderSupported()
const srOK = speechSupported()

const SR_ERROR = {
  'not-allowed': '麦克风没打开，直接打字也行',
  'service-not-allowed': '识别服务不可用，直接打字也行',
  network: '识别断了，直接打字也行',
  'audio-capture': '没找到麦克风，直接打字也行'
}
const REC_ERROR = {
  NotAllowedError: '麦克风没打开，直接打字也行',
  NotFoundError: '没找到麦克风，直接打字也行',
  NotReadableError: '麦克风被占用了，直接打字也行'
}

const clock = computed(() => {
  const m = Math.floor(secs.value / 60)
  const s = secs.value % 60
  return `${m}:${String(s).padStart(2, '0')}`
})

function startClock() {
  stopClock()
  secs.value = 0
  recTimer = setInterval(() => { secs.value += 1 }, 1000)
}
function stopClock() {
  if (recTimer) { clearInterval(recTimer); recTimer = null }
}

const srHandlers = {
  onFinal: chunk => {
    if (!chunk) return
    interim.value = ''
    text.value += (text.value && !text.value.endsWith(' ') ? ' ' : '') + chunk.trim()
  },
  onInterim: chunk => { interim.value = chunk },
  onError: name => { srError.value = SR_ERROR[name] || '识别不可用，直接打字也行' }
}

async function toggleMic() {
  if (locked.value) return
  if (recording.value) { await stopMic(); return }
  if (!recOK) { recError.value = '这台设备不能录音，直接打字也行'; return }
  recError.value = ''
  srError.value = ''
  interim.value = ''
  if (recUrl.value) { revoke(recUrl.value); recUrl.value = '' }
  const ok = await startRecording()
  if (!alive) {
    if (isRecording()) stopRecording().then(u => { if (u) revoke(u) })
    return
  }
  recording.value = ok
  if (ok) {
    startClock()
    if (srOK) srStart('en-US', srHandlers)
  } else {
    recError.value = REC_ERROR[lastErrorName()] || '录不了音，直接打字也行'
  }
}

async function stopMic() {
  stopClock()
  srStop()
  const url = await stopRecording()
  if (!alive) { if (url) revoke(url); return }
  recording.value = false
  interim.value = ''
  if (url) recUrl.value = url
}

onBeforeUnmount(() => {
  alive = false
  stopClock()
  srStop()
  playback.value?.pause()
  if (recUrl.value) revoke(recUrl.value)
  if (isRecording()) stopRecording().then(u => { if (u) revoke(u) })
})
</script>

<style scoped>
.composer {
  position: relative;
  background: var(--story-input);
  border-top: 1px solid var(--story-line);
  padding: 8px 12px calc(12px + env(safe-area-inset-bottom));
}
.composer.is-gate { border-top: 2px solid var(--story-rose); }

.prehalt {
  margin: 0 0 4px;
  font-size: 17px;
  line-height: 26px;
  color: var(--story-dim);
  letter-spacing: 4px;
}

/* 候选行与输入条共用一条左轴线与底色 */
.axis {
  border-left: 2px solid var(--story-axis);
  padding-left: 12px;
}

.cand {
  position: relative;
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 0 8px 12px;
  background: none;
  border: none;
  border-bottom: 1px dashed var(--story-line);
  color: var(--story-dim);
  font-family: var(--font-cn);
  font-size: 17px;
  line-height: 26px;
  cursor: pointer;
}
/* 可选的信号：左侧 2px 竖标 + 停留位移与底色 */
.cand::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 2px;
  background: transparent;
}
.cand:hover,
.cand:focus-visible {
  background: var(--story-panel);
  color: var(--story-text);
  transform: translateX(2px);
  outline: none;
}
.cands.has-sel .cand:not(.sel) { color: var(--story-faint); }
.cands.has-sel .cand:not(.sel):hover,
.cands.has-sel .cand:not(.sel):focus-visible { color: var(--story-text); }
.cand.sel {
  background: #16131F;
  border-bottom: 1px solid var(--story-rose);
  color: var(--story-bright);
}
.cand.sel::before { background: var(--story-rose); }

.input-block {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 0 4px;
}
.line {
  flex: 1;
  min-width: 0;
  display: block;
  padding: 0;
  background: none;
  border: none;
  outline: none;
  resize: none;
  overflow: hidden;
  color: var(--story-bright);
  font-family: var(--font-cn);
  font-size: 17px;
  line-height: 26px;
  letter-spacing: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.line::placeholder {
  font-family: var(--font-cn);
  font-size: 17px;
  color: var(--story-faint);
}
.mic {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: var(--story-panel);
  border: 1px solid var(--story-line);
  border-radius: 0;
  color: var(--story-text);
  cursor: pointer;
}
.mic.on {
  border-color: var(--story-rose-soft);
  color: var(--story-rose-soft);
}
.rec-clock {
  flex-shrink: 0;
  font-family: var(--font-px);
  font-size: 24px;
  color: var(--story-rose-soft);
}
.send {
  height: 36px;
  padding: 0 14px;
  flex-shrink: 0;
  background: var(--story-panel);
  border: 1px solid var(--story-line);
  border-radius: 0;
  color: var(--story-text);
  font-family: var(--font-cn);
  font-size: 17px;
  cursor: pointer;
}
.send:disabled, .gate-key:disabled, .mic:disabled { color: var(--story-faint); cursor: default; }

/* 方键：直角、内凹边、按下整体下移 2px、波形横排 */
.gate-key {
  width: 64px;
  height: 36px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--story-key);
  border: 1px solid var(--story-key-edge);
  border-radius: 0;
  color: var(--story-rose-soft);
  box-shadow: inset 1px 1px 0 rgba(242, 239, 251, 0.12), inset -2px -2px 0 rgba(0, 0, 0, 0.75);
  transform: translateY(0);
  transition: transform 80ms steps(1, end), box-shadow 80ms steps(1, end), color 80ms steps(1, end);
  cursor: pointer;
}
.gate-key:active:not(:disabled) {
  transform: translateY(2px);
  box-shadow: inset 2px 2px 0 rgba(0, 0, 0, 0.85);
}
.gate-key:disabled { color: var(--story-faint); }

.interim {
  margin: 4px 0 0;
  font-family: var(--font-cn);
  font-size: 17px;
  line-height: 26px;
  color: var(--story-faint);
}
.issue {
  margin: 4px 0 0;
  font-size: 17px;
  line-height: 26px;
  color: var(--story-rose-soft);
}
.hint {
  margin: 8px 0 0;
  font-size: 17px;
  line-height: 26px;
  color: var(--story-text);
}

.playback { margin-top: 8px; }

.reference {
  margin-top: 8px;
  padding: 8px 12px;
  border: 1px dashed var(--story-rose);
}
.ref-line {
  margin: 0;
  font-family: var(--font-cn);
  font-size: 17px;
  line-height: 26px;
  color: var(--story-bright);
}
.ref-actions { display: flex; gap: 12px; margin-top: 8px; }
.read, .silence {
  padding: 4px 0;
  background: none;
  border: none;
  border-bottom: 1px solid var(--story-rose);
  color: var(--story-rose-soft);
  font-family: var(--font-cn);
  font-size: 17px;
  cursor: pointer;
}
.silence { color: var(--story-dim); border-bottom-style: dashed; border-bottom-color: var(--story-line); }
.silence.solo { margin-top: 8px; }

:deep(.rec-playback) { max-width: 100%; }
:deep(.pb-toggle) { border-radius: 0; background: var(--story-panel); border-color: var(--story-line); box-shadow: none; color: var(--story-text); }
:deep(.pb-bar) { border-radius: 0; }
:deep(.pb-bar::-webkit-slider-thumb) { border-radius: 0; background: var(--story-rose-soft); }
:deep(.pb-bar::-moz-range-thumb) { border-radius: 0; background: var(--story-rose-soft); }
:deep(.pb-time) { font-family: var(--font-px); font-size: 24px; color: var(--story-faint); }
</style>
