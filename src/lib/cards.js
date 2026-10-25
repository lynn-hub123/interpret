// 卡库查询 + cards.v1 状态读写。卡面进度只升不降；抽到卡只重置本轮 attempts / peeked。
import CARDS from '../data/cards.json'
import { load, save } from './storage.js'

const KEY = 'cards.v1'

export const EMPTY_CARD_STATE = {
  attempts: 0, progress: 0, unlocked: false, hidden: false, peeked: false, lastAt: 0
}

const BUCKETS = [0, 25, 50, 75, 100]

export function allCards() {
  return CARDS
}

export function cardById(id) {
  return CARDS.find(c => c.id === id) || null
}

export function getCards() {
  const v = load(KEY, {})
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
}

function normalize(entry) {
  const e = entry && typeof entry === 'object' ? entry : {}
  return {
    attempts: Number.isFinite(e.attempts) && e.attempts > 0 ? Math.floor(e.attempts) : 0,
    progress: BUCKETS.includes(e.progress) ? e.progress : 0,
    unlocked: e.unlocked === true,
    hidden: e.hidden === true,
    peeked: e.peeked === true,
    lastAt: Number.isFinite(e.lastAt) ? e.lastAt : 0
  }
}

export function getCardState(cardId) {
  return normalize(getCards()[cardId])
}

// 抽到卡：已有卡保留进度/解锁，重置本轮尝试次数与偷看标记；新卡从默认值开始
export function onDrawn(cardId) {
  const all = getCards()
  const base = normalize(all[cardId])
  all[cardId] = { ...base, attempts: 0, peeked: false }
  return { state: all, persisted: save(KEY, all) }
}

export function markPeeked(cardId) {
  const all = getCards()
  if (!all[cardId]) return { state: all, persisted: true }
  all[cardId] = { ...normalize(all[cardId]), peeked: true }
  return { state: all, persisted: save(KEY, all) }
}

// 一次评分 = 一次独立尝试：progress 取历史最高；首次 100% 且未偷看 → 隐藏形态
export function recordAttempt({ cardId, bucket }, nowFn = Date.now) {
  const all = getCards()
  const prev = normalize(all[cardId])
  const firstAttempt = prev.attempts === 0
  const hiddenNow = firstAttempt && !prev.peeked && !prev.hidden && bucket === 100
  all[cardId] = {
    attempts: prev.attempts + 1,
    progress: Math.max(prev.progress, BUCKETS.includes(bucket) ? bucket : 0),
    unlocked: prev.unlocked || bucket === 100,
    hidden: prev.hidden || hiddenNow,
    peeked: prev.peeked,
    lastAt: nowFn()
  }
  return { entry: all[cardId], hiddenNow, persisted: save(KEY, all) }
}

// 重复抽到已解锁卡 → 隐藏挑战（卡面完整显示，只判本次第一发）
export function hiddenChallengeOf(entry) {
  const e = normalize(entry)
  return e.unlocked && !e.hidden && e.attempts === 0 && !e.peeked
}

export function unlockSentence(card) {
  return {
    id: `card_${card.id}_unlock`,
    zh: card.unlock.zh,
    en: card.unlock.en,
    topic: 'card',
    source: 'card'
  }
}
