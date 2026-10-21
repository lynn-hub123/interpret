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
  it('dispatches multiple results honoring resultIndex', () => {
    install()
    const finals = []; const interims = []
    start('en-US', { onFinal: t => finals.push(t), onInterim: t => interims.push(t) })
    FakeRecognition.all[0].onresult({
      resultIndex: 1,
      results: [
        { isFinal: true, 0: { transcript: 'skipped' } },
        { isFinal: true, 0: { transcript: 'second.' } },
        { isFinal: false, 0: { transcript: 'typing' } }
      ]
    })
    expect(finals).toEqual(['second.'])
    expect(interims).toEqual(['typing'])
  })

  it('stop() keeps delivering final results until end', () => {
    install()
    const finals = []
    start('en-US', { onFinal: t => finals.push(t), onInterim: () => {}, onError: () => {} })
    const rec = FakeRecognition.all[0]
    stop()
    rec.emitFinal('last words.')
    rec.emitEnd()
    expect(finals).toEqual(['last words.'])
    expect(FakeRecognition.all.length).toBe(1)
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
  it('start throwing retries once then fatal with onError unknown', () => {
    vi.useFakeTimers()
    const orig = FakeRecognition.prototype.start
    try {
      install()
      FakeRecognition.prototype.start = () => { throw new Error('InvalidStateError') }
      const onError = vi.fn()
      start('en-US', { onFinal: () => {}, onInterim: () => {}, onError })
      expect(onError).not.toHaveBeenCalled()
      vi.advanceTimersByTime(250)
      expect(onError).toHaveBeenCalledWith('unknown')
      expect(FakeRecognition.all.length).toBe(2)
    } finally {
      FakeRecognition.prototype.start = orig
      vi.useRealTimers()
    }
  })

  it('start throwing recovers via delayed retry', () => {
    vi.useFakeTimers()
    const orig = FakeRecognition.prototype.start
    try {
      install()
      let throwOnce = true
      FakeRecognition.prototype.start = function () {
        if (throwOnce) { throwOnce = false; throw new Error('InvalidStateError') }
        this.started = true
      }
      const onError = vi.fn()
      start('en-US', { onFinal: () => {}, onInterim: () => {}, onError })
      vi.advanceTimersByTime(250)
      expect(onError).not.toHaveBeenCalled()
      expect(FakeRecognition.all.length).toBe(2)
      expect(FakeRecognition.all[1].started).toBe(true)
    } finally {
      FakeRecognition.prototype.start = orig
      vi.useRealTimers()
    }
  })

  it('pending retry is cancelled by stop()', () => {
    vi.useFakeTimers()
    const orig = FakeRecognition.prototype.start
    try {
      install()
      FakeRecognition.prototype.start = () => { throw new Error('InvalidStateError') }
      const onError = vi.fn()
      start('en-US', { onFinal: () => {}, onInterim: () => {}, onError })
      stop()
      vi.advanceTimersByTime(250)
      expect(onError).not.toHaveBeenCalled()
      expect(FakeRecognition.all.length).toBe(1)
    } finally {
      FakeRecognition.prototype.start = orig
      vi.useRealTimers()
    }
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
  it('network is not fatal: schedules 500ms backoff retry', () => {
    vi.useFakeTimers()
    try {
      install()
      const onError = vi.fn()
      start('en-US', { onFinal: () => {}, onInterim: () => {}, onError })
      FakeRecognition.all[0].emitError('network')
      FakeRecognition.all[0].emitEnd() // 真实引擎 error 后必随 end
      expect(onError).not.toHaveBeenCalled()
      vi.advanceTimersByTime(499)
      expect(FakeRecognition.all.length).toBe(1)
      vi.advanceTimersByTime(1)
      expect(FakeRecognition.all.length).toBe(2)
      expect(FakeRecognition.all[1].started).toBe(true)
      expect(onError).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
  it('4 consecutive network errors turn fatal and stop respawning', () => {
    vi.useFakeTimers()
    try {
      install()
      const onError = vi.fn()
      start('en-US', { onFinal: () => {}, onInterim: () => {}, onError })
      // 前三次失败各退避重试：延迟 500ms、1s、2s；重试已排定时 onend 不立即 spawn
      for (const d of [500, 1000, 2000]) {
        FakeRecognition.all.at(-1).emitError('network')
        FakeRecognition.all.at(-1).emitEnd()
        expect(onError).not.toHaveBeenCalled()
        vi.advanceTimersByTime(d)
      }
      expect(FakeRecognition.all.length).toBe(4)
      FakeRecognition.all[3].emitError('network') // 连续第 4 次：致命
      expect(onError).toHaveBeenCalledWith('network')
      FakeRecognition.all[3].emitEnd()
      vi.advanceTimersByTime(5000)
      expect(FakeRecognition.all.length).toBe(4) // 不再 spawn
    } finally {
      vi.useRealTimers()
    }
  })
  it('onend during pending network retry does not double spawn', () => {
    vi.useFakeTimers()
    try {
      install()
      start('en-US', {})
      FakeRecognition.all[0].emitError('network')
      FakeRecognition.all[0].emitEnd()
      expect(FakeRecognition.all.length).toBe(1) // 已排定重试，onend 不立即重启
      vi.advanceTimersByTime(500)
      expect(FakeRecognition.all.length).toBe(2) // 由定时器恢复，仅一个新实例
    } finally {
      vi.useRealTimers()
    }
  })
  it('a result resets the network fail counter', () => {
    vi.useFakeTimers()
    try {
      install()
      const onError = vi.fn()
      start('en-US', { onFinal: () => {}, onInterim: () => {}, onError })
      FakeRecognition.all[0].emitError('network')
      FakeRecognition.all[0].emitEnd()
      vi.advanceTimersByTime(500)
      FakeRecognition.all[1].emitFinal('connected.') // 出结果说明连通，计数归零
      FakeRecognition.all[1].emitError('network') // 重新计 1 次，不致命
      FakeRecognition.all[1].emitEnd()
      vi.advanceTimersByTime(500)
      expect(onError).not.toHaveBeenCalled()
      expect(FakeRecognition.all.length).toBe(3)
    } finally {
      vi.useRealTimers()
    }
  })
  it('stop() cancels pending network retry', () => {
    vi.useFakeTimers()
    try {
      install()
      const onError = vi.fn()
      start('en-US', { onFinal: () => {}, onInterim: () => {}, onError })
      FakeRecognition.all[0].emitError('network')
      stop()
      vi.advanceTimersByTime(1000)
      expect(FakeRecognition.all.length).toBe(1)
      expect(onError).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
  it('unknown error names pass through as fatal', () => {
    install()
    const onError = vi.fn()
    start('en-US', { onFinal: () => {}, onInterim: () => {}, onError })
    FakeRecognition.all[0].emitError('weird-error')
    expect(onError).toHaveBeenCalledWith('weird-error')
  })
})
