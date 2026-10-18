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
