import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  BUCKETS, normalizeAi, getAiConfig, saveAiConfig, aiReady,
  scoreToBucket, bucketGap, needsConfirm, parseGradeResponse, gradeWithAI, testConnection
} from './grade.js'

const CFG = { baseUrl: 'https://api.example.com/v1/', model: 'm', apiKey: 'k' }

function chatResponse(content) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] })
  }
}

beforeEach(() => localStorage.clear())

describe('配置', () => {
  it('默认空配置，脏数据归一为字符串', () => {
    expect(getAiConfig()).toEqual({ baseUrl: '', model: '', apiKey: '' })
    expect(normalizeAi({ baseUrl: 1, model: null, apiKey: 'x' })).toEqual({ baseUrl: '', model: '', apiKey: 'x' })
  })
  it('aiReady 要求三项都填', () => {
    expect(aiReady({ baseUrl: '', model: 'm', apiKey: 'k' })).toBe(false)
    expect(aiReady({ baseUrl: 'u', model: 'm', apiKey: 'k' })).toBe(true)
  })
  it('saveAiConfig 落库', () => {
    expect(saveAiConfig(CFG)).toBe(true)
    expect(getAiConfig()).toEqual(CFG)
  })
})

describe('分数映射', () => {
  it('就近映射到五档并夹取 0..100', () => {
    expect(BUCKETS).toEqual([0, 25, 50, 75, 100])
    expect(scoreToBucket(0)).toBe(0)
    expect(scoreToBucket(12)).toBe(0)
    expect(scoreToBucket(13)).toBe(25)
    expect(scoreToBucket(37)).toBe(25)
    expect(scoreToBucket(38)).toBe(50)
    expect(scoreToBucket(87)).toBe(75)
    expect(scoreToBucket(120)).toBe(100)
    expect(scoreToBucket(-5)).toBe(0)
    expect(scoreToBucket(NaN)).toBeNull()
  })
})

describe('软校验阈值', () => {
  it('差 1 档不确认，差 2 档确认', () => {
    expect(bucketGap(50, 75)).toBe(1)
    expect(needsConfirm(50, 75)).toBe(false)
    expect(needsConfirm(50, 100)).toBe(true)
    expect(needsConfirm(0, 25)).toBe(false)
  })
  it('没有 AI 档位时不确认', () => {
    expect(needsConfirm(50, null)).toBe(false)
    expect(needsConfirm(50, undefined)).toBe(false)
  })
})

describe('响应解析', () => {
  it('接受纯 JSON 与 ```json 包裹', () => {
    expect(parseGradeResponse('{"score": 72, "reason": "不错"}')).toEqual({ score: 72, reason: '不错' })
    expect(parseGradeResponse('```json\n{"score": 40}\n```')).toEqual({ score: 40, reason: '' })
  })
  it('坏 JSON / 缺 score 返回 null', () => {
    expect(parseGradeResponse('nope')).toBeNull()
    expect(parseGradeResponse('{"reason":"x"}')).toBeNull()
    expect(parseGradeResponse(null)).toBeNull()
  })
})

describe('gradeWithAI', () => {
  const base = { config: CFG, sourceText: '中', referenceText: 'en', spokenText: 'hello' }

  it('成功返回 AI 档位与理由', async () => {
    const fetchFn = vi.fn(async () => chatResponse('{"score": 76, "reason": "基本完整"}'))
    const r = await gradeWithAI({ ...base, fetchFn })
    expect(r).toEqual({ bucket: 75, source: 'ai', reason: '基本完整', score: 76 })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://api.example.com/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer k')
  })

  it('无 key / 无识别文本直接自评，不发请求', async () => {
    const fetchFn = vi.fn()
    expect((await gradeWithAI({ ...base, config: { baseUrl: '', model: '', apiKey: '' }, fetchFn })).source).toBe('self')
    expect((await gradeWithAI({ ...base, spokenText: '   ', fetchFn })).source).toBe('self')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('首次失败重试一次后成功', async () => {
    const fetchFn = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(chatResponse('{"score": 50}'))
    const r = await gradeWithAI({ ...base, fetchFn })
    expect(r.bucket).toBe(50)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('两次失败降级为自评', async () => {
    const fetchFn = vi.fn(async () => { throw new Error('offline') })
    const r = await gradeWithAI({ ...base, fetchFn })
    expect(r).toEqual({ bucket: null, source: 'self', reason: '' })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('HTTP 非 2xx 降级为自评', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }))
    expect((await gradeWithAI({ ...base, fetchFn })).source).toBe('self')
  })

  it('无法解析的内容降级为自评', async () => {
    const fetchFn = vi.fn(async () => chatResponse('我觉得还行'))
    expect((await gradeWithAI({ ...base, fetchFn })).source).toBe('self')
  })
})

describe('testConnection', () => {
  it('配置不全返回 false 不发请求', async () => {
    const fetchFn = vi.fn()
    expect(await testConnection({ baseUrl: '', model: '', apiKey: '' }, { fetchFn })).toBe(false)
    expect(fetchFn).not.toHaveBeenCalled()
  })
  it('可解析响应返回 true，失败返回 false', async () => {
    const ok = vi.fn(async () => chatResponse('{"score": 90}'))
    expect(await testConnection(CFG, { fetchFn: ok })).toBe(true)
    const bad = vi.fn(async () => chatResponse('nope'))
    expect(await testConnection(CFG, { fetchFn: bad })).toBe(false)
  })
})
