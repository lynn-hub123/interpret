import { describe, it, expect, beforeEach } from 'vitest'
import { TOPICS, allBuiltinSentences, splitPasteText, detectLang, addCustomSentences, getCustomSentences, sentenceById } from './sentences.js'

beforeEach(() => localStorage.clear())

describe('builtin library', () => {
  it('exposes 8 topics with labels', () => {
    expect(TOPICS.map(t => t.id)).toEqual(['daily', 'economy', 'diplomacy', 'tech', 'environment', 'education', 'sports', 'culture'])
    expect(TOPICS.every(t => typeof t.label === 'string')).toBe(true)
  })
  it('loads sentences with id/zh/en/topic', () => {
    const all = allBuiltinSentences()
    expect(all.length).toBeGreaterThanOrEqual(6)
    expect(all[0]).toEqual(expect.objectContaining({ id: expect.any(String), zh: expect.any(String), en: expect.any(String) }))
  })
  it('sentenceById finds builtin and custom', () => {
    const first = allBuiltinSentences()[0]
    expect(sentenceById(first.id).id).toBe(first.id)
    addCustomSentences(['这是自定义的句子。'])
    const custom = getCustomSentences()[0]
    expect(sentenceById(custom.id).zh).toBe('这是自定义的句子。')
  })
})

describe('splitPasteText', () => {
  it('splits on Chinese and English punctuation and newlines', () => {
    const out = splitPasteText('第一句。第二句！\nThird one. Fourth? ')
    expect(out).toEqual(['第一句。', '第二句！', 'Third one.', 'Fourth?'])
  })
  it('keeps abbreviations with trailing dot intact-ish (no empty parts)', () => {
    expect(splitPasteText('Hello Mr. Wang. 再见。')).toEqual(['Hello Mr. Wang.', '再见。'])
  })
  it('drops fragments shorter than 2 chars', () => {
    expect(splitPasteText('a。好的。')).toEqual(['好的。'])
  })
})

describe('detectLang', () => {
  it('detects zh vs en', () => {
    expect(detectLang('这是中文句子')).toBe('zh')
    expect(detectLang('This is English')).toBe('en')
  })
})

describe('custom sentences', () => {
  it('adds with generated id, source custom, topic paste', () => {
    addCustomSentences(['你好。', 'Hello.'])
    const list = getCustomSentences()
    expect(list).toHaveLength(2)
    expect(list[0]).toEqual(expect.objectContaining({ zh: '你好。', en: '', source: 'custom', topic: 'paste' }))
    expect(list[0].id).toMatch(/^c_/)
  })
})
