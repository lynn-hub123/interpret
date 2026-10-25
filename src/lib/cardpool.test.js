import { describe, it, expect } from 'vitest'
import { TIER_WEIGHTS, PITY_NEW_EVERY, drawCard, allCollected } from './cardpool.js'

const CARDS = [
  { id: 'n1', tier: 'normal' },
  { id: 'n2', tier: 'normal' },
  { id: 'n3', tier: 'normal' },
  { id: 'n4', tier: 'normal' },
  { id: 'r1', tier: 'rare' },
  { id: 'r2', tier: 'rare' },
  { id: 'r3', tier: 'rare' },
  { id: 's1', tier: 'super' }
]

// 依序返回给定值的 rng，用完后重复最后一个值
function seqRng(values) {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}

describe('常量', () => {
  it('权重 70/26/4，保底阈值 5', () => {
    expect(TIER_WEIGHTS).toEqual({ normal: 70, rare: 26, super: 4 })
    expect(PITY_NEW_EVERY).toBe(5)
  })
})

describe('稀有度权重', () => {
  it('0..0.70 普通，0.70..0.96 稀有，0.96..1 超稀有', () => {
    expect(drawCard({ cards: CARDS, rng: seqRng([0, 0]) }).tier).toBe('normal')
    expect(drawCard({ cards: CARDS, rng: seqRng([0.6999, 0]) }).tier).toBe('normal')
    expect(drawCard({ cards: CARDS, rng: seqRng([0.7, 0]) }).tier).toBe('rare')
    expect(drawCard({ cards: CARDS, rng: seqRng([0.9599, 0]) }).tier).toBe('rare')
    expect(drawCard({ cards: CARDS, rng: seqRng([0.96, 0]) }).tier).toBe('super')
  })
})

describe('档位内选取', () => {
  it('优先抽未拥有；全拥有时返回重复', () => {
    const fresh = drawCard({ cards: CARDS, owned: ['n1', 'n2', 'n3'], rng: seqRng([0, 0]) })
    expect(fresh).toEqual({ cardId: 'n4', tier: 'normal', isNew: true })

    const repeat = drawCard({ cards: CARDS, owned: ['n1', 'n2', 'n3', 'n4'], rng: seqRng([0, 0]) })
    expect(repeat.isNew).toBe(false)
    expect(repeat.tier).toBe('normal')
    expect(['n1', 'n2', 'n3', 'n4']).toContain(repeat.cardId)
  })
})

describe('保底出新', () => {
  it('sinceNew >= 5 时只在还有未拥有的档位里抽', () => {
    // 普通与稀有全拥有，只剩超稀有未拥有：rng 落在普通区间也必须给超稀有
    const owned = ['n1', 'n2', 'n3', 'n4', 'r1', 'r2', 'r3']
    const r = drawCard({ cards: CARDS, owned, sinceNew: 5, rng: seqRng([0.1, 0]) })
    expect(r).toEqual({ cardId: 's1', tier: 'super', isNew: true })
  })

  it('sinceNew = 4 时仍可能重复', () => {
    const owned = ['n1', 'n2', 'n3', 'n4', 'r1', 'r2', 'r3']
    const r = drawCard({ cards: CARDS, owned, sinceNew: 4, rng: seqRng([0, 0]) })
    expect(r.isNew).toBe(false)
  })

  it('全部拥有时不返回新卡且不崩', () => {
    const owned = CARDS.map(c => c.id)
    const r = drawCard({ cards: CARDS, owned, sinceNew: 9, rng: seqRng([0.5, 0.5]) })
    expect(r.isNew).toBe(false)
    expect(owned).toContain(r.cardId)
  })

  it('空卡池返回 null', () => {
    expect(drawCard({ cards: [], rng: Math.random })).toBeNull()
  })
})

describe('allCollected', () => {
  it('普通形态与隐藏形态都拿到才算完成', () => {
    const half = Object.fromEntries(CARDS.map(c => [c.id, { unlocked: true, hidden: false }]))
    expect(allCollected(CARDS, half)).toBe(false)
    const full = Object.fromEntries(CARDS.map(c => [c.id, { unlocked: true, hidden: true }]))
    expect(allCollected(CARDS, full)).toBe(true)
  })
  it('空状态为 false', () => {
    expect(allCollected(CARDS, {})).toBe(false)
  })
})
