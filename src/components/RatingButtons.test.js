import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RatingButtons from './RatingButtons.vue'

describe('RatingButtons', () => {
  it('renders three ratings in fixed order and emits on click', async () => {
    const w = mount(RatingButtons)
    const btns = w.findAll('button')
    expect(btns.map(b => b.text())).toEqual(['能译', '磕绊', '不会'])
    await btns[1].trigger('click')
    expect(w.emitted('rate')).toEqual([['shaky']])
  })

  it('retell variant shows retell labels with same emit values', async () => {
    const w = mount(RatingButtons, { props: { variant: 'retell' } })
    const btns = w.findAll('button')
    expect(btns.map(b => b.text())).toEqual(['流畅', '磕绊', '没记住'])
    await btns[0].trigger('click')
    expect(w.emitted('rate')).toEqual([['ok']])
  })
})

describe('unlock variant', () => {
  it('渲染五档并原样回传 0/25/50/75/100', async () => {
    const w = mount(RatingButtons, { props: { variant: 'unlock' } })
    const btns = w.findAll('button')
    expect(btns.map(b => b.text())).toEqual(['完全翻不出来', '翻出一小部分', '翻出大半', '基本完整', '完整流畅'])
    await btns[4].trigger('click')
    expect(w.emitted('rate')).toEqual([[100]])
  })
})
