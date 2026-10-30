// 场景卡加载层：把 data/scenes/*.json 转成练习层能直接消费的句对象。
// 场景卡是唯一真相源，本模块只读不写；存档逻辑见 bonds.js。
// 旧世界场景卡（scn00_room / scn01_booth）已归档：文件保留在仓库，不再加载。
// 当前世界观「汐洲」只从 scn02 开始。
import scn02 from '../data/scenes/scn02_tidehead.json'
import scn03 from '../data/scenes/scn03_wreckbeach.json'

const RAW = [scn02, scn03].sort((a, b) => a.index - b.index)
const SCENE_INDEX = new Map(RAW.map(s => [s.id, s]))
const LINE_INDEX = new Map()
for (const scene of RAW) {
  for (const line of scene.lines) LINE_INDEX.set(line.id, { scene, line })
}

// 调用方不得修改返回数组及其元素
export function allScenes() {
  return RAW
}

export function sceneById(id) {
  return SCENE_INDEX.get(id) || null
}

// 句对象：兼容 PracticeCard / records / srs 现有字段（id, zh, en, topic, source）
// speaker / intent 供练习界面渲染「谁在说、他想要什么」的角色层
// when 为 flag 名：该句只在对应剧情标记已落下时进入本场句池
function toSentence(scene, line) {
  return {
    id: line.id,
    zh: line.zh,
    en: line.en,
    topic: scene.spirit.domain,
    source: 'scene',
    sceneId: scene.id,
    dir: line.dir,
    difficulty: line.difficulty,
    tags: line.tags,
    speaker: line.speaker,
    intent: line.intent,
    when: line.when
  }
}

// flags 缺省为空：不带条件句时，行为和单场静态题池一致
export function sceneSentences(sceneId, flags = {}) {
  const scene = sceneById(sceneId)
  if (!scene) return []
  return scene.lines.filter(l => !l.when || flags[l.when] === true).map(l => toSentence(scene, l))
}

export function sceneSentenceById(lineId) {
  const hit = LINE_INDEX.get(lineId)
  return hit ? toSentence(hit.scene, hit.line) : null
}

// clearedIds：已练过的 line id 集合（由 bonds.js 提供）
// flags：剧情标记；条件句未解锁时不计入本场总数
export function sceneProgress(scene, clearedIds = new Set(), flags = {}) {
  const lines = scene ? scene.lines.filter(l => !l.when || flags[l.when] === true) : []
  const total = lines.length
  const cleared = lines.filter(l => clearedIds.has(l.id)).length
  return { cleared, total, done: total > 0 && cleared >= total }
}

// 开场白随上一幕的抉择变化：命中第一条 openings 就用它，否则用默认 premise
export function sceneOpening(scene, flags = {}) {
  if (!scene) return ''
  const hit = (scene.openings || []).find(o => flags[o.flag] === true)
  return hit ? hit.text : scene.premise
}
