import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PracticeCard from './PracticeCard.vue'
import { nextTick } from 'vue'
import RecPlayback from './RecPlayback.vue'
import { playText, stop } from '../lib/voice.js'
import { ttsSupported } from '../lib/tts.js'
import { recorderSupported, startRecording, stopRecording, revoke, lastErrorName } from '../lib/recorder.js'

vi.mock('../lib/voice.js', () => ({
  playText: vi.fn(async () => 'played'),
  stop: vi.fn()
}))

vi.mock('../lib/tts.js', () => ({
  ttsSupported: vi.fn(() => true)
}))

vi.mock('../lib/recorder.js', () => ({
  recorderSupported: vi.fn(() => true),
  startRecording: vi.fn(async () => true),
  stopRecording: vi.fn(async () => 'blob:fake-rec'),
  revoke: vi.fn(),
  isRecording: vi.fn(() => false),
  lastErrorName: vi.fn(() => '')
}))

afterEach(() => {
  playText.mockImplementation(async () => 'played')
  playText.mockClear()
  stop.mockClear()
  ttsSupported.mockReturnValue(true)
})

const sentence = { id: 'daily_001', zh: '你好。', en: 'Hello.', topic: 'daily', source: 'builtin' }

describe('PracticeCard', () => {
  it('shows source text by direction zh2en', () => {
    const w = mount(PracticeCard, { props: { sentence, direction: 'zh2en' } })
    expect(w.text()).toContain('你好。')
    expect(w.text()).not.toContain('Hello.')
  })
  it('reveals reference on button click and emits revealed', async () => {
    const w = mount(PracticeCard, { props: { sentence, direction: 'zh2en' } })
    await w.find('.btn-reveal').trigger('click')
    expect(w.text()).toContain('Hello.')
    expect(w.emitted('revealed')).toBeTruthy()
  })
  it('shows hint when reference side missing (custom paste)', async () => {
    const w = mount(PracticeCard, { props: { sentence: { ...sentence, en: '' }, direction: 'zh2en' } })
    await w.find('.btn-reveal').trigger('click')
    expect(w.text()).toContain('此句无参考译文')
  })
  it('skip button emits skip', async () => {
    const w = mount(PracticeCard, { props: { sentence, direction: 'zh2en' } })
    await w.find('.btn-skip').trigger('click')
    expect(w.emitted('skip')).toBeTruthy()
  })
})

describe('play button (sight mode)', () => {
  it('shows source with speaker and plays via voice on click', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    expect(wrapper.find('.source').exists()).toBe(true)
    expect(wrapper.find('.btn-speak').exists()).toBe(true)
    await wrapper.find('.btn-speak').trigger('click')
    expect(playText).toHaveBeenCalledWith(expect.objectContaining({ text: '你好', lang: 'zh' }))
  })
  it('shows stop icon while playing and reverts after done', async () => {
    let resolvePlay
    playText.mockImplementation(() => new Promise(r => { resolvePlay = r }))
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    expect(wrapper.find('.btn-speak').text()).toBe('🔊')
    await wrapper.find('.btn-speak').trigger('click')
    await flushPromises()
    expect(wrapper.find('.btn-speak').text()).toBe('⏹')
    resolvePlay('played')
    await flushPromises()
    expect(wrapper.find('.btn-speak').text()).toBe('🔊')
  })
  it('second click while playing stops instead of restarting', async () => {
    playText.mockImplementation(() => new Promise(() => {}))
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    await wrapper.find('.btn-speak').trigger('click')
    await flushPromises()
    await wrapper.find('.btn-speak').trigger('click')
    expect(stop).toHaveBeenCalled()
  })
  it('shows missing voicepack warning when play fails', async () => {
    playText.mockResolvedValueOnce('failed')
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    await wrapper.find('.btn-speak').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('语音包')
  })
  it('hides speaker for custom sentence when tts unsupported', () => {
    ttsSupported.mockReturnValueOnce(false)
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'c_1', zh: '你好', en: '', source: 'custom' }, direction: 'zh2en' } })
    expect(wrapper.find('.btn-speak').exists()).toBe(false)
  })
  it('shows speaker for builtin sentence even when tts unsupported', () => {
    ttsSupported.mockReturnValueOnce(false)
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'daily_001', zh: '你好', en: 'hello', source: 'builtin' }, direction: 'zh2en' } })
    expect(wrapper.find('.btn-speak').exists()).toBe(true)
  })
  it('stops playback on unmount', async () => {
    playText.mockImplementation(() => new Promise(() => {}))
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    await wrapper.find('.btn-speak').trigger('click')
    await flushPromises()
    wrapper.unmount()
    expect(stop).toHaveBeenCalled()
  })
})

describe('listen mode', () => {
  it('hides source initially, plays on click, reveals text on demand', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en', mode: 'listen' } })
    expect(wrapper.find('.source').exists()).toBe(false)
    await wrapper.find('.btn-listen').trigger('click')
    await flushPromises()
    expect(playText).toHaveBeenCalledWith(expect.objectContaining({ text: '你好', lang: 'zh' }))
    expect(wrapper.find('.source').exists()).toBe(false)
    const showBtn = wrapper.findAll('button').find(b => b.text() === '显示原文')
    await showBtn.trigger('click')
    expect(wrapper.find('.source').exists()).toBe(true)
  })
  it('shows stop label on listen button while playing and reverts after done', async () => {
    let resolvePlay
    playText.mockImplementation(() => new Promise(r => { resolvePlay = r }))
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en', mode: 'listen' } })
    expect(wrapper.find('.btn-listen').text()).toBe('🎧 播放原句')
    await wrapper.find('.btn-listen').trigger('click')
    await flushPromises()
    expect(wrapper.find('.btn-listen').text()).toBe('⏹ 停止')
    resolvePlay('played')
    await flushPromises()
    expect(wrapper.find('.btn-listen').text()).toBe('🎧 播放原句')
  })
  it('degrades to text when play fails', async () => {
    playText.mockResolvedValueOnce('failed')
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en', mode: 'listen' } })
    await wrapper.find('.btn-listen').trigger('click')
    await flushPromises()
    expect(wrapper.find('.source').exists()).toBe(true)
    expect(wrapper.text()).toContain('无语音引擎')
  })
  it('resets listen state and stops playback on sentence change', async () => {
    playText.mockImplementation(() => new Promise(() => {}))
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en', mode: 'listen' } })
    const showBtn = wrapper.findAll('button').find(b => b.text() === '显示原文')
    await showBtn.trigger('click')
    expect(wrapper.find('.source').exists()).toBe(true)
    await wrapper.setProps({ sentence: { id: 'x_002', zh: '世界', en: 'world' } })
    expect(wrapper.find('.source').exists()).toBe(false)
    expect(stop).toHaveBeenCalled()
  })
  it('clears audio warnings on mode change', async () => {
    playText.mockResolvedValueOnce('failed')
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    await wrapper.find('.btn-speak').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('语音包')
    await wrapper.setProps({ mode: 'listen' })
    expect(wrapper.text()).not.toContain('语音包')
  })
})

describe('recording zone', () => {
  it('hides when recorder unsupported', () => {
    recorderSupported.mockReturnValueOnce(false)
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    expect(wrapper.find('.rec-zone').exists()).toBe(false)
  })
  it('records, stops, shows playback', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    expect(wrapper.find('.rec-zone').exists()).toBe(true)
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
    expect(startRecording).toHaveBeenCalled()
    expect(wrapper.text()).toContain('停止')
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
    expect(stopRecording).toHaveBeenCalled()
    expect(wrapper.find('.rec-playback').exists()).toBe(true)
  })
  it('shows mic error when start fails', async () => {
    startRecording.mockReturnValueOnce(false)
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('无法访问麦克风')
  })
  it('shows specific message by failure type', async () => {
    startRecording.mockReturnValueOnce(false)
    lastErrorName.mockReturnValueOnce('NotFoundError')
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('未检测到麦克风设备')
  })
  it('revokes url on sentence change', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
    await wrapper.setProps({ sentence: { id: 'x_002', zh: '世界', en: 'world' } })
    expect(revoke).toHaveBeenCalledWith('blob:fake-rec')
    expect(wrapper.find('.rec-playback').exists()).toBe(false)
  })
  it('shows elapsed timer while recording and hides after stop', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
      await wrapper.find('.btn-rec').trigger('click')
      await flushPromises()
      expect(wrapper.find('.rec-time').exists()).toBe(true)
      expect(wrapper.find('.rec-time').text()).toBe('00:00')
      await vi.advanceTimersByTimeAsync(2000)
      expect(wrapper.find('.rec-time').text()).toBe('00:02')
      await wrapper.find('.btn-rec').trigger('click')
      await flushPromises()
      expect(wrapper.find('.rec-time').exists()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
  it('formats minutes at 65 seconds', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
      await wrapper.find('.btn-rec').trigger('click')
      await flushPromises()
      await vi.advanceTimersByTimeAsync(65000)
      expect(wrapper.find('.rec-time').text()).toBe('01:05')
    } finally {
      vi.useRealTimers()
    }
  })
  it('resets timer on sentence change and recounts from zero', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
      await wrapper.find('.btn-rec').trigger('click')
      await flushPromises()
      await vi.advanceTimersByTimeAsync(3000)
      await wrapper.setProps({ sentence: { id: 'x_002', zh: '世界', en: 'world' } })
      expect(wrapper.find('.rec-time').exists()).toBe(false)
      await wrapper.find('.btn-rec').trigger('click')
      await flushPromises()
      expect(wrapper.find('.rec-time').text()).toBe('00:00')
    } finally {
      vi.useRealTimers()
    }
  })
  it('does not start timer if unmounted while start pending', async () => {
    let resolveStart
    startRecording.mockImplementationOnce(() => new Promise(r => { resolveStart = r }))
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    const click = wrapper.find('.btn-rec').trigger('click')
    wrapper.unmount()
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    resolveStart(true)
    await click
    await flushPromises()
    expect(intervalSpy).not.toHaveBeenCalled()
    intervalSpy.mockRestore()
  })
  it('keeps single timer when start clicked twice quickly', async () => {
    let resolveStart
    startRecording.mockImplementationOnce(() => new Promise(r => { resolveStart = r }))
    vi.useFakeTimers()
    try {
      const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
      await wrapper.find('.btn-rec').trigger('click')
      await wrapper.find('.btn-rec').trigger('click')
      resolveStart(true)
      await flushPromises()
      await vi.advanceTimersByTimeAsync(2000)
      expect(wrapper.find('.rec-time').text()).toBe('00:02')
    } finally {
      vi.useRealTimers()
    }
  })
  // 辅助：完成一次录音并停止，得到 blob:fake-rec 回放
  async function recordOnce(wrapper) {
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
    await wrapper.find('.btn-rec').trigger('click')
    await flushPromises()
  }
  it('shows custom playback and guide buttons without native controls after stop', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    await recordOnce(wrapper)
    expect(wrapper.findComponent(RecPlayback).exists()).toBe(true)
    expect(wrapper.find('audio[controls]').exists()).toBe(false)
    const aux = wrapper.findAll('.btn-rec-aux')
    expect(aux.length).toBe(2)
    expect(wrapper.text()).toContain('听原句')
    expect(wrapper.text()).toContain('重录')
  })
  it('hears original sentence via playText from guide button', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    await recordOnce(wrapper)
    await wrapper.findAll('.btn-rec-aux')[0].trigger('click')
    await flushPromises()
    expect(playText).toHaveBeenCalledWith(expect.objectContaining({ text: '你好', lang: 'zh' }))
  })
  it('rerecord revokes old url and restarts recording', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    await recordOnce(wrapper)
    revoke.mockClear()
    startRecording.mockClear()
    await wrapper.findAll('.btn-rec-aux')[1].trigger('click')
    await flushPromises()
    expect(revoke).toHaveBeenCalledWith('blob:fake-rec')
    expect(startRecording).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('停止')
  })
  it('rerecord stops playing original voice first', async () => {
    playText.mockImplementation(() => new Promise(() => {}))
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    await recordOnce(wrapper)
    await wrapper.find('.btn-speak').trigger('click')
    await flushPromises()
    stop.mockClear()
    await wrapper.findAll('.btn-rec-aux')[1].trigger('click')
    await flushPromises()
    expect(stop).toHaveBeenCalled()
  })
  it('pauses own playback when original voice starts', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    await recordOnce(wrapper)
    const a = wrapper.find('audio').element
    a.pause = vi.fn()
    a.dispatchEvent(new Event('play'))
    await nextTick()
    await wrapper.find('.btn-speak').trigger('click')
    await flushPromises()
    expect(a.pause).toHaveBeenCalled()
  })
  it('stops original voice when own playback starts', async () => {
    playText.mockImplementation(() => new Promise(() => {}))
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    await recordOnce(wrapper)
    await wrapper.find('.btn-speak').trigger('click')
    await flushPromises()
    expect(wrapper.find('.btn-speak').text()).toBe('⏹')
    wrapper.find('audio').element.dispatchEvent(new Event('play'))
    await nextTick()
    expect(stop).toHaveBeenCalled()
  })
})
