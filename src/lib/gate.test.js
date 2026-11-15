import { describe, it, expect } from 'vitest'
import { judge, normalize, detectPolarity, stem } from './gate.js'

const s2Gate = {
  required: ['who', 'polarity'],
  accept: { who: ['no one', 'nobody'], polarity: 'negative' }
}

const s3Gate = {
  required: ['who', 'action', 'polarity'],
  accept: {
    who: ['you'],
    action: ['open the door', 'let you in', 'open it'],
    polarity: 'negative'
  }
}

describe('normalize', () => {
  it('展开缩写、去标点、统一大小写', () => {
    expect(normalize("I'm NOT opening the door, for you.")).toBe('i am not opening the door for you')
    expect(normalize("You've got the wrong number")).toBe('you have got the wrong number')
  })

  it('数字归一', () => {
    expect(normalize('three boxes')).toBe('3 boxes')
    expect(normalize('二十二年')).toBe('22年')
  })
})

describe('stem', () => {
  it('归并常见词形', () => {
    expect(stem('opening')).toBe('open')
    expect(stem('opened')).toBe('open')
    expect(stem('opens')).toBe('open')
    expect(stem('signed')).toBe('sign')
    expect(stem('went')).toBe('go')
  })
})

describe('detectPolarity', () => {
  it('识别否定词与否定缩写', () => {
    expect(detectPolarity("I'm not opening the door.")).toBe('negative')
    expect(detectPolarity("There's no one here.")).toBe('negative')
    expect(detectPolarity("I don't know him.")).toBe('negative')
    expect(detectPolarity('Open the door.')).toBe('positive')
  })

  it('否定只作用于所在小句', () => {
    expect(detectPolarity('He is not here, but I am.')).toBe('negative')
    expect(detectPolarity('I am here, he is not.')).toBe('negative')
  })
})

describe('judge 第二场门禁：否认这个名字', () => {
  it('参考译文通过', () => {
    const r = judge("You've got the wrong number — there's no one here by that name.", s2Gate)
    expect(r.pass).toBe(true)
    expect(r.failedSlots).toEqual([])
  })

  it('nobody 说法也算 who 命中', () => {
    expect(judge('Nobody here has that name.', s2Gate).pass).toBe(true)
  })

  it('极性反了直接判没到位', () => {
    const r = judge('Yes, this is Chen Chi speaking.', s2Gate)
    expect(r.pass).toBe(false)
    expect(r.polarityReversed).toBe(true)
    expect(r.failedSlots).toEqual(['polarity'])
  })

  it('缺 who 时只点出缺失类别', () => {
    const r = judge("You're mistaken. I am not Chen Chi.", s2Gate)
    expect(r.pass).toBe(false)
    expect(r.failedSlots).toEqual(['who'])
    expect(r.polarityReversed).toBe(false)
  })

  it('空输入按全部必需槽缺失处理', () => {
    const r = judge('   ', s2Gate)
    expect(r.pass).toBe(false)
    expect(r.failedSlots).toEqual(['who', 'polarity'])
  })
})

describe('judge 第三场门禁：拒绝开门', () => {
  it('参考译文通过', () => {
    expect(judge("I'm not opening the door for you.", s3Gate).pass).toBe(true)
  })

  it('词形变化不影响命中', () => {
    expect(judge('I am not going to open the door for you.', s3Gate).pass).toBe(true)
    expect(judge("I won't let you in.", s3Gate).pass).toBe(true)
  })

  it('缺 action 时不通过', () => {
    const r = judge("I'm not listening to you.", s3Gate)
    expect(r.pass).toBe(false)
    expect(r.failedSlots).toEqual(['action'])
  })

  it('肯定句被判为极性相反', () => {
    const r = judge('I will open the door for you.', s3Gate)
    expect(r.pass).toBe(false)
    expect(r.polarityReversed).toBe(true)
  })
})

describe('judge 降级', () => {
  it('accept 缺槽位时标记 degraded，不进入死循环', () => {
    const r = judge('I am not opening the door for you.', {
      required: ['who', 'action', 'polarity', 'time'],
      accept: { who: ['you'], action: ['open the door'], polarity: 'negative' }
    })
    expect(r.pass).toBe(true)
    expect(r.degraded).toBe(true)
  })
})
