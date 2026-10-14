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
})
