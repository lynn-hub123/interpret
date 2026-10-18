import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { playText, stop } from './voice.js'
import { speak, cancel } from './tts.js'

vi.mock('./tts.js', () => ({
  speak: vi.fn(() => true),
  cancel: vi.fn(),
  ttsSupported: vi.fn(() => true)
}))

// happy-dom 的 Audio 播不了真音频，测试统一注入最小 FakeAudio
class FakeAudio {
  constructor(src) {
    this.src = src
    this.onended = null
    this.onerror = null
    this.paused = false
    FakeAudio.instances.push(this)
  }
  play() {
    FakeAudio.played.push(this)
    if (FakeAudio.rejectPlay) return Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
    return Promise.resolve()
  }
  pause() { this.paused = true }
  static instances = []
  static played = []
  static rejectPlay = false
}

beforeEach(() => {
  FakeAudio.instances = []
  FakeAudio.played = []
  FakeAudio.rejectPlay = false
  speak.mockClear(); cancel.mockClear()
  speak.mockImplementation(() => true)
  vi.stubGlobal('Audio', FakeAudio)
})

afterEach(() => {
  stop() // 清掉跨用例挂着的播放状态
  vi.unstubAllGlobals()
})

describe('voice.playText', () => {
  it('builtin plays prerecorded audio at BASE_URL path', async () => {
    const p = playText({ id: 'daily_001', source: 'builtin', text: '你好', lang: 'zh' })
    expect(FakeAudio.instances).toHaveLength(1)
    expect(FakeAudio.played).toEqual([FakeAudio.instances[0]])
    expect(FakeAudio.instances[0].src).toBe(`${import.meta.env.BASE_URL}audio/daily_001.zh.mp3`)
    FakeAudio.instances[0].onended()
    await expect(p).resolves.toBe('played')
    expect(speak).not.toHaveBeenCalled()
  })
  it('falls back to TTS when audio errors, resolves on tts end', async () => {
    const p = playText({ id: 'x_9', source: 'builtin', text: 'hi', lang: 'en' })
    FakeAudio.instances[0].onerror()
    expect(speak).toHaveBeenCalledWith('hi', 'en', expect.any(Function))
    speak.mock.calls[0][2]() // 手动触发 TTS onend
    await expect(p).resolves.toBe('played')
  })
  it('resolves failed when audio errors and TTS unavailable', async () => {
    speak.mockImplementationOnce(() => false)
    const p = playText({ id: 'x_9', source: 'builtin', text: 'hi', lang: 'en' })
    FakeAudio.instances[0].onerror()
    await expect(p).resolves.toBe('failed')
  })
  it('custom sentence goes straight to TTS without Audio', async () => {
    const p = playText({ id: 'c_1', source: 'custom', text: '你好', lang: 'zh' })
    expect(FakeAudio.instances).toHaveLength(0)
    speak.mock.calls[0][2]()
    await expect(p).resolves.toBe('played')
  })
  it('new play stops the previous one (singleton)', async () => {
    const p1 = playText({ id: 'a', source: 'builtin', text: 'a', lang: 'zh' })
    const p2 = playText({ id: 'b', source: 'builtin', text: 'b', lang: 'zh' })
    await expect(p1).resolves.toBe('stopped')
    expect(FakeAudio.instances[0].paused).toBe(true)
    FakeAudio.instances[1].onended()
    await expect(p2).resolves.toBe('played')
  })
  it('stop() settles current playback, pauses audio and cancels tts', async () => {
    const p = playText({ id: 'a', source: 'builtin', text: 'a', lang: 'zh' })
    stop()
    await expect(p).resolves.toBe('stopped')
    expect(FakeAudio.instances[0].paused).toBe(true)
    expect(cancel).toHaveBeenCalled()
  })
  it('stop() is safe with nothing playing', () => {
    expect(() => stop()).not.toThrow()
    expect(cancel).toHaveBeenCalled()
  })
  it('play() rejection does not trigger TTS fallback', async () => {
    FakeAudio.rejectPlay = true
    const p = playText({ id: 'a', source: 'builtin', text: 'a', lang: 'zh' })
    await Promise.resolve(); await Promise.resolve()
    expect(speak).not.toHaveBeenCalled()
    stop()
    await expect(p).resolves.toBe('stopped')
  })
})
