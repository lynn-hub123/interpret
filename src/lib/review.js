import { getRecords } from './records.js'
import { sentenceById } from './sentences.js'

export function weakIds(nowFn = Date.now, withinDays = 7) {
  const cutoff = nowFn() - withinDays * 86400000
  const latest = new Map()
  for (const r of getRecords()) {
    if ((r.rating === 'shaky' || r.rating === 'miss') && r.ts >= cutoff) {
      if (!latest.has(r.sentenceId) || latest.get(r.sentenceId) < r.ts) latest.set(r.sentenceId, r.ts)
    }
  }
  return [...latest.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => id)
}

export function reviewList(nowFn = Date.now, withinDays = 30) {
  const cutoff = nowFn() - withinDays * 86400000
  const latest = new Map()
  for (const r of getRecords()) {
    if ((r.rating === 'shaky' || r.rating === 'miss') && r.ts >= cutoff) {
      if (!latest.has(r.sentenceId) || latest.get(r.sentenceId).ts < r.ts) latest.set(r.sentenceId, r)
    }
  }
  return [...latest.values()].sort((x, y) => y.ts - x.ts).map(r => ({ ...r, sentence: sentenceById(r.sentenceId) }))
}
