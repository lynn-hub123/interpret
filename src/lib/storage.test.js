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
  it('rejects invalid import payload', () => {
    expect(importAll('not json')).toBe(false)
    expect(importAll({ records: 42 })).toBe(false)
  })
})
