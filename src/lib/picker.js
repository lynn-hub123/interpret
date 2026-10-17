import { sentenceById } from './sentences.js'

// 抽句：到期队列头部优先（顺序由调用方保证，最久没练在前），无到期句或配额满回退随机
export function drawSentence({ pool, lastId, dueIds = [], dueAllowed = true, pickIndex = n => Math.floor(Math.random() * n), sentenceById: sentenceByIdFn = sentenceById }) {
  if (pool.length === 0) return null
  if (dueAllowed && dueIds.length > 0) {
    const id = dueIds[0]
    const due = id ? sentenceByIdFn(id) : null
    if (due && due.id !== lastId) return due
  }
  const candidates = pool.length > 1 && lastId ? pool.filter(s => s.id !== lastId) : pool
  return candidates[pickIndex(candidates.length)]
}
