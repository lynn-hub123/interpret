// 铃的像素形象：16×16 网格，寄居蟹背着停摆的怀表壳。
// 符号：O 轮廓 / G 金色表壳 / F 表盘 / D 指针 / C 蟹身 / E 眼睛 / . 透明
export const LING_MAP = [
  '.......GG.......',
  '.....OGGGGO.....',
  '....OGFFFFGO....',
  '...OGFFFFFFGO...',
  '..OGFFFFDFFFGO..',
  '..OGFFFFDFFFGO..',
  '..OGFFFFDDDFGO..',
  '..OGFFFFFFFFGO..',
  '...OGFFFFFFGO...',
  '....OGFFFFGO....',
  '.....OGGGGO.....',
  '....OCCCCCCO....',
  '.CC.OCEECEEO.CC.',
  '.CCCOCDCCDCOCCC.',
  '....OCCCCCCO....',
  '....C.C..C.C....'
]

export const LING_PALETTE = {
  O: '#3b2d52',
  G: '#d9a13b',
  F: '#f3e7c8',
  D: '#4a3a2a',
  C: '#c1684a',
  E: '#fbf6e6'
}

export const LING_SIZE = 16

function toPixels(rows) {
  const out = []
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch !== '.' && LING_PALETTE[ch]) out.push({ x, y, c: ch })
    })
  })
  return out
}

export const LING_PIXELS = toPixels(LING_MAP)
