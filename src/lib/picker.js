import { sentenceById } from './sentences.js'

const WEAK_RATIO = 0.3

export function drawSentence({ pool, lastId, weakIds = [], random = Math.random, pickIndex = n => Math.floor(Math.random() * n), sentenceById: sentenceByIdFn = sentenceById }) {
  if (pool.length === 0) return null
  if (random() < WEAK_RATIO && weakIds.length > 0) {
    const id = weakIds[pickIndex(weakIds.length)]
    const weak = id ? sentenceByIdFn(id) : null
    if (weak && weak.id !== lastId) return weak
  }
  const candidates = pool.length > 1 && lastId ? pool.filter(s => s.id !== lastId) : pool
  return candidates[pickIndex(candidates.length)]
}
