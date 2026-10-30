import { describe, it, expect } from 'vitest'
import { pick, listAll, validBucket } from './lingQuips.js'

describe('lingQuips', () => {
  it('每个桶至少有一条台词', () => {
    for (const name of ['empty', 'afterRate.ok', 'afterRate.shaky', 'afterRate.miss', 'sceneDone']) {
      expect(listAll(name).length).toBeGreaterThanOrEqual(1)
    }
  })

  it('validBucket 只承认已注册的桶', () => {
    expect(validBucket('empty')).toBe(true)
    expect(validBucket('afterRate.ok')).toBe(true)
    expect(validBucket('nope')).toBe(false)
  })

  it('pick 用 stir 取模轮换，同一桶内不会每次都同一句', () => {
    const empty0 = pick('empty', 0)
    const empty1 = pick('empty', 1)
    const empty3 = pick('empty', 3)
    expect(empty0).not.toBeNull()
    expect(empty3).toBe(empty0) // 3 行 3 取模回到 0
    // 至少 stir=0 和 stir=1 能取到不同的那一条（桶 >= 2）
    if (listAll('empty').length >= 2) expect(empty1).not.toBe(empty0)
  })

  it('未知桶返回 null，不抛异常', () => {
    expect(pick('nope', 0)).toBeNull()
    expect(listAll('nope')).toEqual([])
  })

  it('stir 为负数时也能稳定取到（内部取模纠正）', () => {
    expect(pick('afterRate.miss', -1)).toBe(pick('afterRate.miss', listAll('afterRate.miss').length - 1))
  })
})
