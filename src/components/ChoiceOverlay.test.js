import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChoiceOverlay from './ChoiceOverlay.vue'

const choice = {
  id: 'scn02_choice_01',
  trigger: '守滩老妇人拦住你，问你天没亮下海做什么。',
  note: '三种说法各通向一处后果；分支只看选择，不看录音得分。',
  options: [
    { id: 'honest', stance: '照实说', zh: '我是来找我师父的。' },
    { id: 'lie', stance: '瞒一句', zh: '我是替我师父来收一笔旧账的。' },
    { id: 'deflect', stance: '反问她', zh: '那他去年往哪个方向下的水？' }
  ]
}

describe('ChoiceOverlay', () => {
  it('渲染处境与全部选项（姿态 + 台词）', () => {
    const w = mount(ChoiceOverlay, { props: { choice } })
    expect(w.text()).toContain(choice.trigger)
    expect(w.text()).toContain(choice.note)
    const cards = w.findAll('.choice-card')
    expect(cards).toHaveLength(3)
    expect(cards[0].text()).toContain('照实说')
    expect(cards[0].text()).toContain(choice.options[0].zh)
  })

  it('点选项发出 choose 事件并带选项 id', async () => {
    const w = mount(ChoiceOverlay, { props: { choice } })
    await w.findAll('.choice-card')[1].trigger('click')
    expect(w.emitted('choose')[0]).toEqual(['lie'])
  })

  it('先不决定时发出 later，不落任何选项', async () => {
    const w = mount(ChoiceOverlay, { props: { choice } })
    await w.find('.choice-later').trigger('click')
    expect(w.emitted('later')).toBeTruthy()
    expect(w.emitted('choose')).toBeFalsy()
  })
})
