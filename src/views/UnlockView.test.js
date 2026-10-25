import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import UnlockView from './UnlockView.vue'
import PracticeCard from '../components/PracticeCard.vue'
import { onDrawn, getCardState } from '../lib/cards.js'
import { saveAiConfig } from '../lib/grade.js'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'zhouye' } }),
  useRouter: () => ({ push: vi.fn() })
}))

// 录音能力可控：默认可用，个别用例切到不可用验证纯自评降级
let recSupported = true
vi.mock('../lib/recorder.js', () => ({
  recorderSupported: () => recSupported,
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
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
})
