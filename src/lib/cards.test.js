import { describe, it, expect, beforeEach } from 'vitest'
import {
  EMPTY_CARD_STATE, allCards, cardById, getCards, getCardState,
  onDrawn, recordAttempt, hiddenChallengeOf, unlockSentence
} from './cards.js'

const NOW = 1792812000000

beforeEach(() => localStorage.clear())

describe('静态卡库', () => {
  it('8 张卡，稀有度分布 4/3/1', () => {
    const cards = allCards()
    expect(cards).toHaveLength(8)
    expect(cards.filter(c => c.tier === 'normal')).toHaveLength(4)
    expect(cards.filter(c => c.tier === 'rare')).toHaveLength(3)
    expect(cards.filter(c => c.tier === 'super')).toHaveLength(1)
  })
  it('cardById 命中与未命中', () => {
    expect(cardById('zhouye').name).toBe('周野')
    expect(cardById('nope')).toBeNull()
  })
  it('unlockSentence 生成 card_<id>_unlock 句', () => {
    expect(unlockSentence({ id: 'zhouye', unlock: { zh: '中', en: 'en' } })).toEqual({
      id: 'card_zhouye_unlock', zh: '中', en: 'en', topic: 'card', source: 'card'
    })
  })
})

describe('onDrawn', () => {
  it('新卡建默认条目', () => {
    onDrawn('zhouye')
    expect(getCardState('zhouye')).toEqual(EMPTY_CARD_STATE)
  })
  it('已拥有的卡重置本轮 attempts，保留进度与解锁', () => {
    recordAttempt({ cardId: 'zhouye', bucket: 100 }, () => NOW)
    onDrawn('zhouye')
    expect(getCardState('zhouye')).toMatchObject({
      attempts: 0, progress: 100, unlocked: true, hidden: true
    })
  })
})

describe('recordAttempt', () => {
  it('首轮（抽到后第一发）拿到 100% 即获得隐藏形态', () => {
    onDrawn('zhouye')
    const r = recordAttempt({ cardId: 'zhouye', bucket: 100 }, () => NOW)
    expect(r.entry).toEqual({
      attempts: 1, progress: 100, unlocked: true, hidden: true, lastAt: NOW
    })
    expect(r.hiddenNow).toBe(true)
  })
  it('非首轮 100% 不给隐藏形态（先有一次非 100% 尝试）', () => {
    onDrawn('zhouye')
    recordAttempt({ cardId: 'zhouye', bucket: 50 }, () => NOW)
    const r = recordAttempt({ cardId: 'zhouye', bucket: 100 }, () => NOW)
    expect(r.entry.unlocked).toBe(true)
    expect(r.entry.hidden).toBe(false)
    expect(r.hiddenNow).toBe(false)
  })
  it('progress 取历史最高，不下降', () => {
    onDrawn('zhouye')
    recordAttempt({ cardId: 'zhouye', bucket: 75 }, () => NOW)
    const r = recordAttempt({ cardId: 'zhouye', bucket: 25 }, () => NOW)
    expect(r.entry.progress).toBe(75)
  })
  it('已获得隐藏形态后不重复播报 hiddenNow', () => {
    onDrawn('zhouye')
    recordAttempt({ cardId: 'zhouye', bucket: 100 }, () => NOW)
    onDrawn('zhouye')
    const r = recordAttempt({ cardId: 'zhouye', bucket: 100 }, () => NOW)
    expect(r.entry.hidden).toBe(true)
    expect(r.hiddenNow).toBe(false)
  })
})

describe('hiddenChallengeOf', () => {
  it('已解锁、本轮未评分、还没隐藏形态 → 隐藏挑战', () => {
    localStorage.setItem('interpret.cards.v1', JSON.stringify({
      zhouye: { attempts: 0, progress: 75, unlocked: true, hidden: false, lastAt: 0 }
    }))
    expect(hiddenChallengeOf(getCardState('zhouye'))).toBe(true)
  })
  it('已获得隐藏形态或本轮已评分 → 不是隐藏挑战', () => {
    expect(hiddenChallengeOf({ attempts: 0, progress: 100, unlocked: true, hidden: true })).toBe(false)
    expect(hiddenChallengeOf({ attempts: 1, progress: 100, unlocked: true, hidden: false })).toBe(false)
  })
})
