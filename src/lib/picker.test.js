import { describe, it, expect, vi } from 'vitest'
import { drawSentence } from './picker.js'

const pool = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

describe('drawSentence', () => {
  it('returns a sentence from pool', () => {
    const s = drawSentence({ pool, lastId: null, random: () => 0.9 })
    expect(pool.map(p => p.id)).toContain(s.id)
  })
  it('draws the due queue head first when allowed', () => {
    const s = drawSentence({ pool, lastId: null, dueIds: ['b'], sentenceById: id => ({ id }) })
    expect(s.id).toBe('b')
  })
  it('falls back to random when quota is exhausted', () => {
    const s = drawSentence({ pool, lastId: null, dueIds: ['b'], dueAllowed: false, random: () => 0.9 })
    expect(['a', 'b', 'c']).toContain(s.id)
  })
  it('falls back to random when due queue is empty', () => {
    const s = drawSentence({ pool, lastId: null, dueIds: [], random: () => 0.9 })
    expect(pool.map(p => p.id)).toContain(s.id)
  })
  it('falls back to random when due head is unresolvable', () => {
    const s = drawSentence({ pool, lastId: null, dueIds: ['gone'], sentenceById: () => null, random: () => 0.9 })
    expect(pool.map(p => p.id)).toContain(s.id)
  })
  it('never repeats lastId when pool has alternatives', () => {
    const random = vi.fn().mockReturnValue(0.9)
    const pick = vi.fn().mockReturnValue(0)
    for (let i = 0; i < 20; i++) {
      const s = drawSentence({ pool, lastId: 'a', dueIds: ['a'], random, pickIndex: pick, sentenceById: id => ({ id }) })
      expect(s.id).not.toBe('a')
    }
  })
})
