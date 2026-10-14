import { describe, it, expect, beforeEach } from 'vitest'
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
