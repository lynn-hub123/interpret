import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PracticeView from './PracticeView.vue'
import PracticeCard from '../components/PracticeCard.vue'
import { loadSettings } from '../stores/settings.js'

vi.mock('../lib/sentences.js', () => ({
  allBuiltinSentences: () => [
    { id: 't1', zh: '第一句。', en: 'one', topic: 'daily', source: 'builtin' },
    { id: 't2', zh: '第二句。', en: 'two', topic: 'daily', source: 'builtin' }
  ],
  getCustomSentences: () => []
}))
vi.mock('../lib/picker.js', () => ({
  drawSentence: vi.fn(({ pool, lastId }) => pool.find(s => s.id !== lastId) || pool[0])
}))
vi.mock('../lib/srs.js', () => ({
  dueQueue: vi.fn(() => []),
  quotaAvailable: vi.fn(() => true),
  isDue: vi.fn(() => false),
  onRated: vi.fn()
}))
vi.mock('../lib/records.js', () => ({ addRecord: vi.fn(() => true) }))
vi.mock('../lib/storage.js', () => ({ storageAvailable: () => true, load: () => ({}), save: () => true }))
vi.mock('../lib/voice.js', () => ({ stop: vi.fn() }))

beforeEach(() => { localStorage.clear(); loadSettings() })

// onMounted 里才抽句（current 初次渲染为空态），等一个 tick 让卡片渲染出来
async function mountView() {
  const w = mount(PracticeView, { global: { stubs: { SessionHistory: true } } })
  await w.vm.$nextTick()
  return w
}

describe('PracticeView rating visibility', () => {
  it('retell mode: rating appears after recStopped without reveal, with retell labels', async () => {
    const { setMode } = await import('../stores/settings.js')
    setMode('retell')
    const w = await mountView()
    expect(w.text()).toContain('听完 → 开口复述 → 对照原文后自评')
    w.findComponent(PracticeCard).vm.$emit('recStopped')
    await w.vm.$nextTick()
    const btns = w.findAll('.rating-row .btn')
    expect(btns.map(b => b.text())).toEqual(['流畅', '磕绊', '没记住'])
  })
  it('sight mode: rating requires reveal, translate labels', async () => {
    const w = await mountView()
    expect(w.find('.rating-row').exists()).toBe(false)
    w.findComponent(PracticeCard).vm.$emit('revealed')
    await w.vm.$nextTick()
    expect(w.findAll('.rating-row .btn').map(b => b.text())).toEqual(['能译', '磕绊', '不会'])
  })
  it('retell mode: recDone resets on next sentence (new sentence starts unrated)', async () => {
    const { setMode } = await import('../stores/settings.js')
    setMode('retell')
    const w = await mountView()
    w.findComponent(PracticeCard).vm.$emit('recStopped')
    await w.vm.$nextTick()
    await w.findAll('.rating-row .btn')[0].trigger('click') // 流畅 → 下一句
    await w.vm.$nextTick()
    expect(w.find('.rating-row').exists()).toBe(false) // 新句 recDone=false
  })
  it('mode toggle shows three modes and applies on click', async () => {
    const w = await mountView()
    const modes = w.findAll('.mode-btn').map(b => b.text())
    expect(modes).toEqual(['视译', '听辨', '复述'])
    await w.findAll('.mode-btn')[2].trigger('click')
    const { settings } = await import('../stores/settings.js')
    expect(settings.value.mode).toBe('retell')
  })
})
