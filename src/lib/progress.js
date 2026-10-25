// 练习计数与抽卡券：首张券 5 句，之后每 15 句；券无上限、不过期。
import { load, save } from './storage.js'

export const FIRST_TICKET_AT = 5
export const TICKET_EVERY = 15
const KEY = 'progress.v1'

const DEFAULTS = { practiced: 0, total: 0, tickets: 0, earned: 0, sinceNew: 0, draws: 0 }

export function normalizeProgress(v) {
  const s = v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  const out = { ...DEFAULTS }
  for (const k of Object.keys(DEFAULTS)) {
    if (Number.isFinite(s[k]) && s[k] >= 0) out[k] = s[k]
  }
  return out
}

export function getProgress() {
  return normalizeProgress(load(KEY, null))
}

export function thresholdFor(state) {
  return normalizeProgress(state).earned === 0 ? FIRST_TICKET_AT : TICKET_EVERY
}

// 纯函数：一次评分 +1，跨过门槛即发券（可连发）
export function nextProgress(state) {
  const s = normalizeProgress(state)
  s.practiced += 1
  s.total += 1
  let gained = 0
  while (s.practiced >= thresholdFor(s)) {
    s.practiced -= thresholdFor(s)
    s.tickets += 1
    s.earned += 1
    gained += 1
  }
  return { state: s, gained }
}

export function addPractice() {
  const { state, gained } = nextProgress(getProgress())
  return { state, gained, persisted: save(KEY, state) }
}

export function spendTicket() {
  const s = getProgress()
  if (s.tickets < 1) return null
  s.tickets -= 1
  return { state: s, persisted: save(KEY, s) }
}

export function applyDraw(isNew) {
  const s = getProgress()
  s.draws += 1
  s.sinceNew = isNew ? 0 : s.sinceNew + 1
  return { state: s, persisted: save(KEY, s) }
}

export function remainingForTicket(state) {
  const s = normalizeProgress(state)
  return Math.max(0, thresholdFor(s) - s.practiced)
}
