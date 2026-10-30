// 铃的台词目录：寄居蟹·停摆怀表壳。
// 所有台词按场合分桶，pick(bucket, stir) 用 stir 取模选一条，避免每次都同一句。
// 桶里只要有一句即可上线，后续可以悄悄加，不会破坏 pick 契约。

const BUCKETS = {
  empty: [
    '壳里还剩点旧齿轮，转不动了。要不你给我找点活干？',
    '池子里没句了。去题库翻一翻，或者粘一段进来也行。',
    '沉城那边风挺大的。你确定要在这儿发呆？'
  ],
  'afterRate.ok': [
    '怀表走起来了一下。不错。',
    '嗯，这句我记住了。',
    '潮水退了又涨，你翻得比我快。',
    '壳里叮了一声——那是好兆头。'
  ],
  'afterRate.shaky': [
    '别慌，我壳里也卡过齿轮。再来一遍。',
    '磕一下没事，沉城每天都会漏一点。',
    '这次没倒顺，下次就稳了。'
  ],
  'afterRate.miss': [
    '我也有整句整句不会的，师父说那是"还没到那一夜"。',
    '这句先挂着。你背着它走两步，它自己就会浮上来。',
    '沉城里没有白走的路。'
  ],
  sceneDone: [
    '这场练完了。壳里叮——你听，是该换个地方了。',
    '这一幕的风停了。下一幕的浪还在等你。',
    '师父说练完一场就停一下。我帮你记住了。'
  ]
}

const VALID_BUCKETS = Object.keys(BUCKETS)

export function validBucket(name) {
  return VALID_BUCKETS.includes(name)
}

export function pick(bucket, stir = 0) {
  const list = BUCKETS[bucket]
  if (!list || list.length === 0) return null
  const idx = ((stir % list.length) + list.length) % list.length
  return list[idx]
}

export function listAll(bucket) {
  const list = BUCKETS[bucket]
  return list ? [...list] : []
}
