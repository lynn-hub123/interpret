// 语料处理纯函数库：语言检测、拆句、过滤、去重、哈希 id、对齐、组装校验。
// 供 fetch-corpus.mjs 编排调用；无网络无 IO，Vitest 直接单测。
import { createHash } from 'node:crypto'

export const MIN_SENTENCES = 40 // 低于此数视为抓取失败，不写入
export const MAX_SENTENCES = 80 // 每主题截取上限
export const ZH_MAX = 60        // 中文长度上限（字）
export const EN_MAX_WORDS = 50  // 英文长度上限（词）
export const EN_MAX_CHARS = 200 // 与 library.test.js 的 en ≤ 200 断言对齐

// ---------- 语言检测 ----------
export function isZh(text) {
  if (typeof text !== 'string' || !text.trim()) return false
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length
  return cjk / text.replace(/\s/g, '').length > 0.3
}

export function isEn(text) {
  if (typeof text !== 'string' || !text.trim()) return false
  if (/[\u4e00-\u9fff]/.test(text)) return false
  const latin = (text.match(/[A-Za-z]/g) || []).length
  return latin / text.replace(/\s/g, '').length > 0.6
}

// ---------- 拆句 ----------
export function splitZh(text) {
  return (text || '')
    .split(/(?<=[。！？；!?;])/)
    .map(s => s.trim())
    .filter(Boolean)
}

// 句尾缩写（Mr. / U.S. 等）后不拆句：常见缩写词表 + 单个大写字母加句点
const EN_ABBREV = /(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|Inc|Ltd|Corp|Co|e\.g|i\.e|U\.S|U\.K)\.$|[A-Z]\.$/

export function splitEn(text) {
  const raw = (text || '')
    .split(/(?<=[.!?]["”)]?)\s+/)
    .map(s => s.trim())
    .filter(Boolean)
  const out = []
  for (const part of raw) {
    const prev = out[out.length - 1]
    if (prev && EN_ABBREV.test(prev)) out[out.length - 1] = `${prev} ${part}`
    else out.push(part)
  }
  return out
}

// ---------- 过滤（宁缺毋滥，全部硬编码，无人工审核） ----------
const hasLinkOrEmail = s => /https?:\/\/|www\.|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(s)
// 去掉数字、空白、标点、符号后剩余实质内容，用于剔除纯数字/符号句
const substantive = s => s.replace(/[\d\s\p{P}\p{S}]/gu, '')

export function isValidPair(pair) {
  if (!pair || typeof pair.zh !== 'string' || typeof pair.en !== 'string') return false
  const zh = pair.zh.trim()
  const en = pair.en.trim()
  if (zh.length < 5 || zh.length > ZH_MAX) return false
  if (en.length < 5 || en.length > EN_MAX_CHARS) return false
  if (en.split(/\s+/).length > EN_MAX_WORDS) return false
  if (!substantive(zh) || !substantive(en)) return false
  if (hasLinkOrEmail(zh) || hasLinkOrEmail(en)) return false
  if (!isZh(zh) || !isEn(en)) return false
  return true
}

// ---------- 去重（按中文文本，空白归一） ----------
export function dedupePairs(pairs) {
  const seen = new Set()
  const out = []
  for (const p of pairs) {
    const key = p.zh.replace(/\s/g, '')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

// ---------- 哈希 id：中文文本 sha256 前 8 位，重抓后 id 稳定，练习记录延续 ----------
export function hashId(prefix, zhText) {
  const hex = createHash('sha256').update(zhText, 'utf8').digest('hex')
  return `${prefix}${hex.slice(0, 8)}`
}

// ---------- 段落对齐：中英段落按序一一配对，取较小侧，差额由调用方告警 ----------
export function alignPairs(zhParas, enParas) {
  const n = Math.min(zhParas.length, enParas.length)
  const out = []
  for (let i = 0; i < n; i++) out.push({ zh: zhParas[i], en: enParas[i] })
  return out
}

// ---------- 组装：过滤 → 去重 → 哈希 id → 截取上限 ----------
export function buildTopicSentences(pairs, prefix) {
  return dedupePairs(pairs.filter(isValidPair))
    .map(p => ({ id: hashId(prefix, p.zh), zh: p.zh, en: p.en }))
    .slice(0, MAX_SENTENCES)
}

// ---------- 写入前校验：非空、前缀、唯一、数量下限；不过即抛错（调用方退出，不写文件） ----------
export function assertTopicValid(sentences, topic) {
  const ids = new Set()
  for (const s of sentences) {
    if (!s.zh || !s.en) throw new Error(`空句子：${s.id}`)
    if (!s.id.startsWith(`${topic}_`)) throw new Error(`id 前缀错误：${s.id}`)
    if (ids.has(s.id)) throw new Error(`重复 id：${s.id}`)
    ids.add(s.id)
  }
  if (sentences.length < MIN_SENTENCES) {
    throw new Error(`句数不足：${topic} 仅 ${sentences.length} 句（要求 ≥ ${MIN_SENTENCES}），不写入`)
  }
  return true
}
