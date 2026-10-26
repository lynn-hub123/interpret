import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PracticeView from './PracticeView.vue'
import PracticeCard from '../components/PracticeCard.vue'
import DrawOverlay from '../components/DrawOverlay.vue'
import { loadSettings } from '../stores/settings.js'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() })
}))

// 默认委托真实实现，仅在被测试覆盖时接管，避免影响既有抽卡用例
const drawOverride = vi.hoisted(() => ({ impl: null }))
vi.mock('../lib/cardpool.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, drawCard: (args) => (drawOverride.impl ? drawOverride.impl(args) : actual.drawCard(args)) }
})

const cardsOverride = vi.hoisted(() => ({ onDrawn: null, actual: null }))
vi.mock('../lib/cards.js', async (importOriginal) => {
  const actual = await importOriginal()
  cardsOverride.actual = actual
  return { ...actual, onDrawn: (id) => (cardsOverride.onDrawn ? cardsOverride.onDrawn(id) : actual.onDrawn(id)) }
})

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
vi.mock('../lib/storage.js', () => ({
  storageAvailable: () => true,
  load: (k, fb) => {
    const raw = localStorage.getItem('interpret.' + k)
    return raw ? JSON.parse(raw) : fb
  },
  save: (k, v) => {
    localStorage.setItem('interpret.' + k, JSON.stringify(v))
    return true
  }
}))
vi.mock('../lib/voice.js', () => ({ stop: vi.fn() }))

beforeEach(() => {
  localStorage.clear()
  loadSettings()
  drawOverride.impl = null
  cardsOverride.onDrawn = null
})

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

describe('抽卡入口', () => {
  it('初始显示 0/5、券 ×0、按钮禁用且提示还差 5 句', async () => {
    const w = await mountView()
    expect(w.find('.prog').text()).toContain('0/5')
    expect(w.find('.prog').text()).toContain('券 ×0')
    const btn = w.find('.btn-draw')
    expect(btn.text()).toBe('还差 5 句')
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('评分一次后进度变 1/5', async () => {
    const w = await mountView()
    w.findComponent(PracticeCard).vm.$emit('revealed')
    await w.vm.$nextTick()
    await w.findAll('.rating-row .btn')[0].trigger('click')
    await w.vm.$nextTick()
    expect(w.find('.prog').text()).toContain('1/5')
  })

  it('练满 5 句后按钮可用并显示抽卡；点击后弹出遮罩并扣券', async () => {
    const w = await mountView()
    for (let i = 0; i < 5; i++) {
      w.findComponent(PracticeCard).vm.$emit('revealed')
      await w.vm.$nextTick()
      await w.findAll('.rating-row .btn')[0].trigger('click')
      await w.vm.$nextTick()
    }
    expect(w.find('.prog').text()).toContain('券 ×1')
    const btn = w.find('.btn-draw')
    expect(btn.text()).toBe('抽卡')
    expect(btn.attributes('disabled')).toBeUndefined()
    await btn.trigger('click')
    await w.vm.$nextTick()
    expect(w.findComponent(DrawOverlay).exists()).toBe(true)
    expect(JSON.parse(localStorage.getItem('interpret.progress.v1')).tickets).toBe(0)
    expect(JSON.parse(localStorage.getItem('interpret.cards.v1'))).toBeTruthy()
  })

  it('onDrawn 持久化失败仍扣券并弹卡（先发卡后扣券）', async () => {
    const w = await mountView()
    for (let i = 0; i < 5; i++) {
      w.findComponent(PracticeCard).vm.$emit('revealed')
      await w.vm.$nextTick()
      await w.findAll('.rating-row .btn')[0].trigger('click')
      await w.vm.$nextTick()
    }
    expect(JSON.parse(localStorage.getItem('interpret.progress.v1')).tickets).toBe(1)
    cardsOverride.onDrawn = (id) => ({ ...cardsOverride.actual.onDrawn(id), persisted: false })
    await w.find('.btn-draw').trigger('click')
    await w.vm.$nextTick()
    expect(w.findComponent(DrawOverlay).exists()).toBe(true)
    expect(JSON.parse(localStorage.getItem('interpret.progress.v1')).tickets).toBe(0)
  })

  it('drawCard 返回 null 时不扣券、不弹遮罩（先发卡后扣券）', async () => {
    const w = await mountView()
    for (let i = 0; i < 5; i++) {
      w.findComponent(PracticeCard).vm.$emit('revealed')
      await w.vm.$nextTick()
      await w.findAll('.rating-row .btn')[0].trigger('click')
      await w.vm.$nextTick()
    }
    expect(JSON.parse(localStorage.getItem('interpret.progress.v1')).tickets).toBe(1)
    drawOverride.impl = () => null
    await w.find('.btn-draw').trigger('click')
    await w.vm.$nextTick()
    expect(w.findComponent(DrawOverlay).exists()).toBe(false)
    expect(JSON.parse(localStorage.getItem('interpret.progress.v1')).tickets).toBe(1)
  })
})
