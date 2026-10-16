import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PracticeCard from './PracticeCard.vue'
import { speak, ttsSupported, cancel } from '../lib/tts.js'
import { recorderSupported, startRecording, stopRecording, revoke, lastErrorName } from '../lib/recorder.js'

vi.mock('../lib/tts.js', () => ({
  ttsSupported: vi.fn(() => true),
  speak: vi.fn(() => true),
  cancel: vi.fn()
}))

vi.mock('../lib/recorder.js', () => ({
  recorderSupported: vi.fn(() => true),
  startRecording: vi.fn(async () => true),
  stopRecording: vi.fn(async () => 'blob:fake-rec'),
  revoke: vi.fn(),
  isRecording: vi.fn(() => false),
  lastErrorName: vi.fn(() => '')
}))

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

describe('speak button (sight mode)', () => {
  it('shows source with speaker and speaks on click', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    expect(wrapper.find('.source').exists()).toBe(true)
    expect(wrapper.find('.btn-speak').exists()).toBe(true)
    await wrapper.find('.btn-speak').trigger('click')
    expect(speak).toHaveBeenCalledWith('你好', 'zh')
  })
  it('shows missing voicepack warning when speak fails', async () => {
    speak.mockReturnValueOnce(false)
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    await wrapper.find('.btn-speak').trigger('click')
    expect(wrapper.text()).toContain('语音包')
  })
  it('hides speaker when tts unsupported', () => {
    ttsSupported.mockReturnValueOnce(false)
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    expect(wrapper.find('.btn-speak').exists()).toBe(false)
  })
})

describe('listen mode', () => {
  it('hides source initially, plays on click, reveals text on demand', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en', mode: 'listen' } })
    expect(wrapper.find('.source').exists()).toBe(false)
    await wrapper.find('.btn-listen').trigger('click')
    expect(speak).toHaveBeenCalledWith('你好', 'zh')
    expect(wrapper.find('.source').exists()).toBe(false)
    const showBtn = wrapper.findAll('button').find(b => b.text() === '显示原文')
    await showBtn.trigger('click')
    expect(wrapper.find('.source').exists()).toBe(true)
  })
  it('degrades to text when no voice engine', async () => {
    speak.mockReturnValueOnce(false)
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en', mode: 'listen' } })
    await wrapper.find('.btn-listen').trigger('click')
    expect(wrapper.find('.source').exists()).toBe(true)
    expect(wrapper.text()).toContain('无语音引擎')
  })
  it('resets listen state on sentence change', async () => {
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en', mode: 'listen' } })
    const showBtn = wrapper.findAll('button').find(b => b.text() === '显示原文')
    await showBtn.trigger('click')
    expect(wrapper.find('.source').exists()).toBe(true)
    await wrapper.setProps({ sentence: { id: 'x_002', zh: '世界', en: 'world' } })
    expect(wrapper.find('.source').exists()).toBe(false)
    expect(cancel).toHaveBeenCalled()
  })
  it('clears audio warnings on mode change', async () => {
    speak.mockReturnValueOnce(false)
    const wrapper = mount(PracticeCard, { props: { sentence: { id: 'x_001', zh: '你好', en: 'hello' }, direction: 'zh2en' } })
    await wrapper.find('.btn-speak').trigger('click')
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
})
