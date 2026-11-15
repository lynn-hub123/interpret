import { describe, it, expect } from 'vitest'
import { comprehends, contentWords } from './comprehend.js'

const en = "I'm taking a box up to 1704."

describe('contentWords', () => {
  it('只留实词', () => {
    expect(contentWords(en)).toEqual(['taking', 'box', '1704'])
  })
})

describe('comprehends', () => {
  it('同义改写算听懂', () => {
    expect(comprehends('I am carrying a box to 1704.', en)).toBe(true)
  })

  it('原句算听懂', () => {
    expect(comprehends(en, en)).toBe(true)
  })

  it('只说了无关内容算没听懂', () => {
    expect(comprehends('I have no idea.', en)).toBe(false)
  })

  it('语法错但意思在，仍算听懂', () => {
    expect(comprehends('me taking box 1704', en)).toBe(true)
  })

  it('空输入算没听懂', () => {
    expect(comprehends('   ', en)).toBe(false)
  })

  it('参考译文没有实词时不拦人', () => {
    expect(comprehends('anything', 'Is it?')).toBe(true)
  })
})
