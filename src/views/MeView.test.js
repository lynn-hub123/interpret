import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import MeView from './MeView.vue'
import { save } from '../lib/storage.js'
import { getAiConfig } from '../lib/grade.js'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() })
}))

beforeEach(() => localStorage.clear())

describe('卡牌图鉴', () => {
  it('渲染 8 张卡与 8 个隐藏形态暗格', () => {
    const w = mount(MeView)
    expect(w.findAll('.gallery-item')).toHaveLength(8)
    expect(w.findAll('.slot')).toHaveLength(8)
    expect(w.text()).toContain('隐藏形态 ?')
  })

  it('未抽到的卡显示未获得，已抽到的卡显示进度', () => {
    save('cards.v1', {
      zhouye: { attempts: 1, progress: 75, unlocked: false, hidden: false, peeked: false, lastAt: 1 }
    })
    const w = mount(MeView)
    expect(w.findAll('.gallery-item.is-locked')).toHaveLength(7)
    const unlocked = w.findAll('.gallery-item').filter(i => !i.classes().includes('is-locked'))
    expect(unlocked).toHaveLength(1)
    expect(unlocked[0].find('.gallery-progress').text()).toBe('75%')
  })

  it('已获得隐藏形态的暗格点亮', () => {
    save('cards.v1', {
      zhouye: { attempts: 1, progress: 100, unlocked: true, hidden: true, peeked: false, lastAt: 1 }
    })
    const w = mount(MeView)
    expect(w.text()).toContain('隐藏形态 ✓')
  })
})

describe('AI 判分配置', () => {
  it('三个输入框保存到 ai.v1', async () => {
    const w = mount(MeView)
    const inputs = w.findAll('.ai-form input')
    expect(inputs).toHaveLength(3)
    await inputs[0].setValue('https://api.example.com/v1')
    await inputs[1].setValue('gpt-4o-mini')
    await inputs[2].setValue('sk-test')
    await w.find('.btn-ai-save').trigger('click')
    expect(getAiConfig()).toEqual({ baseUrl: 'https://api.example.com/v1', model: 'gpt-4o-mini', apiKey: 'sk-test' })
    expect(w.text()).toContain('已保存')
  })

  it('密钥说明文案存在', () => {
    const w = mount(MeView)
    expect(w.text()).toContain('密钥只存在本机浏览器')
  })
})
