import { describe, it, expect, beforeEach, vi } from 'vitest'
import { load, save, storageAvailable, exportAll, importAll } from './storage.js'

beforeEach(() => localStorage.clear())

describe('load/save', () => {
  it('saves and loads JSON values', () => {
    expect(save('k', { a: 1 })).toBe(true)
    expect(load('k', null)).toEqual({ a: 1 })
  })
  it('returns fallback when key missing', () => {
    expect(load('missing', 'fb')).toBe('fb')
  })
  it('backs up corrupted data and returns fallback', () => {
    localStorage.setItem('bad', '{oops')
    expect(load('bad', 'fb')).toBe('fb')
    expect(localStorage.getItem('bad.corrupt')).toBe('{oops')
  })
  it('falls back to bare key and backs up corruption', () => {
    localStorage.setItem('bare', '{oops')
    expect(load('bare', 'fb')).toBe('fb')
    expect(localStorage.getItem('bare.corrupt')).toBe('{oops')
  })
  it('returns false when storage writes fail (quota)', () => {
    // happy-dom 下对 Storage.prototype 打 spy 在窗口有过真实读写后会静默失效，故 mock localStorage 实例
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(save('k', 1)).toBe(false)
    expect(importAll({ records: [], custom: [] })).toBe(false)
    spy.mockRestore()
  })
})

describe('storageAvailable', () => {
  it('reflects availability', () => {
    expect(storageAvailable()).toBe(true)
  })
})

describe('export/import', () => {
  it('round-trips all keys with interpret. prefix', () => {
    save('interpret.records.v1', [{ id: 1 }])
    save('other.key', 'keep-me-out')
    const dump = exportAll()
    expect(dump.records).toEqual([{ id: 1 }])
    localStorage.clear()
    importAll(dump)
    expect(load('interpret.records.v1', [])).toEqual([{ id: 1 }])
  })
  it('round-trips srs progress', () => {
    const srs = { boxes: { s1: { box: 2, lastTs: 123 } }, quota: { date: '2026-10-17', used: 3 } }
    save('srs.v1', srs)
    const dump = exportAll()
    expect(dump.srs).toEqual(srs)
    localStorage.clear()
    save('srs.v1', { boxes: {}, quota: { date: '', used: 0 } })
    importAll(dump)
    expect(load('srs.v1', null)).toEqual(srs)
  })
  it('leaves srs untouched when dump predates srs', () => {
    const srs = { boxes: { keep: { box: 1, lastTs: 1 } }, quota: { date: '', used: 0 } }
    save('srs.v1', srs)
    importAll({ records: [], custom: [] })
    expect(load('srs.v1', null)).toEqual(srs)
  })
  it('rejects invalid import payload', () => {
    expect(importAll('not json')).toBe(false)
    expect(importAll({ records: 42 })).toBe(false)
  })

  it('导出 progress 与 cards，且永不包含 ai', () => {
    save('progress.v1', { tickets: 2, practiced: 3 })
    save('cards.v1', { zhouye: { attempts: 1, progress: 50, unlocked: false, hidden: false, peeked: false, lastAt: 1 } })
    save('ai.v1', { baseUrl: 'u', model: 'm', apiKey: 'secret-key' })
    const dump = exportAll()
    expect(dump.progress).toEqual({ tickets: 2, practiced: 3 })
    expect(dump.cards.zhouye.progress).toBe(50)
    expect('ai' in dump).toBe(false)
    expect(JSON.stringify(dump)).not.toContain('secret-key')
  })

  it('导入 progress 与 cards', () => {
    const dump = {
      records: [], custom: [],
      progress: { tickets: 1, practiced: 4 },
      cards: { zhouye: { attempts: 0, progress: 25, unlocked: false, hidden: false, peeked: false, lastAt: 0 } }
    }
    expect(importAll(dump)).toBe(true)
    expect(load('progress.v1', null)).toEqual({ tickets: 1, practiced: 4 })
    expect(load('cards.v1', null).zhouye.progress).toBe(25)
  })

  it('旧备份没有 progress/cards 时不动现有数据', () => {
    save('progress.v1', { tickets: 5 })
    save('cards.v1', { zhouye: { progress: 75 } })
    importAll({ records: [], custom: [] })
    expect(load('progress.v1', null)).toEqual({ tickets: 5 })
    expect(load('cards.v1', null)).toEqual({ zhouye: { progress: 75 } })
  })
})
