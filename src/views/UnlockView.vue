<template>
  <main class="view">
    <header class="unlock-header">
      <button class="btn btn-back" @click="backToPractice">返回</button>
      <span class="unlock-name">{{ card ? card.name : '' }}</span>
      <span v-if="card" class="tier-tag">{{ TIER_LABEL[card.tier] }}</span>
    </header>

    <template v-if="card">
      <div class="reveal-wrap">
        <CardReveal
          :name="card.name" :tier="card.tier" :accent="card.accent"
          :progress="entry.progress" :hidden="entry.hidden" :full="hiddenChallenge"
        />
      </div>
      <p class="hint">{{ tip }}</p>

      <PracticeCard
        :key="attemptKey"
        :sentence="sentence"
        :direction="direction"
        mode="sight"
        @revealed="onRevealed"
        @rec-stopped="onRecStopped"
      />

      <div class="unlock-zone">
        <template v-if="!result">
          <p v-if="!recorded" class="hint">先录一次音，再给自己评档</p>
          <template v-else>
            <p v-if="!recOK" class="hint">本设备无法录音，本次为自评</p>
            <label class="sr-edit">识别文本（可修改，改完再让 AI 评）
              <textarea v-model="spokenText" rows="2" maxlength="1000" placeholder="没有识别文字也可以直接自评" @input="onSpokenInput"></textarea>
            </label>
            <button v-if="aiConfigured && recOK && spokenText.trim()" class="btn btn-ai" :disabled="aiBusy" @click="askAi">
              {{ aiBusy ? 'AI 评分中…' : '让 AI 评一下' }}
            </button>
            <p v-if="aiNote" class="ai-note">{{ aiNote }}</p>
            <RatingButtons variant="unlock" @rate="onRate" />
            <p v-if="!aiResult && aiConfigured && recOK" class="hint">本次为自评</p>
          </template>

          <div v-if="confirm" class="confirm neu-raised">
            <p>机器认为你翻出了 {{ confirm.ai }}%，确定按 {{ confirm.self }}% 解锁吗？</p>
            <div class="confirm-actions">
              <button class="btn btn-primary" @click="submit(confirm.self)">按我的 {{ confirm.self }}%</button>
              <button class="btn" @click="submit(confirm.ai)">改成 {{ confirm.ai }}%</button>
            </div>
          </div>
        </template>

        <div v-else class="result neu-raised">
          <p class="result-title">本次 {{ result.bucket }}% · 卡面进度 {{ result.progress }}%</p>
          <p v-if="result.unlockedNow">普通形态已永久解锁</p>
          <p v-if="result.hiddenNow" class="gold">隐藏形态已获得</p>
          <p v-if="result.hiddenMissed" class="hint">隐藏形态资格已作废，等下次再抽到这张卡</p>
          <p v-if="result.peekedBlocked" class="hint">看过参考译文，本次隐藏形态资格已作废</p>
          <div class="result-actions">
            <button class="btn" @click="backToPractice">返回练习</button>
            <button class="btn" @click="retry">再试一次</button>
          </div>
        </div>

        <p v-if="saveWarn" class="save-warn">存储不可用或已满，本次评分与收集进度不保存</p>
      </div>
    </template>

    <div v-else class="empty neu-raised">
      <p>这张卡还没有抽到</p>
      <button class="btn" @click="backToPractice">去练习</button>
    </div>
  </main>
</template>

<script setup>
import { computed, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PracticeCard from '../components/PracticeCard.vue'
import CardReveal from '../components/CardReveal.vue'
import RatingButtons from '../components/RatingButtons.vue'
import { cardById, getCardState, markPeeked, recordAttempt, hiddenChallengeOf, unlockSentence } from '../lib/cards.js'
import { addRecord } from '../lib/records.js'
import { onRated } from '../lib/srs.js'
import { storageAvailable } from '../lib/storage.js'
import { recorderSupported } from '../lib/recorder.js'
import { addPractice } from '../lib/progress.js'
import { settings } from '../stores/settings.js'
import { getAiConfig, aiReady, gradeWithAI, needsConfirm } from '../lib/grade.js'

const route = useRoute()
const router = useRouter()
const TIER_LABEL = { normal: '普通', rare: '稀有', super: '超稀有' }

const card = cardById(route.params.id)
const direction = settings.value.direction // 进页即固定，不跟随全局切换
const sentence = card ? unlockSentence(card) : null
const entry = ref(card ? getCardState(card.id) : null)
const hiddenChallenge = computed(() => (card ? hiddenChallengeOf(entry.value) : false))

const recOK = recorderSupported() // 运行期不变
const recorded = ref(!recOK) // 无法录音时直接进入自评，避免死路
const spokenText = ref('')
const aiConfig = getAiConfig()
const aiConfigured = aiReady(aiConfig)
const aiBusy = ref(false)
const aiNote = ref('')
const aiResult = ref(null)
let aiSeq = 0
const confirm = ref(null)
const result = ref(null)
const saveWarn = ref(!storageAvailable())
const attemptKey = ref(0)

const tip = computed(() => {
  if (entry.value?.attempts > 0) return '再练一次，卡面进度只升不降'
  if (hiddenChallenge.value) return '隐藏挑战：卡面已完整显示，这次第一发翻到 100% 才能拿到隐藏形态'
  if (entry.value?.peeked) return '已看过参考译文，本次隐藏形态资格已作废；剪影会按你翻出的程度露出'
  return '口译这一句，剪影会按你翻出的程度露出；第一次就翻到 100% 可得隐藏形态'
})

function sourceText() {
  return direction === 'zh2en' ? card.unlock.zh : card.unlock.en
}

function referenceText() {
  return direction === 'zh2en' ? card.unlock.en : card.unlock.zh
}

function onRevealed() {
  if (!card) return
  const r = markPeeked(card.id)
  entry.value = { ...entry.value, peeked: true }
  if (!r.persisted) saveWarn.value = true
}

function onRecStopped(text) {
  recorded.value = true
  spokenText.value = text || ''
}

async function askAi() {
  if (!card) return
  const seq = ++aiSeq
  confirm.value = null // 新请求进行中，旧 AI 档位不能再用于提交
  aiBusy.value = true
  try {
    const r = await gradeWithAI({
      config: aiConfig,
      sourceText: sourceText(),
      referenceText: referenceText(),
      spokenText: spokenText.value.trim().slice(0, 1000)
    })
    if (seq !== aiSeq) return
    aiResult.value = r
    aiNote.value = r.bucket === null ? 'AI 暂时给不出分，本次为自评' : `AI 认为 ${r.bucket}%${r.reason ? '：' + r.reason : ''}`
  } catch {
    if (seq !== aiSeq) return
    aiResult.value = null
    aiNote.value = 'AI 暂时给不出分' // 底部「本次为自评」已说明降级，避免重复
  } finally {
    if (seq === aiSeq) aiBusy.value = false
  }
}

// 识别文本一变，上一轮 AI 结论立即失效（含仍在途的请求）
function onSpokenInput() {
  aiSeq += 1
  aiBusy.value = false
  aiResult.value = null
  aiNote.value = ''
  confirm.value = null
}

function onRate(bucket) {
  if (needsConfirm(bucket, aiResult.value?.bucket)) {
    confirm.value = { self: bucket, ai: aiResult.value.bucket }
    return
  }
  submit(bucket)
}

function submit(bucket) {
  confirm.value = null
  const prev = getCardState(card.id) // 取落库的最新状态，偷看标记才能生效
  const attempt = recordAttempt({ cardId: card.id, bucket })
  entry.value = attempt.entry
  if (!attempt.persisted) saveWarn.value = true

  const rating = bucket >= 75 ? 'ok' : bucket > 0 ? 'shaky' : 'miss'
  if (!addRecord({ sentenceId: sentence.id, direction, rating })) saveWarn.value = true
  if (!onRated({ sentenceId: sentence.id, rating })) saveWarn.value = true
  if (!addPractice().persisted) saveWarn.value = true

  result.value = {
    bucket,
    progress: attempt.entry.progress,
    unlockedNow: !prev.unlocked && attempt.entry.unlocked,
    hiddenNow: attempt.hiddenNow,
    hiddenMissed: prev.attempts === 0 && bucket < 100 && !prev.hidden,
    peekedBlocked: prev.attempts === 0 && bucket === 100 && prev.peeked && !prev.hidden
  }
}

function retry() {
  result.value = null
  recorded.value = !recOK
  spokenText.value = ''
  aiSeq += 1
  aiBusy.value = false
  aiResult.value = null
  aiNote.value = ''
  attemptKey.value += 1
}

function backToPractice() {
  router.push('/')
}

onUnmounted(() => {
  aiSeq += 1
  aiBusy.value = false
  aiResult.value = null
  aiNote.value = ''
})
</script>

<style scoped>
.unlock-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.btn-back { font-size: 13px; padding: 8px 14px; }
.unlock-name { font-size: 16px; font-weight: 600; }
.tier-tag { font-size: 11px; padding: 3px 10px; border-radius: 999px; background: var(--accent-soft); color: var(--accent-text); }
.reveal-wrap { width: min(220px, 56vw); margin: 0 auto 12px; }
.hint { font-size: 13px; color: var(--text-muted); text-align: center; }
.unlock-zone { margin-top: 20px; }
.sr-edit { display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 10px; }
.sr-edit textarea {
  width: 100%; margin-top: 6px; padding: 10px;
  border: none; border-radius: 12px; resize: vertical;
  background: var(--surface-deep); color: var(--text); font: inherit; font-size: 14px;
  box-shadow: var(--shadow-in);
}
.btn-ai { display: block; margin: 0 auto 10px; font-size: 13px; padding: 8px 16px; }
.ai-note { font-size: 13px; color: var(--accent-text); text-align: center; margin: 0 0 10px; }
.confirm { padding: 16px; margin-top: 14px; }
.confirm p { font-size: 14px; line-height: 1.6; margin: 0 0 12px; }
.confirm-actions, .result-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.result { padding: 16px; margin-top: 14px; }
.result-title { font-size: 15px; font-weight: 600; margin: 0 0 8px; }
.result p { font-size: 13px; margin: 4px 0; }
.gold { color: var(--gold-text); }
.save-warn { text-align: center; font-size: 12px; color: #e8463a; opacity: 0.8; margin: 12px 0 0; }
.empty { padding: 40px 20px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 14px; }
</style>
