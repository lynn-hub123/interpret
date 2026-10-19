import { describe, it, expect, vi, afterEach } from 'vitest'
import { speechSupported, start, stop } from './speech.js'

class FakeRecognition {
  constructor() {
    this.lang = ''
    this.continuous = false
    this.interimResults = false
    this.onresult = null
    this.onerror = null
    this.onend = null
    this.started = false
    this.stopped = false
    this.aborted = false
    FakeRecognition.all.push(this)
  }
  start() { this.started = true }
  stop() { this.stopped = true }
  abort() { this.aborted = true }
  // —— 测试辅助：模拟引擎事件 ——
  emitFinal(transcript) { this.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript } }] }) }
  emitInterim(transcript) { this.onresult({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript } }] }) }
  emitError(name) { this.onerror({ error: name }) }
  emitEnd() { this.onend() }
}
FakeRecognition.all = []

function install(webkitOnly = false) {
  FakeRecognition.all = []
  if (!webkitOnly) window.SpeechRecognition = FakeRecognition
  window.webkitSpeechRecognition = FakeRecognition
}

afterEach(() => {
  delete window.SpeechRecognition
  delete window.webkitSpeechRecognition
  FakeRecognition.all = []
})

describe('speechSupported', () => {
  it('true when native API exists', () => {
    install()
    expect(speechSupported()).toBe(true)
  })
  it('true when only webkit prefix exists', () => {
    install(true)
    expect(speechSupported()).toBe(true)
  })
  it('false when neither exists', () => {
    expect(speechSupported()).toBe(false)
  })
})

describe('start', () => {
  it('returns false and does nothing when unsupported', () => {
    expect(start('en-US', {})).toBe(false)
  })
  it('configures lang/continuous/interim and starts', () => {
    install()
    expect(start('zh-CN', {})).toBe(true)
    const rec = FakeRecognition.all[0]
    expect(rec.lang).toBe('zh-CN')
    expect(rec.continuous).toBe(true)
    expect(rec.interimResults).toBe(true)
    expect(rec.started).toBe(true)
  })
  it('dispatches final and interim transcripts', () => {
    install()
    const finals = []; const interims = []
    start('en-US', { onFinal: t => finals.push(t), onInterim: t => interims.push(t) })
    const rec = FakeRecognition.all[0]
    rec.emitFinal('Hello world.')
    rec.emitInterim('how are')
    expect(finals).toEqual(['Hello world.'])
    expect(interims).toEqual(['how are'])
  })
  it('restarts with same lang when onend fires (not manual)', () => {
    install()
    start('en-US', {})
    FakeRecognition.all[0].emitEnd()
    expect(FakeRecognition.all.length).toBe(2)
    expect(FakeRecognition.all[1].lang).toBe('en-US')
    expect(FakeRecognition.all[1].started).toBe(true)
  })
  it('repeated start aborts old session and spawns new one', () => {
    install()
    start('en-US', {})
    const first = FakeRecognition.all[0]
    start('zh-CN', {})
    expect(first.aborted).toBe(true)
    expect(FakeRecognition.all.length).toBe(2)
    expect(FakeRecognition.all[1].lang).toBe('zh-CN')
  })
  it('ignores stale events from replaced instance', () => {
    install()
    const onError = vi.fn()
    start('en-US', { onFinal: () => {}, onInterim: () => {}, onError })
    const stale = FakeRecognition.all[0]
    start('zh-CN', {})
    stale.emitEnd()
    stale.emitError('network')
    expect(FakeRecognition.all.length).toBe(2)
    expect(onError).not.toHaveBeenCalled()
  })
  it('stop() is graceful then manual end does not restart', () => {
    install()
    start('en-US', {})
    const rec = FakeRecognition.all[0]
    stop()
    expect(rec.stopped).toBe(true)
    rec.emitEnd()
    expect(FakeRecognition.all.length).toBe(1)
  })
  it('stop() when idle is a safe no-op', () => {
    expect(() => stop()).not.toThrow()
  })
})

describe('error handling', () => {
  it('no-speech is silent and still restarts', () => {
    install()
    const onError = vi.fn()
    start('en-US', { onFinal: () => {}, onInterim: () => {}, onError })
    const rec = FakeRecognition.all[0]
    rec.emitError('no-speech')
    rec.emitEnd()
    expect(onError).not.toHaveBeenCalled()
    expect(FakeRecognition.all.length).toBe(2)
  })
  it('aborted is silent', () => {
    install()
    const onError = vi.fn()
    start('en-US', { onFinal: () => {}, onInterim: () => {}, onError })
    FakeRecognition.all[0].emitError('aborted')
    expect(onError).not.toHaveBeenCalled()
  })
  it('not-allowed is fatal: onError fired and no restart', () => {
    install()
    const onError = vi.fn()
    start('en-US', { onFinal: () => {}, onInterim: () => {}, onError })
    const rec = FakeRecognition.all[0]
    rec.emitError('not-allowed')
    rec.emitEnd()
    expect(onError).toHaveBeenCalledWith('not-allowed')
    expect(FakeRecognition.all.length).toBe(1)
  })
  it('service-not-allowed normalizes to not-allowed', () => {
    install()
    const onError = vi.fn()
    start('en-US', { onFinal: () => {}, onInterim: () => {}, onError })
    FakeRecognition.all[0].emitError('service-not-allowed')
    expect(onError).toHaveBeenCalledWith('not-allowed')
  })
  it('network is fatal', () => {
    install()
    const onError = vi.fn()
    start('en-US', { onFinal: () => {}, onInterim: () => {}, onError })
    FakeRecognition.all[0].emitError('network')
    expect(onError).toHaveBeenCalledWith('network')
  })
  it('unknown error names pass through as fatal', () => {
    install()
    const onError = vi.fn()
    start('en-US', { onFinal: () => {}, onInterim: () => {}, onError })
    FakeRecognition.all[0].emitError('weird-error')
    expect(onError).toHaveBeenCalledWith('weird-error')
  })
})
