import { load, save } from './storage.js'
import { sentenceById } from './sentences.js'

export function addRecord({ sentenceId, direction, rating }, nowFn = Date.now) {
  const list = getRecords()
  const ts = nowFn()
  list.push({ id: `r_${ts}_${Math.random().toString(36).slice(2, 6)}`, sentenceId, direction, rating, ts })
  return save('records.v1', list)
}

export function getRecords() {
  const v = load('records.v1', [])
  return Array.isArray(v) ? v : []
}

export function stats(nowFn = Date.now) {
  const records = getRecords()
  const localDate = ts => {
    const d = new Date(ts)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const today = localDate(nowFn())
  const byDay = new Set(records.map(r => localDate(r.ts)))
  let streakDays = 0
  for (let i = 0; ; i++) {
    const key = localDate(nowFn() - i * 86400000)
    if (byDay.has(key)) streakDays++
    else break
  }
  const strength = {}
  for (const r of records) {
    const s = sentenceById(r.sentenceId)
    if (!s) continue
    strength[s.topic] ??= { ok: 0, shaky: 0, miss: 0, rate: 0 }
    const t = strength[s.topic]
    if (r.rating in t) t[r.rating]++
  }
  for (const t of Object.values(strength)) {
    const total = t.ok + t.shaky + t.miss
    t.rate = total ? t.ok / total : 0
  }
  return {
    todayCount: records.filter(r => localDate(r.ts) === today).length,
    totalCount: records.length,
    streakDays,
    topicStrength: strength
  }
}

// 按句子聚合练习次数与最近练习时间，供自定义句列表展示
export function practiceCounts() {
  const counts = {}
  for (const r of getRecords()) {
    const c = (counts[r.sentenceId] ??= { count: 0, lastTs: 0 })
    c.count += 1
    if (r.ts > c.lastTs) c.lastTs = r.ts
  }
  return counts
}
