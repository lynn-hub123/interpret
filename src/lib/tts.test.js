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
    expect(calls.cancel).toBeGreaterThanOrEqual(1)
  })
  it('voicesFor matches language prefix', () => {
    stubSynth({ voices: [{ lang: 'zh-TW' }] })
    expect(voicesFor('zh')).toEqual({ lang: 'zh-TW' })
    expect(voicesFor('en')).toBeNull()
  })
  it('cancel is safe without engine', () => {
    expect(() => cancel()).not.toThrow()
  })
})
