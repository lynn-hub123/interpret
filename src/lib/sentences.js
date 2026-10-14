import { load, save } from './storage.js'
import daily from '../data/library/daily.json'
import economy from '../data/library/economy.json'
import diplomacy from '../data/library/diplomacy.json'
import tech from '../data/library/tech.json'
import environment from '../data/library/environment.json'
import education from '../data/library/education.json'
import sports from '../data/library/sports.json'
import culture from '../data/library/culture.json'

export const TOPICS = [
  { id: 'daily', label: '日常' },
  { id: 'economy', label: '经济' },
  { id: 'diplomacy', label: '外交' },
  { id: 'tech', label: '科技' },
  { id: 'environment', label: '环保' },
  { id: 'education', label: '教育' },
  { id: 'sports', label: '体育' },
  { id: 'culture', label: '文化' }
]

const BUILTIN = { daily, economy, diplomacy, tech, environment, education, sports, culture }

let _allBuiltin
// 共享缓存：内置数据静态不可变，调用方不得修改返回数组及其元素
export function allBuiltinSentences() {
  return (_allBuiltin ??= TOPICS.flatMap(t => BUILTIN[t.id].map(s => ({ ...s, topic: t.id, source: 'builtin' }))))
}

export function sentenceById(id) {
  return allBuiltinSentences().find(s => s.id === id) || getCustomSentences().find(s => s.id === id) || null
}

export function detectLang(text) {
  if (typeof text !== 'string' || !text.trim()) return 'en'
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length
  return cjk / text.replace(/\s/g, '').length > 0.3 ? 'zh' : 'en'
}

export function splitPasteText(text) {
  return text
    .split(/(?<=[。！？!?])|(?<!\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|No)\.)(?<=[.!?])\s+|[\n；;]+/)
    .map(s => s.trim())
    .filter(s => s.replace(/[\s。！？!?.,;；、]/g, '').length >= 2)
}

export function addCustomSentences(texts) {
  const list = getCustomSentences()
  const added = texts.map((t, i) => {
    const lang = detectLang(t)
    return {
      id: `c_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      zh: lang === 'zh' ? t : '',
      en: lang === 'en' ? t : '',
      topic: 'paste',
      source: 'custom'
    }
  })
  const persisted = save('custom.v1', [...list, ...added])
  return { added, persisted }
}

export function getCustomSentences() {
  const list = load('custom.v1', [])
  return Array.isArray(list) ? list : []
}
