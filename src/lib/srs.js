import { load, save } from './storage.js'

// 固定阶梯：6 档间隔天数；到期 = lastTs + 当前档间隔
export const INTERVALS = [1, 3, 7, 14, 30, 60]
// 每日到期消化上限：防积压洪水，超出顺延明天
export const DAILY_CAP = 10

const DAY_MS = 86400000
const KEY = 'srs.v1'

export function getSrs() {
  const v = load(KEY, {})
  const s = v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  return {
    boxes: s.boxes && typeof s.boxes === 'object' ? s.boxes : {},
    quota: s.quota && typeof s.quota === 'object' ? s.quota : { date: '', used: 0 }
  }
}

function persist(state) {
  return save(KEY, state)
}

export function localDate(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 档位迁移：ok 升一档封顶；shaky 降一档不破底；miss 回第 1 档。未练句按第 0 档进入
export function nextBox(box, rating) {
  if (rating === 'miss') return 1
  if (rating === 'shaky') return Math.max(1, box - 1)
  return Math.min(INTERVALS.length, box + 1)
}

function isDueEntry(entry, now) {
  return Boolean(entry) && now >= entry.lastTs + INTERVALS[entry.box - 1] * DAY_MS
}

export function isDue(sentenceId, nowFn = Date.now) {
  return isDueEntry(getSrs().boxes[sentenceId], nowFn())
}

export function quotaAvailable(nowFn = Date.now) {
  const { quota } = getSrs()
  return quota.date !== localDate(nowFn()) || quota.used < DAILY_CAP
}

// 池内到期句 id 队列：最久没练优先
export function dueQueue(pool, nowFn = Date.now) {
  const { boxes } = getSrs()
  const now = nowFn()
  return pool
    .map(s => ({ id: s.id, entry: boxes[s.id] }))
    .filter(it => isDueEntry(it.entry, now))
    .sort((a, b) => a.entry.lastTs - b.entry.lastTs)
    .map(it => it.id)
}

// 评分落库：更新档位；到期句消化配额（wasDue 由调用方在评分时判定）
export function onRated({ sentenceId, rating, wasDue = false }, nowFn = Date.now) {
  const s = getSrs()
  const cur = s.boxes[sentenceId]?.box ?? 0
  const ts = nowFn()
  s.boxes[sentenceId] = { box: nextBox(cur, rating), lastTs: ts }
  if (wasDue) {
    const today = localDate(ts)
    if (s.quota.date !== today) s.quota = { date: today, used: 0 }
    s.quota.used += 1
  }
  return persist(s)
}
