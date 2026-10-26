import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import UnlockView from './UnlockView.vue'
import PracticeCard from '../components/PracticeCard.vue'
import CardReveal from '../components/CardReveal.vue'
import { onDrawn, getCardState, recordAttempt } from '../lib/cards.js'
import { saveAiConfig } from '../lib/grade.js'

// 路由 id 可控：默认已抽到的 «zhouye»，个别用例切到未抽到的卡验证门禁
const { routeRef } = vi.hoisted(() => ({ routeRef: { id: 'zhouye' } }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: routeRef.id } }),
  useRouter: () => ({ push: vi.fn() })
}))

// 录音能力可控：默认可用，个别用例切到不可用验证纯自评降级
let recSupported = true
vi.mock('../lib/recorder.js', () => ({
  recorderSupported: () => recSupported,
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
  isRecording: vi.fn(() => false),
  revoke: vi.fn(),
  lastErrorName: () => ''
}))

function mountView() {
  return mount(UnlockView, { global: { stubs: { PracticeCard: true } } })
}

async function flush() {
  await new Promise(r => setTimeout(r, 0))
}

beforeEach(() => {
  localStorage.clear()
  recSupported = true
  routeRef.id = 'zhouye'
  onDrawn('zhouye')
})

afterEach(() => { vi.unstubAllGlobals() })

describe('录音门禁', () => {
  it('未录音时不出现评分按钮', () => {
    const w = mountView()
    expect(w.find('.rating-row').exists()).toBe(false)
    expect(w.text()).toContain('先录一次音')
  })

  it('录音停止后出现五个档位按钮', async () => {
    const w = mountView()
    w.findComponent(PracticeCard).vm.$emit('recStopped', 'hello there')
    await w.vm.$nextTick()
    const btns = w.findAll('.rating-row .btn')
    expect(btns.map(b => b.text())).toEqual(['完全翻不出来', '翻出一小部分', '翻出大半', '基本完整', '完整流畅'])
  })

  it('录音不可用时直接给五档并标注纯自评', () => {
    recSupported = false
    const w = mountView()
    expect(w.findAll('.rating-row .btn')).toHaveLength(5)
    expect(w.text()).toContain('本设备无法录音')
  })

  it('录音不可用时再试一次仍直接给五档，不回到录音门禁', async () => {
    recSupported = false
    const w = mountView()
    await w.findAll('.rating-row .btn')[2].trigger('click')
    await w.vm.$nextTick()
    expect(w.find('.result').exists()).toBe(true)

    await w.findAll('.result-actions .btn').find(b => b.text() === '再试一次').trigger('click')
    await w.vm.$nextTick()
    expect(w.findAll('.rating-row .btn')).toHaveLength(5)
    expect(w.text()).not.toContain('先录一次音')
    expect(w.text()).toContain('本设备无法录音')
  })
})

describe('提交评分', () => {
  it('首次 100% 同时解锁普通与隐藏形态，并写练习记录与进度', async () => {
    const w = mountView()
    w.findComponent(PracticeCard).vm.$emit('recStopped', 'the whole time')
    await w.vm.$nextTick()
    await w.findAll('.rating-row .btn')[4].trigger('click')
    await w.vm.$nextTick()
    expect(getCardState('zhouye')).toMatchObject({ attempts: 1, progress: 100, unlocked: true, hidden: true })
    expect(w.text()).toContain('隐藏形态已获得')
    expect(JSON.parse(localStorage.getItem('interpret.progress.v1')).total).toBe(1)
    expect(JSON.parse(localStorage.getItem('interpret.records.v1'))).toHaveLength(1)
  })

  it('首次 50%：解锁提示不出现，结果面板显示 50%', async () => {
    const w = mountView()
    w.findComponent(PracticeCard).vm.$emit('recStopped', 'part')
    await w.vm.$nextTick()
    await w.findAll('.rating-row .btn')[2].trigger('click')
    await w.vm.$nextTick()
    expect(getCardState('zhouye')).toMatchObject({ progress: 50, unlocked: false, hidden: false })
    expect(w.text()).toContain('本次 50%')
    expect(w.text()).not.toContain('普通形态已永久解锁')
  })

  it('看过参考译文后 100% 不给隐藏形态', async () => {
    const w = mountView()
    w.findComponent(PracticeCard).vm.$emit('revealed')
    await w.vm.$nextTick()
    expect(getCardState('zhouye').peeked).toBe(true)
    w.findComponent(PracticeCard).vm.$emit('recStopped', 'all of it')
    await w.vm.$nextTick()
    await w.findAll('.rating-row .btn')[4].trigger('click')
    await w.vm.$nextTick()
    expect(getCardState('zhouye').hidden).toBe(false)
    expect(w.text()).toContain('看过参考译文')
  })

  it('首次偷看且未满 100%：提示隐藏资格作废', async () => {
    const w = mountView()
    w.findComponent(PracticeCard).vm.$emit('revealed')
    await w.vm.$nextTick()
    w.findComponent(PracticeCard).vm.$emit('recStopped', 'part')
    await w.vm.$nextTick()
    await w.findAll('.rating-row .btn')[2].trigger('click')
    await w.vm.$nextTick()
    expect(w.text()).toContain('隐藏形态资格已作废')
    expect(w.text()).not.toContain('看过参考译文')
  })

  it('已解锁未隐藏的卡：首次未拿满 100% 后重试，隐藏挑战与完整卡面都消失', async () => {
    recordAttempt({ cardId: 'zhouye', bucket: 50 })
    recordAttempt({ cardId: 'zhouye', bucket: 100 }) // 先解锁普通形态，hidden 仍为 false
    onDrawn('zhouye') // 重新抽到：attempts 归零，隐藏挑战成立
    const w = mountView()
    expect(w.findComponent(CardReveal).props('full')).toBe(true)
    expect(w.text()).toContain('隐藏挑战')

    w.findComponent(PracticeCard).vm.$emit('recStopped', 'part')
    await w.vm.$nextTick()
    await w.findAll('.rating-row .btn')[2].trigger('click')
    await w.vm.$nextTick()
    await w.findAll('.result-actions .btn').find(b => b.text() === '再试一次').trigger('click')
    await w.vm.$nextTick()

    expect(w.findComponent(CardReveal).props('full')).toBe(false)
    expect(w.text()).not.toContain('隐藏挑战')
    expect(w.text()).toContain('再练一次，卡面进度只升不降')
  })

  it('已解锁 progress=75 的卡偷看后，隐藏挑战与完整卡面失效', async () => {
    localStorage.setItem('interpret.cards.v1', JSON.stringify({
      zhouye: { attempts: 0, progress: 75, unlocked: true, hidden: false, peeked: false, lastAt: 0 }
    }))
    const w = mountView()
    expect(w.findComponent(CardReveal).props('full')).toBe(true)
    expect(w.text()).toContain('隐藏挑战')

    w.findComponent(PracticeCard).vm.$emit('revealed')
    await w.vm.$nextTick()

    expect(w.findComponent(CardReveal).props('full')).toBe(false)
    expect(w.text()).not.toContain('隐藏挑战')
    expect(w.text()).toContain('已看过参考译文')
  })
})

describe('AI 软校验', () => {
  it('AI 与自评差 2 档时二次确认，可选改成 AI 档位', async () => {
    saveAiConfig({ baseUrl: 'https://api.example.com/v1', model: 'm', apiKey: 'k' })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"score": 75, "reason": "基本完整"}' } }] })
    })))
    const w = mountView()
    w.findComponent(PracticeCard).vm.$emit('recStopped', 'some words')
    await w.vm.$nextTick()

    await w.find('.btn-ai').trigger('click')
    await flush()
    await w.vm.$nextTick()
    expect(w.find('.ai-note').text()).toContain('AI 认为 75%')

    await w.findAll('.rating-row .btn')[0].trigger('click') // 自评 0%，差 3 档
    await w.vm.$nextTick()
    expect(w.find('.confirm').exists()).toBe(true)
    expect(w.find('.confirm').text()).toContain('75%')

    await w.findAll('.confirm-actions .btn')[1].trigger('click') // 改成 75%
    await w.vm.$nextTick()
    expect(getCardState('zhouye').progress).toBe(75)
    expect(w.find('.confirm').exists()).toBe(false)
  })

  it('AI 请求未返回时重试，旧结果不写入新面板', async () => {
    saveAiConfig({ baseUrl: 'https://api.example.com/v1', model: 'm', apiKey: 'k' })
    let resolveFetch
    const pending = new Promise(r => { resolveFetch = r })
    vi.stubGlobal('fetch', vi.fn(() => pending))
    const w = mountView()
    w.findComponent(PracticeCard).vm.$emit('recStopped', 'old words')
    await w.vm.$nextTick()
    await w.find('.btn-ai').trigger('click')
    expect(w.find('.btn-ai').text()).toBe('AI 评分中…')

    await w.findAll('.rating-row .btn')[2].trigger('click')
    await w.vm.$nextTick()
    await w.findAll('.result-actions .btn').find(b => b.text() === '再试一次').trigger('click')
    await w.vm.$nextTick()

    resolveFetch({ ok: true, json: async () => ({ choices: [{ message: { content: '{"score": 100, "reason": "旧结果"}' } }] }) })
    await flush()
    await w.vm.$nextTick()

    expect(w.find('.ai-note').exists()).toBe(false)
    expect(w.text()).not.toContain('AI 认为')
    w.findComponent(PracticeCard).vm.$emit('recStopped', 'new words')
    await w.vm.$nextTick()
    expect(w.find('.btn-ai').text()).toBe('让 AI 评一下') // aiBusy 已复位
  })

  it('AI 请求未返回时修改识别文本，旧结果不写入面板', async () => {
    saveAiConfig({ baseUrl: 'https://api.example.com/v1', model: 'm', apiKey: 'k' })
    let resolveFetch
    const pending = new Promise(r => { resolveFetch = r })
    vi.stubGlobal('fetch', vi.fn(() => pending))
    const w = mountView()
    w.findComponent(PracticeCard).vm.$emit('recStopped', 'old words')
    await w.vm.$nextTick()
    await w.find('.btn-ai').trigger('click')
    expect(w.find('.btn-ai').text()).toBe('AI 评分中…')

    await w.find('textarea').setValue('new words')

    resolveFetch({ ok: true, json: async () => ({ choices: [{ message: { content: '{"score": 100, "reason": "旧结果"}' } }] }) })
    await flush()
    await w.vm.$nextTick()

    expect(w.find('.ai-note').exists()).toBe(false)
    expect(w.text()).not.toContain('AI 认为')
    expect(w.find('.btn-ai').text()).toBe('让 AI 评一下')
  })

  it('修改识别文本后关闭确认框，避免用过期 AI 档位提交', async () => {
    saveAiConfig({ baseUrl: 'https://api.example.com/v1', model: 'm', apiKey: 'k' })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"score": 75, "reason": "基本完整"}' } }] })
    })))
    const w = mountView()
    w.findComponent(PracticeCard).vm.$emit('recStopped', 'some words')
    await w.vm.$nextTick()
    await w.find('.btn-ai').trigger('click')
    await flush()
    await w.vm.$nextTick()

    await w.findAll('.rating-row .btn')[0].trigger('click') // 自评 0%，差 3 档
    await w.vm.$nextTick()
    expect(w.find('.confirm').exists()).toBe(true)

    await w.find('textarea').setValue('changed words')
    expect(w.find('.confirm').exists()).toBe(false)
    expect(w.find('.ai-note').exists()).toBe(false)
  })

  it('识别文本为空时不出现 AI 按钮，并标注本次为自评', async () => {
    saveAiConfig({ baseUrl: 'https://api.example.com/v1', model: 'm', apiKey: 'k' })
    const w = mountView()
    w.findComponent(PracticeCard).vm.$emit('recStopped', '   ')
    await w.vm.$nextTick()
    expect(w.find('.btn-ai').exists()).toBe(false)
    expect(w.text()).toContain('本次为自评')
  })

  it('未配置 AI Key 时也标注本次为自评，且不出现 AI 按钮', async () => {
    const w = mountView()
    w.findComponent(PracticeCard).vm.$emit('recStopped', 'some words')
    await w.vm.$nextTick()
    expect(w.find('.btn-ai').exists()).toBe(false)
    expect(w.text()).toContain('本次为自评')
  })

  it('AI 给出结果后不显示本次为自评；改识别文本后 AI 结论失效', async () => {
    saveAiConfig({ baseUrl: 'https://api.example.com/v1', model: 'm', apiKey: 'k' })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"score": 75, "reason": "基本完整"}' } }] })
    })))
    const w = mountView()
    w.findComponent(PracticeCard).vm.$emit('recStopped', 'some words')
    await w.vm.$nextTick()
    await w.find('.btn-ai').trigger('click')
    await flush()
    await w.vm.$nextTick()
    expect(w.find('.ai-note').text()).toContain('AI 认为 75%')
    expect(w.text()).not.toContain('本次为自评')

    await w.find('textarea').setValue('changed words')
    expect(w.find('.ai-note').exists()).toBe(false)
    expect(w.text()).toContain('本次为自评')
  })
})

describe('解锁页控件门禁', () => {
  it('不出现跳过按钮，传给 PracticeCard 的 hideSkip 为 true', () => {
    const w = mountView()
    expect(w.find('.btn-skip').exists()).toBe(false)
    expect(w.findComponent(PracticeCard).props('hideSkip')).toBe(true)
  })
})

describe('抽卡门禁', () => {
  it('未抽到的卡显示空态、无评分按钮，也不写 cards.v1', () => {
    routeRef.id = 'xielin' // 有效卡号，但本用例未抽到
    localStorage.clear()
    const w = mountView()
    expect(w.text()).toContain('这张卡还没有抽到')
    expect(w.find('.rating-row').exists()).toBe(false)
    expect(w.findComponent(PracticeCard).exists()).toBe(false)
    expect(getCardState('xielin').attempts).toBe(0)
    expect(localStorage.getItem('interpret.cards.v1')).toBeNull()
  })
})
