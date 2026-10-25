import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import DrawOverlay from './DrawOverlay.vue'
import CardReveal from './CardReveal.vue'

const CARD = { id: 'zhouye', name: '周野', tier: 'normal', accent: '#e08a5a' }

afterEach(() => { vi.useRealTimers() })

async function mountFlipped(props = {}) {
  vi.useFakeTimers()
  const w = mount(DrawOverlay, { props: { card: CARD, ...props } })
  expect(w.find('.card-back').exists()).toBe(true)
  await vi.advanceTimersByTimeAsync(300)
  return w
}

describe('DrawOverlay', () => {
  it('先显示卡背，300ms 后翻到卡面并出现两个按钮', async () => {
    const w = await mountFlipped()
    expect(w.find('.card-back').exists()).toBe(false)
    expect(w.findComponent(CardReveal).props('progress')).toBe(0)
    const btns = w.findAll('.draw-actions .btn')
    expect(btns.map(b => b.text())).toEqual(['开始解锁', '先放着'])
  })

  it('点击开始解锁 / 先放着分别发事件', async () => {
    const w = await mountFlipped()
    await w.findAll('.draw-actions .btn')[0].trigger('click')
    expect(w.emitted('start')).toHaveLength(1)
    await w.findAll('.draw-actions .btn')[1].trigger('click')
    expect(w.emitted('later')).toHaveLength(1)
  })

  it('新卡显示新卡标记', async () => {
    const w = await mountFlipped({ isNew: true })
    expect(w.find('.new-tag').exists()).toBe(true)
    expect(w.text()).toContain('新卡')
  })

  it('重复抽到已解锁卡：隐藏挑战，卡面完整显示且按钮文案变化', async () => {
    const w = await mountFlipped({ hiddenChallenge: true })
    expect(w.findComponent(CardReveal).props('full')).toBe(true)
    expect(w.find('.draw-actions .btn').text()).toBe('开始隐藏挑战')
    expect(w.text()).toContain('隐藏挑战')
  })
})
