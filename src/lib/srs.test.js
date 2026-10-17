import { describe, it, expect, beforeEach } from 'vitest'
import { INTERVALS, DAILY_CAP, getSrs, nextBox, isDue, quotaAvailable, dueQueue, onRated, localDate } from './srs.js'

const DAY = 86400000
// 固定「现在」：2026-10-17 12:00 本地时间
const NOW = new Date(2026, 9, 17, 12, 0, 0).getTime()

beforeEach(() => {
  localStorage.clear()
})

describe('常量', () => {
  it('阶梯 6 档与每日上限', () => {
    expect(INTERVALS).toEqual([1, 3, 7, 14, 30, 60])
    expect(DAILY_CAP).toBe(10)
  })
})

describe('nextBox 档位迁移', () => {
  it('ok 升一档，第 6 档封顶，未练句进第 1 档', () => {
    expect(nextBox(0, 'ok')).toBe(1)
    expect(nextBox(1, 'ok')).toBe(2)
    expect(nextBox(5, 'ok')).toBe(6)
    expect(nextBox(6, 'ok')).toBe(6)
  })
  it('shaky 降一档，第 1 档不再降', () => {
    expect(nextBox(3, 'shaky')).toBe(2)
    expect(nextBox(1, 'shaky')).toBe(1)
  })
  it('miss 回第 1 档', () => {
    expect(nextBox(6, 'miss')).toBe(1)
    expect(nextBox(1, 'miss')).toBe(1)
  })
})

describe('onRated 落库', () => {
  it('新句 ok 进第 1 档并记录时间，不消耗配额', () => {
    onRated({ sentenceId: 's1', rating: 'ok' }, () => NOW)
    const s = getSrs()
    expect(s.boxes.s1).toEqual({ box: 1, lastTs: NOW })
    expect(s.quota.used).toBe(0)
  })
  it('到期句评分消耗当日配额', () => {
    onRated({ sentenceId: 's1', rating: 'miss' }, () => NOW)
    onRated({ sentenceId: 's1', rating: 'ok', wasDue: true }, () => NOW)
    const s = getSrs()
    expect(s.boxes.s1.box).toBe(2) // miss 进第 1 档，wasDue ok 升第 2 档（同文件已断言 nextBox(1,'ok')=2）
    expect(s.quota).toEqual({ date: localDate(NOW), used: 1 })
  })
  it('配额跨日自动重置', () => {
    onRated({ sentenceId: 's1', rating: 'ok', wasDue: true }, () => NOW)
    const nextDay = NOW + DAY
    onRated({ sentenceId: 's2', rating: 'ok', wasDue: true }, () => nextDay)
    expect(getSrs().quota).toEqual({ date: localDate(nextDay), used: 1 })
  })
  it('返回 true 表示落库成功', () => {
    expect(onRated({ sentenceId: 's1', rating: 'ok' }, () => NOW)).toBe(true)
  })
})

describe('isDue 到期判定', () => {
  it('未练句永不到期', () => {
    expect(isDue('nobody', () => NOW)).toBe(false)
  })
  it('间隔未到不算到期，到达间隔算到期', () => {
    onRated({ sentenceId: 's1', rating: 'ok' }, () => NOW) // 第 1 档，间隔 1 天
    expect(isDue('s1', () => NOW + DAY - 1)).toBe(false)
    expect(isDue('s1', () => NOW + DAY)).toBe(true)
  })
})

describe('dueQueue 出队排序', () => {
  it('只含到期句，最久没练优先', () => {
    onRated({ sentenceId: 's1', rating: 'ok' }, () => NOW - 3 * DAY) // 3 天前练，间隔 1 天 → 到期
    onRated({ sentenceId: 's2', rating: 'ok' }, () => NOW - 2 * DAY) // 2 天前练 → 到期
    onRated({ sentenceId: 's3', rating: 'ok' }, () => NOW) // 刚练 → 未到期
    const pool = [{ id: 's1' }, { id: 's2' }, { id: 's3' }]
    expect(dueQueue(pool, () => NOW)).toEqual(['s1', 's2'])
  })
  it('空状态或无到期句返回空队列', () => {
    expect(dueQueue([{ id: 'x' }], () => NOW)).toEqual([])
  })
})

describe('quotaAvailable 每日封顶', () => {
  it('未用满时可用', () => {
    expect(quotaAvailable(() => NOW)).toBe(true)
  })
  it('当日用满 DAILY_CAP 后不可用，次日恢复', () => {
    for (let i = 0; i < DAILY_CAP; i++) {
      onRated({ sentenceId: `s${i}`, rating: 'ok', wasDue: true }, () => NOW)
    }
    expect(quotaAvailable(() => NOW)).toBe(false)
    expect(quotaAvailable(() => NOW + DAY)).toBe(true)
  })
})
