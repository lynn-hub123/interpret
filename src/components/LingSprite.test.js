import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LingSprite from './LingSprite.vue'
import { LING_PIXELS } from '../data/lingSprite.js'

describe('LingSprite', () => {
  it('按 16×16 网格渲染像素，默认 96 尺寸', () => {
    const w = mount(LingSprite)
    expect(w.find('svg').attributes('width')).toBe('96')
    expect(w.find('svg').attributes('height')).toBe('96')
    expect(w.find('svg').attributes('viewBox')).toBe('0 0 16 16')
    expect(w.findAll('rect')).toHaveLength(LING_PIXELS.length)
  })

  it('size 可调，且带无障碍标签', () => {
    const w = mount(LingSprite, { props: { size: 64 } })
    expect(w.find('svg').attributes('width')).toBe('64')
    expect(w.find('svg').attributes('aria-label')).toContain('铃')
  })
})
