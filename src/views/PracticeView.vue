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
import { computed, onMounted, onUnmounted, ref } from 'vue'
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
  current.value = s ? { sentence: { ...s }, direction: settings.value.direction, revealed: false } : null
  startTimer()
}

function onRevealed() {
  if (current.value) current.value.revealed = true
}

function rate(rating) {
  if (!current.value) return
  addRecord({ sentenceId: current.value.sentence.id, direction: current.value.direction, rating })
  next(true)
}

onUnmounted(() => clearInterval(timerId))

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
