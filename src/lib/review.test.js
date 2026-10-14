import { describe, it, expect, beforeEach } from 'vitest'
import { weakIds, reviewList } from './review.js'
import { save } from './storage.js'

const now = new Date('2026-10-14T12:00:00+08:00').getTime()
const day = 86400000

beforeEach(() => localStorage.clear())

describe('weakIds (7 days)', () => {
  it('returns deduped ids with latest shaky/miss within 7d, newest first', () => {
    save('records.v1', [
      { id: 'r1', sentenceId: 'a', direction: 'zh2en', rating: 'miss', ts: now - 2 * day },
      { id: 'r2', sentenceId: 'a', direction: 'zh2en', rating: 'ok', ts: now - 3 * day },
      { id: 'r3', sentenceId: 'b', direction: 'zh2en', rating: 'shaky', ts: now - day },
      { id: 'r4', sentenceId: 'c', direction: 'zh2en', rating: 'miss', ts: now - 8 * day },
      { id: 'r5', sentenceId: 'd', direction: 'zh2en', rating: 'ok', ts: now - day }
    ])
    expect(weakIds(() => now)).toEqual(['b', 'a'])
  })
})

describe('reviewList (30 days)', () => {
  it('lists latest weak event per sentence with sentence object', () => {
    save('records.v1', [
      { id: 'r1', sentenceId: 'a', direction: 'zh2en', rating: 'miss', ts: now - 2 * day },
      { id: 'r2', sentenceId: 'a', direction: 'zh2en', rating: 'shaky', ts: now - day },
      { id: 'r3', sentenceId: 'c', direction: 'zh2en', rating: 'miss', ts: now - 40 * day }
    ])
    const list = reviewList(() => now)
    expect(list).toHaveLength(1)
    expect(list[0].sentenceId).toBe('a')
    expect(list[0].rating).toBe('shaky')
    expect(list[0].sentence).toBe(null) // unknown ids resolve to null in unit test
  })
})
