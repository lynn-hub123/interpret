import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SessionHistory from './SessionHistory.vue'

const items = [
  { sentence: { id: 'a', zh: '原文一。', en: 'Source one.' }, direction: 'zh2en', revealed: true },
  { sentence: { id: 'b', zh: '原文二。', en: 'Source two.' }, direction: 'zh2en', revealed: true }
]

describe('SessionHistory', () => {
  it('lists each practiced item as chat bubbles and closes on button', async () => {
    const w = mount(SessionHistory, { props: { items } })
    expect(w.text()).toContain('原文一。')
    expect(w.text()).toContain('Source two.')
    await w.find('.btn-close').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })
  it('shows empty hint when no items', () => {
    const w = mount(SessionHistory, { props: { items: [] } })
    expect(w.text()).toContain('还没有练过')
  })
})
