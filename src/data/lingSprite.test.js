import { describe, it, expect } from 'vitest'
import { LING_MAP, LING_PALETTE, LING_PIXELS, LING_SIZE } from './lingSprite.js'

describe('铃的像素图', () => {
  it('是 16×16 的方形网格，且只用已定义的符号', () => {
    expect(LING_MAP).toHaveLength(LING_SIZE)
    for (const row of LING_MAP) {
      expect(row).toHaveLength(LING_SIZE)
      for (const ch of row) expect(ch === '.' || LING_PALETTE[ch], ch).toBeTruthy()
    }
  })

  it('拆成像素后数量正确，且不越界', () => {
    const dots = LING_MAP.join('').split('').filter(c => c === '.').length
    expect(LING_PIXELS).toHaveLength(LING_SIZE * LING_SIZE - dots)
    for (const p of LING_PIXELS) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThan(LING_SIZE)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThan(LING_SIZE)
    }
  })

  it('表盘、指针、蟹身、眼睛、钳子与腿都在图里', () => {
    const at = (x, y) => LING_PIXELS.find(p => p.x === x && p.y === y)?.c
    expect(at(8, 4)).toBe('D') // 长针
    expect(at(8, 7)).toBe('F') // 表盘
    expect(at(6, 12)).toBe('E') // 左眼
    expect(at(9, 12)).toBe('E') // 右眼
    expect(at(6, 13)).toBe('D') // 左眼瞳孔
    expect(at(5, 11)).toBe('C') // 蟹身
    expect(at(1, 12)).toBe('C') // 左钳
    expect(at(14, 12)).toBe('C') // 右钳
    expect(at(3, 13)).toBe('C') // 左钳连到蟹身的臂
    expect(at(4, 15)).toBe('C') // 左腿
  })
})
