import { describe, it, expect, beforeEach } from 'vitest'
import { settings, loadSettings, setDirection, setTheme, setShowTimer, setMode, applyTheme } from './settings.js'

beforeEach(() => { localStorage.clear(); loadSettings() })

describe('settings store', () => {
  it('has defaults: zh2en, dark, timer off, sight mode', () => {
    expect(settings.value).toEqual({ direction: 'zh2en', theme: 'dark', showTimer: false, mode: 'sight' })
  })
  it('setters persist via storage module', () => {
    setDirection('en2zh')
    setTheme('light')
    setShowTimer(true)
    expect(JSON.parse(localStorage.getItem('interpret.settings.v1'))).toEqual({ direction: 'en2zh', theme: 'light', showTimer: true, mode: 'sight' })
    expect(settings.value.direction).toBe('en2zh')
  })
  it('applyTheme toggles html data-theme', () => {
    setTheme('light')
    applyTheme()
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})

describe('settings persistence signal and stored shape', () => {
  it('loadSettings merges persisted settings over defaults', () => {
    localStorage.setItem('interpret.settings.v1', JSON.stringify({ direction: 'en2zh' }))
    loadSettings()
    expect(settings.value).toEqual({ direction: 'en2zh', theme: 'dark', showTimer: false, mode: 'sight' })
  })
  it('loadSettings ignores non-object stored value', () => {
    localStorage.setItem('interpret.settings.v1', '[1,2]')
    loadSettings()
    expect(settings.value).toEqual({ direction: 'zh2en', theme: 'dark', showTimer: false, mode: 'sight' })
  })
  it('setters return persistence boolean', () => {
    expect(setDirection('en2zh')).toBe(true)
  })
})

describe('mode setting', () => {
  it('mode defaults to sight', () => {
    expect(settings.value.mode).toBe('sight')
  })
  it('setMode persists valid mode', () => {
    expect(setMode('listen')).toBe(true)
    expect(settings.value.mode).toBe('listen')
    expect(JSON.parse(localStorage.getItem('interpret.settings.v1')).mode).toBe('listen')
  })
  it('setMode rejects invalid value', () => {
    expect(setMode('bogus')).toBe(false)
    expect(settings.value.mode).toBe('sight')
    expect(localStorage.getItem('interpret.settings.v1')).toBe(null)
  })
})
