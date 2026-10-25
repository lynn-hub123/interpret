import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CardReveal from './CardReveal.vue'

const CARD = { name: '周野', tier: 'normal', accent: '#e08a5a' }

describe('CardReveal 剪影', () => {
  it('0% 时完整卡面层被隐藏（mask-size 0），剪影仍在', () => {
    const w = mount(CardReveal, { props: { ...CARD, progress: 0 } })
    expect(w.attributes('data-progress')).toBe('0')
    expect(w.find('.art').attributes('style')).toContain('0% 0%')
    expect(w.find('.silhouette').exists()).toBe(true)
    expect(w.find('.pct').text()).toBe('0%')
    expect(w.find('.pct').attributes('aria-hidden')).toBe('true')
  })

  it('25 / 50 / 75 对应 58% / 82% / 108% 的露出面积', () => {
    const at = p => mount(CardReveal, { props: { ...CARD, progress: p } }).find('.art').attributes('style')
    expect(at(25)).toContain('58% 58%')
    expect(at(50)).toContain('82% 82%')
    expect(at(75)).toContain('108% 108%')
  })

  it('100% 取消遮罩，完整显示', () => {
    const w = mount(CardReveal, { props: { ...CARD, progress: 100 } })
    expect(w.find('.art').attributes('style')).toContain('mask-image: none')
  })

  it('非法档位回落到 0，不多露', () => {
    const w = mount(CardReveal, { props: { ...CARD, progress: 30 } })
    expect(w.attributes('data-progress')).toBe('0')
    expect(w.find('.art').attributes('style')).toContain('0% 0%')
  })

  it('显示角色名与稀有度角标', () => {
    const w = mount(CardReveal, { props: { ...CARD, tier: 'super', progress: 0 } })
    expect(w.find('.name').text()).toBe('周野')
    expect(w.find('.tier-badge').text()).toBe('超稀有')
  })

  it('隐藏形态渲染角标与标记', () => {
    const w = mount(CardReveal, { props: { ...CARD, progress: 100, hidden: true } })
    expect(w.find('.hidden-badge').exists()).toBe(true)
    expect(w.attributes('data-hidden')).toBe('1')
    expect(w.find('.reveal').classes()).toContain('hidden-form')
  })

  it('full 模式完整显示且不显示百分比', () => {
    const w = mount(CardReveal, { props: { ...CARD, progress: 50, full: true } })
    expect(w.find('.art').attributes('style')).toContain('mask-image: none')
    expect(w.find('.pct').exists()).toBe(false)
  })
})
