import { describe, it, expect, beforeEach } from 'vitest'
import { TOPICS, allBuiltinSentences, splitPasteText, detectLang, addCustomSentences, getCustomSentences, sentenceById, removeCustomSentences, restoreCustomSentences } from './sentences.js'

beforeEach(() => localStorage.clear())

describe('builtin library', () => {
  it('exposes 10 topics with labels', () => {
    expect(TOPICS.map(t => t.id)).toEqual(['daily', 'economy', 'diplomacy', 'tech', 'environment', 'education', 'sports', 'culture', 'govreport', 'news'])
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

describe('persistence hardening', () => {
  it('addCustomSentences returns { added, persisted } with persisted true on success', () => {
    const result = addCustomSentences(['新增的句子。'])
    expect(result.added).toHaveLength(1)
    expect(result.added[0]).toEqual(expect.objectContaining({ zh: '新增的句子。', source: 'custom', topic: 'paste' }))
    expect(result.persisted).toBe(true)
  })
  it('getCustomSentences returns [] when stored value is valid JSON but not an array', () => {
    localStorage.setItem('interpret.custom.v1', JSON.stringify({ broken: true }))
    expect(getCustomSentences()).toEqual([])
  })
  it('detectLang treats empty string as en', () => {
    expect(detectLang('')).toBe('en')
  })
})

describe('removeCustomSentences', () => {
  const seed = () => {
    addCustomSentences(['第一句。', '第二句。', '第三句。'])
    return getCustomSentences()
  }

  it('removes target and reports original index, keeping order of the rest', () => {
    const list = seed()
    const { removed, persisted } = removeCustomSentences([list[1].id])
    expect(persisted).toBe(true)
    expect(removed).toHaveLength(1)
    expect(removed[0]).toEqual({ index: 1, item: list[1] })
    expect(getCustomSentences().map(s => s.zh)).toEqual(['第一句。', '第三句。'])
  })

  it('removes multiple ids in one pass', () => {
    const list = seed()
    const { removed } = removeCustomSentences([list[0].id, list[2].id])
    expect(removed.map(r => r.index)).toEqual([0, 2])
    expect(getCustomSentences().map(s => s.zh)).toEqual(['第二句。'])
  })

  it('is a no-op for unknown ids and does not write storage', () => {
    const list = seed()
    const { removed, persisted } = removeCustomSentences(['nope'])
    expect(removed).toEqual([])
    expect(persisted).toBe(true)
    expect(getCustomSentences()).toHaveLength(list.length)
  })
})

describe('restoreCustomSentences', () => {
  it('restores at original indices so order matches pre-delete state', () => {
    addCustomSentences(['甲。', '乙。', '丙。'])
    const before = getCustomSentences()
    const { removed } = removeCustomSentences([before[0].id, before[2].id])
    restoreCustomSentences(removed)
    expect(getCustomSentences().map(s => s.zh)).toEqual(['甲。', '乙。', '丙。'])
  })

  it('skips entries whose id already exists', () => {
    addCustomSentences(['甲。'])
    const one = getCustomSentences()[0]
    restoreCustomSentences([{ index: 0, item: one }])
    expect(getCustomSentences()).toHaveLength(1)
  })

  it('clamps out-of-range index to the tail', () => {
    addCustomSentences(['甲。'])
    const one = getCustomSentences()[0]
    removeCustomSentences([one.id])
    restoreCustomSentences([{ index: 99, item: one }])
    expect(getCustomSentences().map(s => s.zh)).toEqual(['甲。'])
  })
})
