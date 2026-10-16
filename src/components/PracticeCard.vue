<template>
  <div class="card neu-raised" :class="{ flipped: revealed }">
    <div class="card-face">
      <span class="dir-pill">{{ direction === 'zh2en' ? '中 → 英' : '英 → 中' }}</span>
      <template v-if="mode === 'listen' && !listenTextShown && !revealed">
        <button class="btn btn-primary btn-listen" @click="onListenPlay">🎧 播放原句</button>
        <button class="btn btn-skip" @click="listenTextShown = true">显示原文</button>
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
      <p v-if="listenError" class="audio-warn">{{ listenError }}</p>
      <div class="rec-zone" v-if="recOK && !revealed">
        <button v-if="!isRec" class="btn btn-rec" @click="onRecStart">🎙 录音</button>
        <button v-else class="btn btn-rec recording" @click="onRecStop">⏹ 停止</button>
        <audio v-if="recUrl" class="rec-playback" :src="recUrl" controls></audio>
      </div>
      <p v-if="recError" class="audio-warn">{{ recError }}</p>
      <button class="btn btn-skip" @click="emit('skip')">跳过</button>
    </div>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { cancel, speak, ttsSupported } from '../lib/tts.js'
import { recorderSupported, startRecording, stopRecording, revoke } from '../lib/recorder.js'

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
  isRec.value = false
  if (recUrl.value) { revoke(recUrl.value); recUrl.value = '' }
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

onUnmounted(() => {
  cancel()
  if (recUrl.value) revoke(recUrl.value)
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
.btn-rec.recording { color: #e8463a; }
.rec-playback { width: 100%; max-width: 260px; height: 36px; }
</style>
