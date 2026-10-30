<template>
  <main class="view">
    <section v-if="scene" class="scene-bar neu-raised">
      <div class="scene-top">
        <span class="scene-title">{{ scene.title }}</span>
        <span class="scene-bond">羁绊 {{ bond }}</span>
      </div>
      <p class="scene-place">{{ scene.place }} · {{ scene.time }} · {{ scene.spirit.name }}</p>
      <p class="scene-premise">{{ premiseText }}</p>
      <div class="scene-foot">
        <span>本场 {{ sceneStat.cleared }}/{{ sceneStat.total }}</span>
        <span v-if="lastGain" class="bond-gain">+{{ lastGain.amount }} 羁绊<em v-if="lastGain.note">（{{ lastGain.note }}）</em></span>
        <span v-if="sceneStat.done" class="scene-done">已练完</span>
      </div>
    </section>

    <header class="practice-header">
      <span class="count">已完成 {{ done }}</span>
      <span v-if="settings.showTimer" class="timer">{{ elapsed }}s</span>
      <span class="prog">{{ prog.practiced }}/{{ progThreshold }} · 券 ×{{ prog.tickets }}</span>
      <button class="btn btn-draw" :disabled="drawDisabled" @click="draw">{{ drawLabel }}</button>
      <button class="btn btn-history" @click="showHistory = true">历史</button>
    </header>

    <template v-if="current">
      <PracticeCard :sentence="current.sentence" :direction="current.direction" :mode="settings.mode" @revealed="onRevealed" @rec-stopped="onRecStopped" @skip="next(false)" />
      <div class="rating-zone">
        <RatingButtons v-if="showRating" :variant="settings.mode === 'retell' ? 'retell' : 'translate'" @rate="rate" />
        <p v-else class="hint">{{ modeHint }}</p>
      </div>
      <div v-if="lingUtter" class="ling-bubble neu-raised" role="status" :aria-label="`铃说：${lingUtter.text}`">
        <LingSprite :size="48" />
        <p class="ling-text">{{ lingUtter.text }}</p>
      </div>
      <div class="toggles">
        <button class="btn dir-toggle" @click="flipDirection">{{ current.direction === 'zh2en' ? '英 → 中' : '中 → 英' }}</button>
        <div class="mode-toggle">
          <button class="btn mode-btn" :class="{ active: settings.mode === 'sight' }" @click="applyMode('sight')">视译</button>
          <button class="btn mode-btn" :class="{ active: settings.mode === 'listen' }" @click="applyMode('listen')">听辨</button>
          <button class="btn mode-btn" :class="{ active: settings.mode === 'retell' }" @click="applyMode('retell')">复述</button>
        </div>
      </div>
    </template>
    <div v-else class="empty neu-raised">
      <LingSprite :size="64" />
      <p class="ling-quote">{{ emptyQuip }}</p>
      <p class="hint">去「题库」挑个主题，或到「粘贴」丢一段文字进来</p>
    </div>

    <p v-if="saveWarn" class="save-warn">存储不可用或已满，本轮记录、复习进度与抽卡进度不保存</p>
    <SessionHistory v-if="showHistory" :items="history" @close="showHistory = false" />
    <DrawOverlay
      v-if="drawn"
      :card="drawn.def"
      :is-new="drawn.isNew"
      :hidden-challenge="drawn.hiddenChallenge"
      @start="startUnlock"
      @later="drawn = null"
    />
    <ChoiceOverlay
      v-if="pendingChoice && !choiceDismissed"
      :choice="pendingChoice"
      @choose="onChoice"
      @later="choiceDismissed = true"
    />
  </main>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PracticeCard from '../components/PracticeCard.vue'
import RatingButtons from '../components/RatingButtons.vue'
import SessionHistory from '../components/SessionHistory.vue'
import DrawOverlay from '../components/DrawOverlay.vue'
import ChoiceOverlay from '../components/ChoiceOverlay.vue'
import LingSprite from '../components/LingSprite.vue'
import { pick as pickQuip } from '../lib/lingQuips.js'
import { settings, setMode } from '../stores/settings.js'
import { allBuiltinSentences, getCustomSentences } from '../lib/sentences.js'
import { allScenes, sceneById, sceneSentences, sceneProgress, sceneOpening } from '../lib/scenes.js'
import { awardBond, getSpiritBond, clearedLineIds, advanceStory, getStory, recordChoice } from '../lib/bonds.js'
import { drawSentence } from '../lib/picker.js'
import { dueQueue, quotaAvailable, isDue, onRated } from '../lib/srs.js'
import { addRecord } from '../lib/records.js'
import { storageAvailable } from '../lib/storage.js'
import { stop } from '../lib/voice.js'
import { allCards, cardById, getCards, onDrawn, hiddenChallengeOf } from '../lib/cards.js'
import { drawCard, allCollected } from '../lib/cardpool.js'
import { getProgress, addPractice, spendTicket, applyDraw, remainingForTicket, thresholdFor } from '../lib/progress.js'

const pool = ref([])
const current = ref(null)
const history = ref([])
const showHistory = ref(false)
const saveWarn = ref(!storageAvailable())
const done = computed(() => history.value.length)
const router = useRouter()
const prog = ref(getProgress())
const cardsState = ref(getCards())
const drawn = ref(null)
const cardList = allCards()
// —— 场景模式：当前现场、精灵羁绊、本场已练句 ——
const scene = ref(null)
const bond = ref(0)
const clearedIds = ref(new Set())
const lastGain = ref(null)
// —— 铃的临场冒泡：评分后/场景完成/空态 ——
const lingUtter = ref(null)      // { text } 或 null；自动 3s 消隐
let lingTimer = null
const sceneDoneShown = ref(false) // 本场 sceneDone quip 只说一次
const emptyQuip = computed(() => pickQuip('empty', done.value))
function setLingUtter(bucket, stir = 0) {
  const text = pickQuip(bucket, stir)
  if (!text) return
  lingUtter.value = { text }
  clearTimeout(lingTimer)
  lingTimer = setTimeout(() => { lingUtter.value = null }, 3000)
}
const sceneStat = computed(() => (scene.value ? sceneProgress(scene.value, clearedIds.value, story.value.flags) : { cleared: 0, total: 0, done: false }))
// —— 抉择：本场练完且还没选过时出现，选完落 flag、再推进主线 ——
const story = ref(getStory())
const choiceDismissed = ref(false)
const premiseText = computed(() => (scene.value ? sceneOpening(scene.value, story.value.flags) : ''))
const pendingChoice = computed(() => {
  const s = scene.value
  if (!s?.choice || !sceneStat.value.done) return null
  return story.value.choices[s.id] ? null : s.choice
})
const progThreshold = computed(() => thresholdFor(prog.value))
const collected = computed(() => allCollected(cardList, cardsState.value))
const drawDisabled = computed(() => prog.value.tickets < 1 || collected.value || cardList.length === 0)
const drawLabel = computed(() => {
  if (collected.value) return '全部收集完成'
  if (prog.value.tickets < 1) return `还差 ${remainingForTicket(prog.value)} 句`
  return '抽卡'
})
const showRating = computed(() => current.value && (current.value.revealed || (settings.value.mode === 'retell' && current.value.recDone)))
const modeHint = computed(() => settings.value.mode === 'retell' ? '听完 → 开口复述 → 对照原文后自评' : '口头译出后，点「看参考译文」对照')
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
  // 场景句自带设计方向；普通池沿用全局方向设置
  current.value = s ? { sentence: { ...s }, direction: s.dir || settings.value.direction, revealed: false, recDone: false } : null
  startTimer()
}

function refreshBond() {
  if (!scene.value) return
  bond.value = getSpiritBond(scene.value.spirit.id).bond
  clearedIds.value = clearedLineIds(scene.value.spirit.id)
}

// 有抉择的场次：等玩家选完再推进主线；没有抉择的场次练完即推进
function maybeAdvance() {
  const s = scene.value
  if (!s || !sceneStat.value.done) return
  if (s.choice && !story.value.choices[s.id]) return
  const adv = advanceStory(s.id)
  if (!adv.persisted) saveWarn.value = true
  story.value = adv.state
}

function onChoice(optionId) {
  const res = recordChoice(scene.value.id, optionId)
  if (!res.persisted) saveWarn.value = true
  story.value = res.state
  choiceDismissed.value = false
  maybeAdvance()
}

function trackBond(lineId, rating) {
  const res = awardBond({ spiritId: scene.value.spirit.id, lineId, register: scene.value.register, rating })
  if (!res.persisted) saveWarn.value = true
  refreshBond()
  lastGain.value = {
    amount: res.gained,
    note: res.reason === 'daily-limit' ? '今日这句已满 3 次' : res.reason === 'repeat' ? '重复 ×0.2' : ''
  }
  maybeAdvance()
}

function onRevealed() {
  if (current.value) current.value.revealed = true
}

function onRecStopped() {
  if (current.value) current.value.recDone = true
}

function rate(rating) {
  if (!current.value) return
  const sentenceId = current.value.sentence.id
  const saved = addRecord({ sentenceId, direction: current.value.direction, rating })
  if (!saved) saveWarn.value = true
  // 硬上限：配额满后随机撞到的到期句不再计入配额，used 精确封顶 DAILY_CAP
  onRated({ sentenceId, rating, wasDue: isDue(sentenceId) && quotaAvailable() })
  const p = addPractice()
  prog.value = p.state
  if (!p.persisted) saveWarn.value = true
  if (scene.value) trackBond(sentenceId, rating)
  next(true, rating)
  // 铃的即时反应：评完再说，避免卡片还没翻完就闪出来
  setLingUtter(`afterRate.${rating}`, history.value.length)
}

function draw() {
  if (drawDisabled.value) return
  const pick = drawCard({ cards: cardList, owned: Object.keys(getCards()), sinceNew: prog.value.sinceNew })
  if (!pick) return

  // 先发卡再扣券：极端存储失败下最多「多送一张卡」，不会出现「券扣了但没卡」
  const drawnState = onDrawn(pick.cardId)
  cardsState.value = drawnState.state
  if (!drawnState.persisted) saveWarn.value = true

  const spent = spendTicket()
  if (spent) {
    prog.value = spent.state
    if (!spent.persisted) saveWarn.value = true
  }

  const after = applyDraw(pick.isNew)
  prog.value = after.state
  if (!after.persisted) saveWarn.value = true

  drawn.value = {
    def: cardById(pick.cardId),
    isNew: pick.isNew,
    hiddenChallenge: hiddenChallengeOf(cardsState.value[pick.cardId])
  }
}

function startUnlock() {
  const id = drawn.value?.def?.id
  drawn.value = null
  if (id) router.push(`/unlock/${id}`)
}

onUnmounted(() => { clearInterval(timerId); clearTimeout(lingTimer); stop() })

// 换场景时重置 sceneDone 标记，scene 完成后铃只说一次
watch(() => scene.value?.id, () => {
  sceneDoneShown.value = false
  lingUtter.value = null
})
watch(() => sceneStat.value.done, (done) => {
  if (done && !sceneDoneShown.value) {
    sceneDoneShown.value = true
    setLingUtter('sceneDone', history.value.length)
  }
})

function flipDirection() {
  current.value.direction = current.value.direction === 'zh2en' ? 'en2zh' : 'zh2en'
}

function applyMode(m) {
  if (m === settings.value.mode) return
  stop() // 切模式立即停止播放
  setMode(m)
}

onMounted(() => {
  prog.value = getProgress()
  cardsState.value = getCards()
  const raw = sessionStorage.getItem('interpret.session')
  if (raw) sessionStorage.removeItem('interpret.session')
  let session = null
  try {
    session = raw ? JSON.parse(raw) : null
  } catch {
    session = null // 坏标记降级为普通全量会话
  }
  if (session?.persistWarn) saveWarn.value = true // 粘贴句未能持久化（存储禁用/已满）
  if (session?.mode === 'scene') {
    // 场景会话：只取该场景的句，空场景回退全量
    const picked = sceneById(session.sceneId) || allScenes()[0] || null
    scene.value = picked
    if (picked) {
      story.value = getStory()
      // 条件句（when）只在本场对应的剧情标记已落下时进入句池
      pool.value = sceneSentences(picked.id, story.value.flags)
      refreshBond()
      // 上次已练完但没来得及推进（例如抉择后刷新）时，这里补一次
      maybeAdvance()
    } else {
      pool.value = [...allBuiltinSentences(), ...getCustomSentences()]
    }
  } else if (session?.mode === 'topic') {
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
.scene-bar { padding: 14px 16px; margin-bottom: 14px; }
.scene-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.scene-title { font-size: 15px; font-weight: 600; }
.scene-bond { font-size: 12px; color: var(--accent-text); background: var(--accent-soft); border-radius: 999px; padding: 3px 10px; }
.scene-place { font-size: 12px; color: var(--text-muted); margin: 6px 0 0; }
.scene-premise { font-size: 13px; line-height: 1.6; margin: 8px 0 0; }
.scene-foot { display: flex; align-items: center; gap: 12px; margin-top: 10px; font-size: 12px; color: var(--text-muted); }
.bond-gain { color: var(--accent-text); }
.bond-gain em { font-style: normal; opacity: 0.7; }
.scene-done { color: var(--gold-text); }
.practice-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.count { font-size: 14px; color: var(--text-muted); }
.timer { font-size: 14px; color: var(--accent-text); }
.prog { font-size: 13px; color: var(--text-muted); }
.btn-draw { font-size: 13px; padding: 8px 14px; }
.btn-draw:disabled { opacity: 0.5; }
.btn-history { margin-left: auto; font-size: 13px; padding: 8px 14px; }
.rating-zone { margin-top: 20px; min-height: 56px; display: flex; align-items: center; justify-content: center; }
.hint { font-size: 13px; color: var(--text-muted); }
.toggles { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
.dir-toggle { font-size: 13px; opacity: 0.7; }
.mode-toggle { display: flex; gap: 4px; }
.mode-btn { font-size: 13px; opacity: 0.7; padding: 8px 12px; }
.mode-btn.active { opacity: 1; color: var(--accent-text); box-shadow: var(--shadow-in); }
.empty { padding: 40px 20px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.empty .ling-quote { font-size: 14px; line-height: 1.6; color: var(--text-muted); margin: 4px 0 0; max-width: 320px; }
.ling-bubble { display: flex; align-items: center; gap: 12px; padding: 12px 16px; margin-top: 14px; animation: ling-in 260ms ease-out; }
.ling-bubble :deep(.ling-sprite) { background: var(--surface-deep); border: 1px solid var(--border); border-radius: 4px; padding: 4px; flex-shrink: 0; }
.ling-text { font-size: 13px; line-height: 1.6; color: var(--text-muted); margin: 0; }
@keyframes ling-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.save-warn { text-align: center; font-size: 12px; color: #e8463a; opacity: 0.8; margin: 12px 0 0; }
</style>
