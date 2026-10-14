import { describe, it, expect } from 'vitest'
import { TOPICS, allBuiltinSentences } from '../lib/sentences.js'

describe('library content', () => {
  it('every topic has at least 20 sentences', () => {
    for (const t of TOPICS) {
      const n = allBuiltinSentences().filter(s => s.topic === t.id).length
      expect(n, `topic ${t.id} has ${n}`).toBeGreaterThanOrEqual(20)
    }
  })
  it('ids are unique and match topic prefix', () => {
    const all = allBuiltinSentences()
    const ids = all.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(all.every(s => s.id.startsWith(`${s.topic}_`))).toBe(true)
  })
  it('every sentence has non-empty zh and en, 5-120 chars', () => {
    for (const s of allBuiltinSentences()) {
      expect(s.zh.length, s.id).toBeGreaterThanOrEqual(5)
      expect(s.zh.length, s.id).toBeLessThanOrEqual(120)
      expect(s.en.length, s.id).toBeGreaterThanOrEqual(5)
      expect(s.en.length, s.id).toBeLessThanOrEqual(200)
    }
  })
})
