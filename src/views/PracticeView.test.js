import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PracticeView from './PracticeView.vue'
import PracticeCard from '../components/PracticeCard.vue'
import DrawOverlay from '../components/DrawOverlay.vue'
import ChoiceOverlay from '../components/ChoiceOverlay.vue'
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
  drawSentence: vi.fn(({ pool, lastId }) => {
    // 顺序轮转：场景测试要 16 句全部覆盖，不能只在两句之间来回跳
    const i = pool.findIndex(s => s.id === lastId)
    return pool[(i + 1) % pool.length]
  })
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

describe('场景抉择', () => {
  async function mountSceneView() {
    sessionStorage.setItem('interpret.session', JSON.stringify({ mode: 'scene', sceneId: 'scn02' }))
    return mountView()
  }

  // 场景句池 16 句全部评一遍：本场达标即触发抉择弹层
  async function clearScene(w) {
    for (let i = 0; i < 16; i++) {
      w.findComponent(PracticeCard).vm.$emit('revealed')
      await w.vm.$nextTick()
      await w.find('.rating-row .btn').trigger('click')
      await w.vm.$nextTick()
    }
  }

  it('本场练完弹出三选一，选择后落 flag 并关闭', async () => {
    const w = await mountSceneView()
    expect(w.findComponent(ChoiceOverlay).exists()).toBe(false)
    await clearScene(w)
    expect(w.findComponent(ChoiceOverlay).exists()).toBe(true)
    expect(w.findAll('.choice-card')).toHaveLength(3)

    await w.findAll('.choice-card')[0].trigger('click')
    await w.vm.$nextTick()
    expect(w.findComponent(ChoiceOverlay).exists()).toBe(false)

    const story = JSON.parse(localStorage.getItem('interpret.story.v1'))
    expect(story.choices.scn02).toBe('honest')
    expect(story.flags.shore_knows_you).toBe(true)
  })

  it('「先不决定」只关闭弹层，不写抉择', async () => {
    const w = await mountSceneView()
    await clearScene(w)
    await w.find('.choice-later').trigger('click')
    await w.vm.$nextTick()
    expect(w.findComponent(ChoiceOverlay).exists()).toBe(false)
    const story = localStorage.getItem('interpret.story.v1')
    expect(story ? JSON.parse(story).choices : {}).toEqual({})
  })

  it('上一幕的抉择会改变开场白与句池', async () => {
    localStorage.setItem('interpret.story.v1', JSON.stringify({ node: 'scn03', flags: { got_direction: true } }))
    sessionStorage.setItem('interpret.session', JSON.stringify({ mode: 'scene', sceneId: 'scn03' }))
    const w = await mountView()
    const opening = '老妇人给的方位很准。你顺着桅杆一路走，没有走错一步，直接到了滩口。'
    expect(w.find('.scene-premise').text()).toBe(opening)
    // 16 句基础池 + 1 句由 got_direction 解锁
    expect(w.find('.scene-foot').text()).toContain('0/17')
  })

  it('没有上一幕标记时，断船滩回到默认开场与 16 句', async () => {
    sessionStorage.setItem('interpret.session', JSON.stringify({ mode: 'scene', sceneId: 'scn03' }))
    const w = await mountView()
    expect(w.find('.scene-premise').text()).toContain('断船滩在沉城的屋脊上')
    expect(w.find('.scene-foot').text()).toContain('0/16')
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
