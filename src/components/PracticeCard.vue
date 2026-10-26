<template>
  <div class="card neu-raised" :class="{ flipped: revealed }">
    <div class="card-face">
      <span class="dir-pill">{{ direction === 'zh2en' ? '中 → 英' : '英 → 中' }}</span>
      <template v-if="mode === 'listen' && !listenTextShown && !revealed">
        <button class="btn btn-primary btn-listen" @click="onListenPlay">{{ playing ? '⏹ 停止' : '🎧 播放原句' }}</button>
        <button class="btn btn-skip" @click="listenTextShown = true">显示原文</button>
      </template>
      <template v-else-if="mode === 'retell' && !revealed">
        <button class="btn btn-primary btn-listen" @click="onRetellPlay">{{ playing ? '⏹ 停止' : (retellPlayed ? '↻ 重听' : '▶ 播放原句') }}</button>
        <div class="speed-seg">
          <button v-for="r in SPEEDS" :key="r" class="speed-btn" :class="{ active: speed === r }" @click="speed = r">{{ r }}x</button>
        </div>
        <button class="btn btn-primary btn-reveal" v-if="retellRecDone" @click="revealed = true; emit('revealed')">对照原文</button>
      </template>
      <template v-else>
        <p class="source">
          {{ sourceText }}
          <button v-if="canPlay" class="btn-speak" :title="playing ? '停止' : '朗读原句'" @click="onSpeak">{{ playing ? '⏹' : '🔊' }}</button>
        </p>
        <p v-if="speakError" class="audio-warn">{{ speakError }}</p>
        <button class="btn btn-primary btn-reveal" v-if="!revealed" @click="revealed = true; emit('revealed')">看参考译文</button>
        <div class="reference neu-inset" v-else>
          <p v-if="mode === 'retell'" class="reference-label">参考译文</p>
          <p>{{ referenceText }}</p>
        </div>
      </template>
      <p v-if="listenError" class="audio-warn">{{ listenError }}</p>
      <div class="rec-zone" v-if="recOK">
        <button v-if="!isRec" class="btn btn-rec" @click="onRecStart">🎙 录音</button>
        <div v-else class="rec-live">
          <button class="btn btn-rec recording" @click="onRecStop">⏹ 停止</button>
          <span class="rec-time">{{ recTimeText }}</span>
        </div>
        <p v-if="recFinal || recInterim" class="rec-sr">
          <span>{{ recFinal }}</span><span v-if="recInterim" class="sr-interim">{{ direction === 'zh2en' ? ' ' + recInterim : recInterim }}</span>
        </p>
        <p v-if="srError" class="audio-warn">{{ srError }}</p>
        <RecPlayback v-if="recUrl" ref="recPlayback" :src="recUrl" @playing="onRecPlaying" />
        <div v-if="recUrl" class="rec-actions">
          <button class="btn-rec-aux" :title="playing ? '停止' : '对照原句再听一遍'" @click="onSpeak">{{ playing ? '⏹ 停止' : '🔊 听原句' }}</button>
          <button class="btn-rec-aux" title="重新录一遍" @click="onRerecord">↻ 重录</button>
        </div>
      </div>
      <p v-if="recError" class="audio-warn">{{ recError }}</p>
      <button v-if="!hideSkip" class="btn btn-skip" @click="emit('skip')">跳过</button>
    </div>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { playText, stop } from '../lib/voice.js'
import { ttsSupported } from '../lib/tts.js'
import { recorderSupported, startRecording, stopRecording, revoke, isRecording, lastErrorName } from '../lib/recorder.js'
import { speechSupported, start as srStart, stop as srStop } from '../lib/speech.js'
import RecPlayback from './RecPlayback.vue'

const props = defineProps({
  sentence: { type: Object, required: true },
  direction: { type: String, default: 'zh2en' },
  mode: { type: String, default: 'sight' },
  hideSkip: { type: Boolean, default: false }
})
const emit = defineEmits(['revealed', 'skip', 'recStopped'])

const revealed = ref(false)
const listenTextShown = ref(false)
const listenError = ref('')
const speakError = ref('')
const ttsOK = ttsSupported() // 运行期不变，无需响应式
// 内置句有预生成音频，无 TTS 引擎也能播；自定义句只能靠 TTS
const canPlay = computed(() => props.sentence.source === 'builtin' || ttsOK)
const playing = ref(false)

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

watch(() => props.sentence, () => {
  revealed.value = false
  listenTextShown.value = false
  listenError.value = ''
  speakError.value = ''
  stop()
  playing.value = false
  retellPlayed.value = false
  retellRecDone.value = false
  // speed 故意不重置：调一次多句沿用
  isRec.value = false
  stopRecTimer()
  srStop() // 防旧句识别跨句继续出字
  recFinal.value = ''; recInterim.value = ''; srError.value = ''
  if (recUrl.value) { revoke(recUrl.value); recUrl.value = '' }
})

// 中途切模式不换句：清音频提示并重置语速，避免旧模式状态残留（朗读停止由父级 applyMode 负责）
watch(() => props.mode, () => {
  listenError.value = ''
  speakError.value = ''
  speed.value = 1
})

const sourceText = computed(() => (props.direction === 'zh2en' ? props.sentence.zh : props.sentence.en) || props.sentence.zh || props.sentence.en)
// 源语言按实际文本判定：自定义句可能缺 zh 或 en 字段，direction 与实际语言可能不一致
const sourceLang = computed(() => (/[\u4e00-\u9fff]/.test(sourceText.value) ? 'zh' : 'en'))
const referenceText = computed(() => {
  const t = props.direction === 'zh2en' ? props.sentence.en : props.sentence.zh
  return t || '（此句无参考译文，凭感觉评即可）'
})

async function playCurrent() {
  if (recPlayback.value) recPlayback.value.pause() // 互斥：播原句前先停自己的回放
  // rate 仅复述模式生效；其他模式走 playText 缺省路径（rate undefined 时不触碰 playbackRate）
  const r = await playText({ id: props.sentence.id, source: props.sentence.source, text: sourceText.value, lang: sourceLang.value, rate: props.mode === 'retell' ? speed.value : undefined })
  playing.value = false
  return r !== 'failed'
}

function onSpeak() {
  speakError.value = ''
  if (playing.value) { stop(); return } // 播放中再点 = 停止
  playing.value = true
  playCurrent().then(ok => {
    if (!ok) speakError.value = `设备缺少${sourceLang.value === 'zh' ? '中文' : '英文'}语音包`
  })
}

function onListenPlay() {
  listenError.value = ''
  if (playing.value) { stop(); return }
  playing.value = true
  playCurrent().then(ok => {
    if (!ok) {
      listenError.value = '当前设备无语音引擎，已显示原文'
      listenTextShown.value = true
    }
  })
}

const recOK = recorderSupported() // 运行期不变

// —— 语音识别：跟录音绑定，识别是增强功能，任何失败不影响录音 ——
const srOK = speechSupported()
const recFinal = ref('')
const recInterim = ref('')
const srError = ref('')
const srLang = computed(() => {
  if (props.mode === 'retell') return sourceLang.value === 'zh' ? 'zh-CN' : 'en-US'
  return props.direction === 'zh2en' ? 'en-US' : 'zh-CN'
})
const SR_ERROR_TEXT = {
  'not-allowed': '语音识别权限被拒，可在地址栏允许后重试；录音不受影响',
  network: '识别服务连接不稳定，多次重试仍失败；录音不受影响',
  'audio-capture': '麦克风不可用于识别；录音不受影响'
}
function onSrFinal(text) {
  if (!text) return
  recInterim.value = '' // final 送达后清除 stale interim，防重复残影
  recFinal.value += (srLang.value === 'en-US' && recFinal.value ? ' ' : '') + text
}
function onSrInterim(text) { recInterim.value = text }
const srHandlers = {
  onFinal: onSrFinal,
  onInterim: onSrInterim,
  onError: name => { srError.value = SR_ERROR_TEXT[name] || '语音识别暂不可用；录音不受影响' }
}
const isRec = ref(false)
const recUrl = ref('')
const recError = ref('')
const recPlayback = ref(null)
const recSeconds = ref(0)
let recTimer = null
let alive = true
const recTimeText = computed(() => {
  const m = String(Math.floor(recSeconds.value / 60)).padStart(2, '0')
  const s = String(recSeconds.value % 60).padStart(2, '0')
  return `${m}:${s}`
})

function startRecTimer() {
  stopRecTimer()
  recSeconds.value = 0
  recTimer = setInterval(() => { recSeconds.value++ }, 1000)
}

function stopRecTimer() {
  if (recTimer) { clearInterval(recTimer); recTimer = null }
}

// getUserMedia 常见失败原因 → 具体提示（含历史别名，Safari/旧内核命名不同）
const REC_ERROR_TEXT = {
  NotAllowedError: '麦克风权限被拒绝，请在地址栏锁形图标中允许后重试',
  SecurityError: '麦克风权限被拒绝，请在地址栏锁形图标中允许后重试',
  NotFoundError: '未检测到麦克风设备',
  DevicesNotFoundError: '未检测到麦克风设备',
  NotReadableError: '麦克风被其他应用占用，关闭占用后重试',
  TrackStartError: '麦克风被其他应用占用，关闭占用后重试'
}

async function onRecStart() {
  recError.value = ''
  if (recUrl.value) { revoke(recUrl.value); recUrl.value = '' }
  recFinal.value = ''; recInterim.value = ''; srError.value = '' // 文字与回放同生命周期
  const ok = await startRecording()
  // 启动期间组件已卸载：recorder 此刻才真正开始录音，需主动停掉并释放麦克风
  if (!alive) {
    if (isRecording()) stopRecording().then(u => { if (u) revoke(u) })
    return
  }
  isRec.value = ok
  if (ok) startRecTimer()
  if (ok && srOK) srStart(srLang.value, srHandlers)
  if (!ok) recError.value = REC_ERROR_TEXT[lastErrorName()] || '无法访问麦克风'
}

async function onRecStop() {
  stopRecTimer()
  srStop()
  const url = await stopRecording()
  // 停止在途时组件已卸载：只回收 URL，不再写组件状态或 emit
  if (!alive) {
    if (url) revoke(url)
    return
  }
  isRec.value = false
  if (url) recUrl.value = url
  if (props.mode === 'retell') retellRecDone.value = true
  emit('recStopped', recFinal.value || '')
}

// 互斥：自己的回放开播时停掉原句（听原句与上方 🔊 共用 playing 状态）
function onRecPlaying() {
  if (playing.value) { stop(); playing.value = false }
}

// 重录：停掉原句与回放后直接开始新录音（revoke 旧 URL 由 onRecStart 处理）
async function onRerecord() {
  if (playing.value) { stop(); playing.value = false }
  if (recPlayback.value) recPlayback.value.pause()
  await onRecStart()
}

onUnmounted(() => {
  alive = false
  stop()
  srStop()
  stopRecTimer()
  if (recUrl.value) revoke(recUrl.value)
  // 卸载时若仍在录音，真正停掉 MediaRecorder 并释放麦克风；回调只 revoke，不碰组件状态
  if (isRecording()) stopRecording().then(url => { if (url) revoke(url) })
})
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
.rec-zone { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.btn-rec { font-size: 13px; padding: 8px 16px; }
.btn-rec.recording {
  color: #e8463a;
  animation: rec-pulse 1.6s ease-in-out infinite;
}
.rec-live { display: flex; align-items: center; gap: 8px; }
.rec-time { font-size: 13px; color: #e8463a; font-variant-numeric: tabular-nums; }
.rec-actions { display: flex; gap: 18px; }
.btn-rec-aux {
  border: none; background: none; cursor: pointer; font: inherit;
  font-size: 13px; color: var(--text-muted); padding: 2px 4px; border-radius: 8px;
  transition: color 0.15s ease, transform 0.12s ease;
}
.btn-rec-aux:active { transform: scale(0.95); color: var(--accent-text); }

.rec-sr { font-size: 13px; line-height: 1.6; color: var(--text-muted); text-align: center; margin: 0; }
.sr-interim { opacity: 0.45; }

.speed-seg { display: flex; gap: 4px; }
.speed-btn {
  border: none; cursor: pointer; font: inherit; font-size: 12px; color: var(--text-muted);
  background: var(--surface); border-radius: 10px; padding: 6px 12px; box-shadow: var(--shadow-out);
  transition: box-shadow 0.12s ease, color 0.12s ease;
}
.speed-btn.active { color: var(--accent-text); box-shadow: var(--shadow-in); }
.reference-label { font-size: 12px; color: var(--text-muted); margin: 0 0 6px; }

@keyframes rec-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(232, 70, 58, 0.3); }
  50% { box-shadow: 0 0 0 8px rgba(232, 70, 58, 0); }
}
@media (prefers-reduced-motion: reduce) {
  .btn-rec.recording { animation: none; }
}
</style>
