<template>
  <main class="view">
    <header class="practice-header">
      <span class="count">{{ done }}</span>
      <span v-if="settings.showTimer" class="timer">{{ elapsed }}s</span>
      <button class="btn btn-history" @click="showHistory = true">历史</button>
    </header>

    <template v-if="current">
      <PracticeCard :sentence="current.sentence" :direction="current.direction" :mode="settings.mode" @revealed="onRevealed" @skip="next(false)" />
      <div class="rating-zone">
        <RatingButtons v-if="current.revealed" @rate="rate" />
        <p v-else class="hint">口头译出后，点「看参考译文」对照</p>
      </div>
      <div class="toggles">
        <button class="btn dir-toggle" @click="flipDirection">{{ current.direction === 'zh2en' ? '英 → 中' : '中 → 英' }}</button>
        <div class="mode-toggle">
          <button class="btn mode-btn" :class="{ active: settings.mode === 'sight' }" @click="applyMode('sight')">视译</button>
          <button class="btn mode-btn" :class="{ active: settings.mode === 'listen' }" @click="applyMode('listen')">听辨</button>
        </div>
      </div>
    </template>
    <div v-else class="empty neu-raised">
      <p>这里空空的</p>
      <p class="hint">去「题库」挑个主题，或到「粘贴」丢一段文字进来</p>
    </div>

    <p v-if="saveWarn" class="save-warn">存储不可用或已满，本轮记录与复习进度不保存</p>
    <SessionHistory v-if="showHistory" :items="history" @close="showHistory = false" />
  </main>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import PracticeCard from '../components/PracticeCard.vue'
import RatingButtons from '../components/RatingButtons.vue'
import SessionHistory from '../components/SessionHistory.vue'
import { settings, setMode } from '../stores/settings.js'
import { allBuiltinSentences, getCustomSentences } from '../lib/sentences.js'
import { drawSentence } from '../lib/picker.js'
import { dueQueue, quotaAvailable, isDue, onRated } from '../lib/srs.js'
import { addRecord } from '../lib/records.js'
import { storageAvailable } from '../lib/storage.js'
import { cancel } from '../lib/tts.js'

const pool = ref([])
const current = ref(null)
const history = ref([])
const showHistory = ref(false)
const saveWarn = ref(!storageAvailable())
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

function next(counted, rating) {
  if (counted) history.value.push({ ...current.value, rating })
  const s = drawSentence({ pool: pool.value, lastId: current.value?.sentence.id ?? null, dueIds: dueQueue(pool.value), dueAllowed: quotaAvailable() })
  current.value = s ? { sentence: { ...s }, direction: settings.value.direction, revealed: false } : null
  startTimer()
}

function onRevealed() {
  if (current.value) current.value.revealed = true
}

function rate(rating) {
  if (!current.value) return
  const sentenceId = current.value.sentence.id
  const saved = addRecord({ sentenceId, direction: current.value.direction, rating })
  if (!saved) saveWarn.value = true
  // 硬上限：配额满后随机撞到的到期句不再计入配额，used 精确封顶 DAILY_CAP
  onRated({ sentenceId, rating, wasDue: isDue(sentenceId) && quotaAvailable() })
  next(true, rating)
}

onUnmounted(() => { clearInterval(timerId); cancel() })

function flipDirection() {
  current.value.direction = current.value.direction === 'zh2en' ? 'en2zh' : 'zh2en'
}

function applyMode(m) {
  if (m === settings.value.mode) return
  cancel() // 切模式立即停止朗读
  setMode(m)
}

onMounted(() => {
  const raw = sessionStorage.getItem('interpret.session')
  if (raw) sessionStorage.removeItem('interpret.session')
  let session = null
  try {
    session = raw ? JSON.parse(raw) : null
  } catch {
    session = null // 坏标记降级为普通全量会话
  }
  if (session?.persistWarn) saveWarn.value = true // 粘贴句未能持久化（存储禁用/已满）
  if (session?.mode === 'topic') {
    // 主题限定会话：只取该主题内置句，无效主题/空池回退全量
    const topicPool = allBuiltinSentences().filter(s => s.topic === session.topicId)
    pool.value = topicPool.length ? topicPool : [...allBuiltinSentences(), ...getCustomSentences()]
  } else if (session?.mode === 'paste') {
    // 粘贴会话：只取自定义句（含历史粘贴），空池回退全量
    const customPool = getCustomSentences()
    pool.value = customPool.length ? customPool : [...allBuiltinSentences(), ...getCustomSentences()]
  } else {
    pool.value = [...allBuiltinSentences(), ...getCustomSentences()]
  }
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
.toggles { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
.dir-toggle { font-size: 13px; opacity: 0.7; }
.mode-toggle { display: flex; gap: 4px; }
.mode-btn { font-size: 13px; opacity: 0.7; padding: 8px 12px; }
.mode-btn.active { opacity: 1; color: var(--accent-text); box-shadow: var(--shadow-in); }
.empty { padding: 40px 20px; text-align: center; }
.save-warn { text-align: center; font-size: 12px; color: #e8463a; opacity: 0.8; margin: 12px 0 0; }
</style>
