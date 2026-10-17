import { describe, it, expect, vi } from 'vitest'
import { drawSentence } from './picker.js'

const pool = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

describe('drawSentence', () => {
  it('returns a sentence from pool', () => {
    const s = drawSentence({ pool, lastId: null, pickIndex: () => 0 })
    expect(s.id).toBe('a')
  })
  it('draws the due queue head first when allowed', () => {
    const s = drawSentence({ pool, lastId: null, dueIds: ['b'], sentenceById: id => ({ id }) })
    expect(s.id).toBe('b')
  })
  it('falls back to random when quota is exhausted', () => {
    const s = drawSentence({ pool, lastId: null, dueIds: ['b'], dueAllowed: false, pickIndex: () => 0 })
    expect(s.id).toBe('a')
  })
  it('falls back to random when due queue is empty', () => {
    const s = drawSentence({ pool, lastId: null, dueIds: [], pickIndex: () => 0 })
    expect(s.id).toBe('a')
  })
  it('falls back to random when due head is unresolvable', () => {
    const s = drawSentence({ pool, lastId: null, dueIds: ['gone'], sentenceById: () => null, pickIndex: () => 0 })
    expect(s.id).toBe('a')
  })
  it('never repeats lastId when pool has alternatives', () => {
    const pick = vi.fn().mockReturnValue(0)
    for (let i = 0; i < 20; i++) {
      const s = drawSentence({ pool, lastId: 'a', dueIds: ['a'], pickIndex: pick, sentenceById: id => ({ id }) })
      expect(s.id).not.toBe('a')
    }
  })
  it('returns null for empty pool', () => {
    expect(drawSentence({ pool: [], lastId: null })).toBe(null)
  })
  it('returns the only sentence even if it equals lastId', () => {
    const s = drawSentence({ pool: [{ id: 'a' }], lastId: 'a', pickIndex: () => 0 })
    expect(s.id).toBe('a')
  })
})
