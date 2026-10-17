import { describe, it, expect } from 'vitest'
import {
  isZh, isEn, splitZh, splitEn, isValidPair, dedupePairs, hashId,
  alignPairs, buildTopicSentences, assertTopicValid, MIN_SENTENCES, MAX_SENTENCES
} from './corpus-lib.mjs'

describe('language detection', () => {
  it('isZh: Chinese text passes, English fails, empty fails', () => {
    expect(isZh('今天天气不错，我们去公园走走吧。')).toBe(true)
    expect(isZh('2023年国务院发布了新的政策文件')).toBe(true)
    expect(isZh('Hello world, this is English.')).toBe(false)
    expect(isZh('')).toBe(false)
    expect(isZh('12345')).toBe(false)
  })
  it('isEn: English passes, Chinese fails, mixed fails', () => {
    expect(isEn('The weather is nice today.')).toBe(true)
    expect(isEn('The U.S. economy grew by 3.2 percent in 2024.')).toBe(true)
    expect(isEn('这是中文句子。')).toBe(false)
    expect(isEn('中国政府发布了 white paper')).toBe(false)
    expect(isEn('')).toBe(false)
  })
})

describe('sentence splitting', () => {
  it('splitZh splits on Chinese terminal punctuation', () => {
    expect(splitZh('第一句。第二句！第三句')).toEqual(['第一句。', '第二句！', '第三句'])
  })
  it('splitEn splits on terminal punctuation before capital letter', () => {
    expect(splitEn('He went home. She stayed.')).toEqual(['He went home.', 'She stayed.'])
    expect(splitEn('It costs $3.50. Buy it.')).toEqual(['It costs $3.50.', 'Buy it.'])
  })
  it('splitEn keeps abbreviations attached (Mr., U.S.)', () => {
    expect(splitEn('Mr. Smith lives in the U.S. He is nice.'))
      .toEqual(['Mr. Smith lives in the U.S. He is nice.'])
  })
})

describe('pair filtering (宁缺毋滥)', () => {
  const GOOD = {
    zh: '今天天气不错，我们去公园走走吧。',
    en: "The weather is nice today. Let's take a walk in the park."
  }
  it('accepts a clean pair', () => {
    expect(isValidPair(GOOD)).toBe(true)
  })
  it('rejects zh longer than 60 chars', () => {
    expect(isValidPair({ ...GOOD, zh: '长'.repeat(61) })).toBe(false)
  })
  it('rejects zh shorter than 5 chars', () => {
    expect(isValidPair({ ...GOOD, zh: '你好。' })).toBe(false)
  })
  it('rejects en longer than 50 words', () => {
    expect(isValidPair({ ...GOOD, en: 'word '.repeat(51).trim() })).toBe(false)
  })
  it('rejects en longer than 200 chars', () => {
    expect(isValidPair({ ...GOOD, en: 'Supercalifragilisticexpialidocious '.repeat(6).trim() })).toBe(false)
  })
  it('rejects en shorter than 5 chars', () => {
    expect(isValidPair({ ...GOOD, en: 'Hi!' })).toBe(false)
  })
  it('rejects pure numbers or symbols', () => {
    expect(isValidPair({ zh: '12345', en: '12345' })).toBe(false)
    expect(isValidPair({ zh: '！！！？？？', en: '!??!' })).toBe(false)
  })
  it('rejects URLs and emails', () => {
    expect(isValidPair({ ...GOOD, zh: '详情见 https://example.com 新闻。' })).toBe(false)
    expect(isValidPair({ ...GOOD, en: 'Send mail to a@example.com now.' })).toBe(false)
  })
  it('rejects when zh field is not Chinese', () => {
    expect(isValidPair({ ...GOOD, zh: 'This is English text.' })).toBe(false)
  })
  it('rejects when en field is not English', () => {
    expect(isValidPair({ ...GOOD, en: '这是中文翻译。' })).toBe(false)
  })
  it('rejects missing or non-string fields', () => {
    expect(isValidPair(null)).toBe(false)
    expect(isValidPair({})).toBe(false)
    expect(isValidPair({ zh: 123, en: 'hello world' })).toBe(false)
  })
})

describe('dedupe and hash id', () => {
  it('dedupePairs keeps first occurrence by normalized zh', () => {
    const out = dedupePairs([
      { zh: '同一句话。', en: 'Same sentence one.' },
      { zh: '同一  句话。', en: 'Same sentence two.' },
      { zh: '另一句话。', en: 'Another sentence.' }
    ])
    expect(out).toHaveLength(2)
    expect(out[0].en).toBe('Same sentence one.')
  })
  it('hashId is sha256 first 8 hex chars with prefix, stable across calls', () => {
    const a = hashId('news_', '今天天气不错')
    const b = hashId('news_', '今天天气不错')
    expect(a).toBe(b)
    expect(a).toMatch(/^news_[0-9a-f]{8}$/)
    expect(hashId('govreport_', '今天天气不错')).toMatch(/^govreport_[0-9a-f]{8}$/)
    expect(hashId('news_', '另一句话')).not.toBe(a)
  })
})

describe('alignment and assembly', () => {
  it('alignPairs zips by index, takes the shorter side', () => {
    expect(alignPairs(['中一', '中二'], ['en one', 'en two', 'en three'])).toEqual([
      { zh: '中一', en: 'en one' },
      { zh: '中二', en: 'en two' }
    ])
    expect(alignPairs([], ['en one'])).toEqual([])
  })
  it('buildTopicSentences filters, dedupes, hashes ids, caps at MAX', () => {
    const pairs = [
      { zh: '今天天气不错，我们去公园走走吧。', en: 'The weather is nice today.' },
      { zh: '今天天气不错，我们去公园走走吧。', en: 'Duplicate zh, dropped.' },
      { zh: '12345', en: 'not a real sentence' },
      { zh: '医生建议少熬夜，每天保证七个小时的睡眠。', en: 'The doctor advised me to stop staying up late.' }
    ]
    const out = buildTopicSentences(pairs, 'news_')
    expect(out).toHaveLength(2)
    expect(out[0].id).toMatch(/^news_[0-9a-f]{8}$/)
    expect(out[0].zh).toContain('天气')
    expect(new Set(out.map(s => s.id)).size).toBe(2)
  })
  it('buildTopicSentences caps output at 80', () => {
    const pairs = Array.from({ length: 90 }, (_, i) => ({
      zh: `这是用于测试的第${i}号句子，内容各不相同。`,
      en: `This is test sentence number ${i} for capping.`
    }))
    expect(buildTopicSentences(pairs, 'news_')).toHaveLength(MAX_SENTENCES)
  })
  it('assertTopicValid passes at threshold and throws below', () => {
    const mk = n => Array.from({ length: n }, (_, i) => ({
      id: `news_t${i}`, zh: `中文句子第${i}号`, en: `English sentence ${i}`
    }))
    expect(assertTopicValid(mk(MIN_SENTENCES), 'news')).toBe(true)
    expect(() => assertTopicValid(mk(MIN_SENTENCES - 1), 'news')).toThrow(/句数不足/)
  })
  it('assertTopicValid rejects empty fields, bad prefix, duplicate ids', () => {
    expect(() => assertTopicValid([{ id: 'news_a', zh: '', en: 'hello there' }], 'news')).toThrow(/空句子/)
    expect(() => assertTopicValid([{ id: 'daily_a', zh: '中文五个字', en: 'hello there' }], 'news')).toThrow(/前缀/)
    const dup = [{ id: 'news_a', zh: '中文五个字', en: 'hello there' }, { id: 'news_a', zh: '中文五个字', en: 'hello there' }]
    expect(() => assertTopicValid(dup, 'news')).toThrow(/重复/)
  })
  it('exports thresholds 40/80', () => {
    expect(MIN_SENTENCES).toBe(40)
    expect(MAX_SENTENCES).toBe(80)
  })
})
