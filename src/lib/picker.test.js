import { describe, it, expect, vi } from 'vitest'
import { drawSentence } from './picker.js'

const pool = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

describe('drawSentence', () => {
  it('returns a sentence from pool', () => {
    const s = drawSentence({ pool, lastId: null, weakIds: [], random: () => 0.9 })
    expect(pool.map(p => p.id)).toContain(s.id)
  })
  it('mixes a weak sentence ~30% of the time', () => {
    const random = vi.fn().mockReturnValue(0.1) // < 0.3 → weak path
    const pick = vi.fn().mockReturnValue(0)
    const s = drawSentence({ pool, lastId: null, weakIds: ['w1', 'w2'], random, pickIndex: pick, sentenceById: id => ({ id }) })
    expect(s.id).toBe('w1')
    expect(pick).toHaveBeenCalledWith(2)
  })
  it('falls back to pool when weak path picks nothing usable', () => {
    const s = drawSentence({ pool, lastId: null, weakIds: ['gone'], random: () => 0.1, sentenceById: () => null })
    expect(pool.map(p => p.id)).toContain(s.id)
  })
  it('never repeats lastId when pool has alternatives', () => {
    const random = vi.fn().mockReturnValue(0.9)
    const pick = vi.fn().mockReturnValue(0)
    for (let i = 0; i < 20; i++) {
      const s = drawSentence({ pool, lastId: 'a', weakIds: [], random, pickIndex: pick })
      expect(s.id).not.toBe('a')
    }
  })
})
