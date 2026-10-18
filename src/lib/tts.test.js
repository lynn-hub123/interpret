import { describe, it, expect, afterEach, vi } from 'vitest'
import { ttsSupported, voicesFor, speak, cancel } from './tts.js'

function stubSynth({ voices = [] } = {}) {
  const calls = { speak: [], cancel: 0 }
  const synth = {
    getVoices: () => voices,
    speak: u => calls.speak.push(u),
    cancel: () => { calls.cancel++ }
  }
  vi.stubGlobal('speechSynthesis', synth)
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(t) { this.text = t } })
  return calls
}

afterEach(() => { vi.unstubAllGlobals() })

describe('tts', () => {
  it('reports unsupported without speechSynthesis', () => {
    expect(ttsSupported()).toBe(false)
    expect(speak('hi', 'en')).toBe(false)
  })
  it('speak fails when voices exist but language pack missing', () => {
    const calls = stubSynth({ voices: [{ lang: 'zh-CN' }] })
    expect(speak('hello', 'en')).toBe(false)
    expect(calls.speak).toHaveLength(0)
  })
  it('speak works with empty voice list using engine default', () => {
    const calls = stubSynth()
    expect(speak('你好', 'zh')).toBe(true)
    expect(calls.speak).toHaveLength(1)
    expect(calls.speak[0].lang).toBe('zh-CN')
  })
  it('picks matching voice and maps lang', () => {
    const calls = stubSynth({ voices: [{ lang: 'en-US' }, { lang: 'zh-CN' }] })
    expect(speak('hello world', 'en')).toBe(true)
    expect(calls.speak[0].lang).toBe('en-US')
  })
  it('cancels previous before speaking a new one', () => {
    const calls = stubSynth()
    speak('a', 'en')
    speak('b', 'en')
    expect(calls.cancel).toBe(2)
    expect(calls.speak).toHaveLength(2)
  })
  it('voicesFor matches language prefix', () => {
    stubSynth({ voices: [{ lang: 'zh-TW' }] })
    expect(voicesFor('zh')).toEqual({ lang: 'zh-TW' })
    expect(voicesFor('en')).toBeNull()
  })
  it('cancel is safe without engine', () => {
    expect(() => cancel()).not.toThrow()
  })
  it('voicesFor prefers Natural online voice', () => {
    stubSynth({ voices: [
      { lang: 'zh-CN', name: 'Microsoft Huihui' },
      { lang: 'zh-CN', name: 'Microsoft Xiaoxiao Online (Natural) - Chinese (Simplified)' }
    ] })
    expect(voicesFor('zh').name).toMatch(/Natural/i)
  })
  it('voicesFor falls back to Google voice when no Natural', () => {
    stubSynth({ voices: [
      { lang: 'en-US', name: 'Microsoft Zira' },
      { lang: 'en-US', name: 'Google US English' }
    ] })
    expect(voicesFor('en').name).toMatch(/Google/i)
  })
  it('voicesFor falls back to first local voice', () => {
    stubSynth({ voices: [{ lang: 'zh-TW', name: 'Mei-Jia' }] })
    expect(voicesFor('zh').name).toBe('Mei-Jia')
  })
  it('speak forwards onend to utterance', () => {
    const calls = stubSynth()
    const onend = () => {}
    speak('你好', 'zh', onend)
    expect(calls.speak[0].onend).toBe(onend)
  })
})
