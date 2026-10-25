// 抽卡纯函数层：稀有度权重、档位内优先未拥有、连续重复保底出新。
// rng 由调用方注入，测试可完全固定；本模块不读写存储。
export const TIER_WEIGHTS = { normal: 70, rare: 26, super: 4 }
export const PITY_NEW_EVERY = 5
export const TIERS = ['normal', 'rare', 'super']

function pickTier(tiers, rng) {
  const total = tiers.reduce((sum, t) => sum + TIER_WEIGHTS[t], 0)
  let r = rng() * total
  for (const t of tiers) {
    r -= TIER_WEIGHTS[t]
    if (r < 0) return t
  }
  return tiers[tiers.length - 1]
}

export function drawCard({ cards, owned = [], sinceNew = 0, rng = Math.random }) {
  if (!Array.isArray(cards) || cards.length === 0) return null
  const ownedSet = new Set(owned)
  const groups = TIERS.map(tier => ({ tier, cards: cards.filter(c => c.tier === tier) })).filter(g => g.cards.length)
  const forceNew = sinceNew >= PITY_NEW_EVERY
  const eligible = forceNew ? groups.filter(g => g.cards.some(c => !ownedSet.has(c.id))) : groups
  const tiers = (eligible.length ? eligible : groups).map(g => g.tier)
  const tier = pickTier(tiers, rng)
  const group = cards.filter(c => c.tier === tier)
  const fresh = group.filter(c => !ownedSet.has(c.id))
  const pool = fresh.length ? fresh : group
  const card = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]
  return { cardId: card.id, tier, isNew: !ownedSet.has(card.id) }
}

// 收集终点：8 张普通形态 + 8 个隐藏形态全部拿到
export function allCollected(cards, state = {}) {
  const s = state && typeof state === 'object' ? state : {}
  return Array.isArray(cards) && cards.length > 0 && cards.every(c => s[c.id]?.unlocked === true && s[c.id]?.hidden === true)
}
