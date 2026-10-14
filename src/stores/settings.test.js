import { describe, it, expect, beforeEach } from 'vitest'
import { settings, loadSettings, setDirection, setTheme, setShowTimer, applyTheme } from './settings.js'

beforeEach(() => { localStorage.clear(); loadSettings() })

describe('settings store', () => {
  it('has defaults: zh2en, dark, timer off', () => {
    expect(settings.value).toEqual({ direction: 'zh2en', theme: 'dark', showTimer: false })
  })
  it('setters persist via storage module', () => {
    setDirection('en2zh')
    setTheme('light')
    setShowTimer(true)
    expect(JSON.parse(localStorage.getItem('interpret.settings.v1'))).toEqual({ direction: 'en2zh', theme: 'light', showTimer: true })
    expect(settings.value.direction).toBe('en2zh')
  })
  it('applyTheme toggles html data-theme', () => {
    setTheme('light')
    applyTheme()
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
