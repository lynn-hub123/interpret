import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import OnboardingOverlay from './OnboardingOverlay.vue'

describe('OnboardingOverlay', () => {
  it('第一屏讲汐洲，按钮是「下一步」', () => {
    const w = mount(OnboardingOverlay)
    expect(w.find('.onboard-panel').attributes('data-step')).toBe('0')
    expect(w.text()).toContain('每年退潮七天')
    expect(w.find('.btn-primary').text()).toBe('下一步')
  })

  it('逐屏推进，最后一屏按钮变「开始」并发出 done', async () => {
    const w = mount(OnboardingOverlay)
    await w.find('.btn-primary').trigger('click')
    await w.find('.btn-primary').trigger('click')
    expect(w.find('.onboard-panel').attributes('data-step')).toBe('2')
    expect(w.text()).toContain('两条禁忌')
    expect(w.find('.btn-primary').text()).toBe('开始')

    await w.find('.btn-primary').trigger('click')
    expect(w.emitted('done')).toBeTruthy()
  })

  it('跳过直接发出 done，不逐屏走', async () => {
    const w = mount(OnboardingOverlay)
    await w.find('.actions .btn').trigger('click')
    expect(w.emitted('done')).toHaveLength(1)
  })

  it('每一屏只显示自己的关键词', async () => {
    const w = mount(OnboardingOverlay)
    expect(w.text()).not.toContain('下海前的两条禁忌')
    await w.find('.btn-primary').trigger('click')
    expect(w.text()).toContain('把海底的话带上来')
    expect(w.text()).not.toContain('每年退潮七天')
  })
})
