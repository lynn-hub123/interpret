import { describe, it, expect, beforeEach } from 'vitest'
import { addRecord, getRecords, stats } from './records.js'
import { save } from './storage.js'

const now = new Date('2026-10-14T12:00:00+08:00').getTime()
const day = 86400000

beforeEach(() => localStorage.clear())

describe('addRecord', () => {
  it('appends with id and defaults ts to now', () => {
    addRecord({ sentenceId: 'daily_001', direction: 'zh2en', rating: 'ok' }, () => now)
    const list = getRecords()
    expect(list).toHaveLength(1)
    expect(list[0]).toEqual(expect.objectContaining({ sentenceId: 'daily_001', direction: 'zh2en', rating: 'ok', ts: now, id: expect.any(String) }))
  })
})

describe('stats', () => {
  it('counts today/total, streak, and topic strength', () => {
    save('records.v1', [
      { id: 'r1', sentenceId: 'daily_001', direction: 'zh2en', rating: 'ok', ts: now },
      { id: 'r2', sentenceId: 'economy_001', direction: 'en2zh', rating: 'miss', ts: now },
      { id: 'r3', sentenceId: 'economy_002', direction: 'zh2en', rating: 'ok', ts: now - day },
      { id: 'r4', sentenceId: 'daily_002', direction: 'zh2en', rating: 'ok', ts: now - 2 * day }
    ])
    const s = stats(() => now)
    expect(s.todayCount).toBe(2)
    expect(s.totalCount).toBe(4)
    expect(s.streakDays).toBe(3)
    expect(s.topicStrength.daily).toEqual({ ok: 2, shaky: 0, miss: 0, rate: 1 })
    expect(s.topicStrength.economy.rate).toBeCloseTo(0.5)
  })
  it('streak is 0 when no practice today', () => {
    save('records.v1', [{ id: 'r1', sentenceId: 'daily_001', direction: 'zh2en', rating: 'ok', ts: now - day }])
    expect(stats(() => now).streakDays).toBe(0)
  })
})

describe('getRecords guard', () => {
  it('returns empty array when records.v1 is not an array', () => {
    localStorage.setItem('interpret.records.v1', JSON.stringify({ broken: true }))
    expect(getRecords()).toEqual([])
  })
})
