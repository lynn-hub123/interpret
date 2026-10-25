import { describe, it, expect, beforeEach } from 'vitest'
import {
  FIRST_TICKET_AT, TICKET_EVERY, normalizeProgress, getProgress,
  nextProgress, addPractice, spendTicket, applyDraw, remainingForTicket, thresholdFor
} from './progress.js'

beforeEach(() => localStorage.clear())

describe('常量与容错', () => {
  it('首张券 5 句，之后每 15 句', () => {
    expect(FIRST_TICKET_AT).toBe(5)
    expect(TICKET_EVERY).toBe(15)
  })

  it('脏数据归一为默认值', () => {
    expect(normalizeProgress({ tickets: 'x', practiced: -2 })).toEqual({
      practiced: 0, total: 0, tickets: 0, earned: 0, sinceNew: 0, draws: 0
    })
    expect(getProgress()).toEqual({ practiced: 0, total: 0, tickets: 0, earned: 0, sinceNew: 0, draws: 0 })
  })

  it('thresholdFor：首张券 5，之后 15', () => {
    expect(thresholdFor({ earned: 0 })).toBe(5)
    expect(thresholdFor({ earned: 3 })).toBe(15)
  })
})

describe('nextProgress 计数与发券', () => {
  it('第 5 句发第一张券并清零进度', () => {
    let s = normalizeProgress(null)
    for (let i = 0; i < 4; i++) {
      const r = nextProgress(s)
      s = r.state
      expect(r.gained).toBe(0)
    }
    expect(s.practiced).toBe(4)
    const r = nextProgress(s)
    expect(r.gained).toBe(1)
    expect(r.state.tickets).toBe(1)
    expect(r.state.earned).toBe(1)
    expect(r.state.practiced).toBe(0)
  })

  it('第二张券要再练 15 句', () => {
    let s = { practiced: 0, total: 5, tickets: 1, earned: 1, sinceNew: 0, draws: 0 }
    for (let i = 0; i < 14; i++) s = nextProgress(s).state
    expect(s.tickets).toBe(1)
    expect(s.practiced).toBe(14)
    s = nextProgress(s).state
    expect(s.tickets).toBe(2)
    expect(s.practiced).toBe(0)
  })

  it('每次练习 total 都 +1，与是否发券无关', () => {
    const r = nextProgress({ practiced: 0, total: 9, tickets: 0, earned: 0, sinceNew: 0, draws: 0 })
    expect(r.state.total).toBe(10)
  })
})

describe('存储读写', () => {
  it('addPractice 落库并返回新状态', () => {
    const r = addPractice()
    expect(r.persisted).toBe(true)
    expect(r.gained).toBe(0)
    expect(getProgress().total).toBe(1)
    expect(getProgress().practiced).toBe(1)
  })

  it('spendTicket 无券返回 null，有券扣 1', () => {
    expect(spendTicket()).toBeNull()
    localStorage.setItem('interpret.progress.v1', JSON.stringify({ tickets: 1 }))
    const r = spendTicket()
    expect(r.state.tickets).toBe(0)
    expect(getProgress().tickets).toBe(0)
  })

  it('applyDraw：新卡清零 sinceNew，重复 +1', () => {
    localStorage.setItem('interpret.progress.v1', JSON.stringify({ sinceNew: 2, draws: 4 }))
    expect(applyDraw(false).state).toMatchObject({ sinceNew: 3, draws: 5 })
    expect(applyDraw(true).state).toMatchObject({ sinceNew: 0, draws: 6 })
  })
})

describe('remainingForTicket', () => {
  it('按当前门槛返回还差几句', () => {
    expect(remainingForTicket({ earned: 0, practiced: 2 })).toBe(3)
    expect(remainingForTicket({ earned: 1, practiced: 10 })).toBe(5)
    expect(remainingForTicket({ earned: 1, practiced: 15 })).toBe(0)
  })
})
