import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PixelIcon from './PixelIcon.vue'

describe('PixelIcon', () => {
  it('按 8×8 网格渲染命名图标', () => {
    const w = mount(PixelIcon, { props: { name: 'mic', size: 24 } })
    expect(w.find('svg').attributes('viewBox')).toBe('0 0 8 8')
    expect(w.find('svg').attributes('width')).toBe('24')
    expect(w.findAll('rect').length).toBeGreaterThan(0)
    expect(w.find('svg').classes()).toContain('px-icon--mic')
  })

  it('齿轮用方块与孔洞绘制，未知图标不渲染像素', () => {
    const gear = mount(PixelIcon, { props: { name: 'gear' } })
    expect(gear.findAll('rect')).toHaveLength(6)
    const unknown = mount(PixelIcon, { props: { name: 'nope' } })
    expect(unknown.findAll('rect')).toHaveLength(0)
  })
})
