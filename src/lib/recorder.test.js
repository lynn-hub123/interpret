import { describe, it, expect, afterEach, vi } from 'vitest'
import { recorderSupported, startRecording, isRecording, stopRecording, revoke, lastErrorName } from './recorder.js'

let FakeRecorder // 模块级：修复任务文本中函数内 class 声明导致测试主体无法访问的作用域缺陷
function stubRecorderEnv({ rejectWith = null } = {}) {
  const calls = { getUserMedia: 0, start: 0, stop: 0, tracksStopped: 0, createdURLs: [], revoked: [] }
  const track = { stop: () => { calls.tracksStopped++ } }
  const stream = { getTracks: () => [track] }
  FakeRecorder = class FakeRecorder {
    constructor() {
      this.state = 'inactive'; this.ondataavailable = null; this.onstop = null; this.mimeType = 'audio/webm'
      FakeRecorder.last = this
    }
    start() { calls.start++; this.state = 'recording' }
    stop() { calls.stop++; this.state = 'inactive'; if (this.onstop) this.onstop() }
  }
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: async () => {
        calls.getUserMedia++
        if (rejectWith) throw rejectWith
        return stream
      }
    }
  })
  vi.stubGlobal('URL', {
    createObjectURL: b => { const u = 'blob:fake-' + calls.createdURLs.length; calls.createdURLs.push(b); return u },
    revokeObjectURL: u => calls.revoked.push(u)
  })
  return calls
}

afterEach(() => { vi.unstubAllGlobals() })

describe('recorder', () => {
  it('reports unsupported without MediaRecorder', async () => {
    expect(recorderSupported()).toBe(false)
    expect(await startRecording()).toBe(false)
    expect(await stopRecording()).toBeNull()
  })
  it('start fails when permission denied', async () => {
    stubRecorderEnv({ rejectWith: new Error('denied') })
    expect(await startRecording()).toBe(false)
    expect(isRecording()).toBe(false)
  })
  it('exposes the failure reason name', async () => {
    stubRecorderEnv({ rejectWith: { name: 'NotAllowedError' } })
    expect(await startRecording()).toBe(false)
    expect(lastErrorName()).toBe('NotAllowedError')
  })
  it('clears reason after successful start', async () => {
    stubRecorderEnv({ rejectWith: { name: 'NotAllowedError' } })
    await startRecording()
    stubRecorderEnv()
    await startRecording()
    expect(lastErrorName()).toBe('')
  })
  it('full cycle: start, record, stop returns url and releases mic', async () => {
    const calls = stubRecorderEnv()
    expect(await startRecording()).toBe(true)
    expect(isRecording()).toBe(true)
    FakeRecorder.last.ondataavailable({ data: { size: 5 } })
    const url = await stopRecording()
    expect(url).toBe('blob:fake-0')
    expect(isRecording()).toBe(false)
    expect(calls.tracksStopped).toBe(1)
  })
  it('stop without active recording returns null', async () => {
    stubRecorderEnv()
    expect(await stopRecording()).toBeNull()
  })
  it('revoke releases object url', async () => {
    const calls = stubRecorderEnv()
    await startRecording()
    FakeRecorder.last.ondataavailable({ data: { size: 5 } })
    const url = await stopRecording()
    revoke(url)
    expect(calls.revoked).toEqual(['blob:fake-0'])
  })
})
