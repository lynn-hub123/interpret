import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import App from './App.vue'

beforeEach(() => localStorage.clear())

// 旧玩法入口（TabBar / 新手引导）已从外壳摘下，组件文件保留
describe('App 外壳', () => {
  it('只渲染路由出口', () => {
    const w = mount(App, {
      global: { stubs: { RouterView: { template: '<div class="rv-stub" />' } } }
    })
    expect(w.find('.rv-stub').exists()).toBe(true)
    expect(w.find('.tab-bar').exists()).toBe(false)
  })
})
