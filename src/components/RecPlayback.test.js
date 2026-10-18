import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import RecPlayback, { formatTime } from './RecPlayback.vue'

const SRC = 'blob:fake-rec'

// happy-dom 不驱动媒体状态：在 audio 元素上补属性（可记录赋值）再手动派发事件
function patchAudio(wrapper, { duration: initialDuration = 7 } = {}) {
  const a = wrapper.find('audio').element
  let ct = 0
  let dur = initialDuration
  Object.defineProperty(a, 'currentTime', { configurable: true, get: () => ct, set: v => { ct = v } })
  Object.defineProperty(a, 'duration', { configurable: true, get: () => dur, set: v => { dur = v } })
  // 真实浏览器换源后时长未知（duration 归 NaN）；happy-dom 的 src setter 不重置时长，
  // 还会带着旧时长派发 durationchange，这里覆盖补齐该语义
  Object.defineProperty(a, 'src', {
    configurable: true,
    get() { return a.getAttribute('src') || '' },
    set(v) { dur = NaN; a.setAttribute('src', v) }
  })
  a.play = vi.fn()
  a.pause = vi.fn()
  return a
}

const fire = (el, type) => el.dispatchEvent(new Event(type))

describe('formatTime', () => {
  it.each([
    [0, '0:00'], [-3, '0:00'], [NaN, '0:00'], [Infinity, '0:00'],
    [59, '0:59'], [60, '1:00'], [61, '1:01'], [125, '2:05'], [600, '10:00'], [61.9, '1:01']
  ])('formats %p as %p', (input, expected) => {
    expect(formatTime(input)).toBe(expected)
  })
})

describe('RecPlayback', () => {
  it('renders toggle, bar and time', () => {
    const w = mount(RecPlayback, { props: { src: SRC } })
    expect(w.find('.pb-toggle').exists()).toBe(true)
    expect(w.find('.pb-bar').exists()).toBe(true)
    expect(w.find('.pb-time').text()).toBe('0:00 / 0:00')
  })
  it('toggle calls play, play event flips state and emits playing', async () => {
    const w = mount(RecPlayback, { props: { src: SRC } })
    const a = patchAudio(w)
    await w.find('.pb-toggle').trigger('click')
    expect(a.play).toHaveBeenCalled()
    fire(a, 'play')
    await nextTick()
    expect(w.find('.pb-toggle').text()).toBe('⏸')
    expect(w.emitted('playing')).toBeTruthy()
  })
  it('pause event reverts state, second toggle pauses audio', async () => {
    const w = mount(RecPlayback, { props: { src: SRC } })
    const a = patchAudio(w)
    fire(a, 'play')
    await nextTick()
    await w.find('.pb-toggle').trigger('click')
    expect(a.pause).toHaveBeenCalled()
    fire(a, 'pause')
    await nextTick()
    expect(w.find('.pb-toggle').text()).toBe('▶')
  })
  it('loadedmetadata enables bar and shows duration, timeupdate shows current', async () => {
    const w = mount(RecPlayback, { props: { src: SRC } })
    const a = patchAudio(w)
    expect(w.find('.pb-bar').element.disabled).toBe(true)
    fire(a, 'loadedmetadata')
    await nextTick()
    expect(w.find('.pb-bar').element.disabled).toBe(false)
    expect(w.find('.pb-bar').element.max).toBe('7')
    expect(w.find('.pb-time').text()).toBe('0:00 / 0:07')
    a.currentTime = 2.5
    fire(a, 'timeupdate')
    await nextTick()
    expect(w.find('.pb-time').text()).toBe('0:02 / 0:07')
  })
  it('probes duration when metadata reports Infinity (MediaRecorder webm)', async () => {
    const w = mount(RecPlayback, { props: { src: SRC } })
    const a = patchAudio(w, { duration: Infinity })
    fire(a, 'loadedmetadata')
    await nextTick()
    expect(a.currentTime).toBe(1e101)
    expect(w.find('.pb-bar').element.disabled).toBe(true)
    a.duration = 7
    fire(a, 'durationchange')
    await nextTick()
    expect(a.currentTime).toBe(0)
    expect(w.find('.pb-bar').element.disabled).toBe(false)
    expect(w.find('.pb-time').text()).toBe('0:00 / 0:07')
  })
  it('seek updates audio currentTime and displayed time', async () => {
    const w = mount(RecPlayback, { props: { src: SRC } })
    const a = patchAudio(w)
    fire(a, 'loadedmetadata')
    await nextTick()
    await w.find('.pb-bar').setValue('3')
    expect(a.currentTime).toBe(3)
    expect(w.find('.pb-time').text()).toBe('0:03 / 0:07')
  })
  it('ended resets to start and stops', async () => {
    const w = mount(RecPlayback, { props: { src: SRC } })
    const a = patchAudio(w)
    fire(a, 'loadedmetadata')
    await nextTick()
    a.currentTime = 7
    fire(a, 'timeupdate')
    fire(a, 'play')
    await nextTick()
    fire(a, 'ended')
    await nextTick()
    expect(w.find('.pb-toggle').text()).toBe('▶')
    expect(w.find('.pb-time').text()).toBe('0:00 / 0:07')
  })
  it('src change resets state', async () => {
    const w = mount(RecPlayback, { props: { src: SRC } })
    const a = patchAudio(w)
    fire(a, 'loadedmetadata')
    fire(a, 'play')
    await nextTick()
    await w.setProps({ src: 'blob:other' })
    expect(w.find('.pb-toggle').text()).toBe('▶')
    expect(w.find('.pb-time').text()).toBe('0:00 / 0:00')
  })
  it('exposed pause works even before play event fires, unmount pauses too', async () => {
    const w = mount(RecPlayback, { props: { src: SRC } })
    const a = patchAudio(w)
    w.vm.pause() // play 事件异步未到时也必须生效（互斥空窗修复）
    expect(a.pause).toHaveBeenCalledTimes(1)
    fire(a, 'play')
    await nextTick()
    fire(a, 'pause')
    await nextTick()
    w.unmount()
    expect(a.pause).toHaveBeenCalledTimes(1)
  })
})
