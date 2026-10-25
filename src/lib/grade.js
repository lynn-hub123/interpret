// 判定层：只做「分数 → 档位」与 AI 调用，不含任何 UI 状态。
// 任何失败都降级为纯自评（source: 'self', bucket: null），调用方据此标注。
import { load, save } from './storage.js'

export const BUCKETS = [0, 25, 50, 75, 100]
const KEY = 'ai.v1'
const SYSTEM_PROMPT = '你是口译评分器。根据原文、参考译文和学生口译的语音识别文本，给出 0-100 的完整度分数。只输出 JSON：{"score": 0-100, "reason": "一句话中文理由"}，不要输出任何其他内容。'

export function normalizeAi(v) {
  const s = v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  const str = x => (typeof x === 'string' ? x : '')
  return { baseUrl: str(s.baseUrl), model: str(s.model), apiKey: str(s.apiKey) }
}

export function getAiConfig() {
  return normalizeAi(load(KEY, null))
}

export function saveAiConfig(cfg) {
  return save(KEY, normalizeAi(cfg))
}

export function aiReady(cfg) {
  return Boolean(cfg && cfg.baseUrl.trim() && cfg.model.trim() && cfg.apiKey.trim())
}

export function scoreToBucket(score) {
  if (!Number.isFinite(score)) return null
  const clamped = Math.min(100, Math.max(0, score))
  return Math.round(clamped / 25) * 25
}

export function bucketGap(a, b) {
  const ia = BUCKETS.indexOf(a)
  const ib = BUCKETS.indexOf(b)
  if (ia < 0 || ib < 0) return Infinity
  return Math.abs(ia - ib)
}

// 软校验：机器与自评差 >= 2 档时弹一次确认
export function needsConfirm(selfBucket, aiBucket) {
  if (aiBucket === null || aiBucket === undefined) return false
  return bucketGap(selfBucket, aiBucket) >= 2
}

export function parseGradeResponse(raw) {
  if (typeof raw !== 'string') return null
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const obj = JSON.parse(raw.slice(start, end + 1))
    const score = Number(obj.score)
    if (!Number.isFinite(score)) return null
    return {
      score: Math.min(100, Math.max(0, score)),
      reason: typeof obj.reason === 'string' ? obj.reason : ''
    }
  } catch {
    return null
  }
}

export function buildGradeRequest(config, { sourceText, referenceText, spokenText }) {
  return {
    url: config.baseUrl.replace(/\/+$/, '') + '/chat/completions',
    body: {
      model: config.model,
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `原文：${sourceText}\n参考译文：${referenceText}\n学生口译（语音识别文本）：${spokenText}` }
      ]
    }
  }
}

async function requestOnce(config, payload, { fetchFn, timeoutMs }) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null
  try {
    const res = await fetchFn(payload.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(payload.body),
      signal: ctrl ? ctrl.signal : undefined
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return data && data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : ''
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function gradeWithAI({ config, sourceText, referenceText, spokenText, fetchFn = fetch, timeoutMs = 15000 }) {
  if (!aiReady(config) || !spokenText || !spokenText.trim()) {
    return { bucket: null, source: 'self', reason: '' }
  }
  const payload = buildGradeRequest(config, { sourceText, referenceText, spokenText })
  for (let i = 0; i < 2; i++) {
    try {
      const content = await requestOnce(config, payload, { fetchFn, timeoutMs })
      const parsed = parseGradeResponse(content)
      if (!parsed) return { bucket: null, source: 'self', reason: '' }
      return { bucket: scoreToBucket(parsed.score), source: 'ai', reason: parsed.reason, score: parsed.score }
    } catch {
      // 第一次失败继续重试，第二次失败落到循环外
    }
  }
  return { bucket: null, source: 'self', reason: '' }
}

export async function testConnection(config, { fetchFn = fetch, timeoutMs = 15000 } = {}) {
  if (!aiReady(config)) return false
  try {
    const payload = buildGradeRequest(config, { sourceText: '你好。', referenceText: 'Hello.', spokenText: 'Hello.' })
    const content = await requestOnce(config, payload, { fetchFn, timeoutMs })
    return Boolean(parseGradeResponse(content))
  } catch {
    return false
  }
}
