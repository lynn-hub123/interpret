import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import App from './App.vue'
import OnboardingOverlay from './components/OnboardingOverlay.vue'
import { addRecord } from './lib/records.js'

beforeEach(() => localStorage.clear())

const mountApp = () => mount(App, { global: { stubs: { RouterView: true, TabBar: true } } })

describe('App 新手引导', () => {
  it('全新存档首屏（练习页）就播铃的引导，不必先点进题库', () => {
    expect(mountApp().findComponent(OnboardingOverlay).exists()).toBe(true)
  })

  it('跳过后写入标记并关闭，不再重复播', async () => {
    const w = mountApp()
    await w.find('.onboard-overlay .actions .btn').trigger('click')
    expect(w.findComponent(OnboardingOverlay).exists()).toBe(false)
    expect(JSON.parse(localStorage.getItem('interpret.onboarded.v1'))).toBe(true)
  })

  it('已有练习记录的老玩家不再看到引导', () => {
    addRecord({ sentenceId: 'b_01', direction: 'zh2en', rating: 'ok' })
    expect(mountApp().findComponent(OnboardingOverlay).exists()).toBe(false)
  })
})
