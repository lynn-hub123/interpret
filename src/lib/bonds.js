// 羁绊值 + 剧情指针。
// 羁绊是「你和这只精灵」的独立进度，按句累计；剧情指针只记主线走到哪一站。
// 防刷三条：
//   ① 首次练到某句按档位满额，重复只计 20%
//   ② 同一句当日第 3 次起不再累计
//   ③ 当日每多覆盖一种语域 +1 分，最多 +3
import { load, save } from './storage.js'
import { allScenes } from './scenes.js'

const KEY_BONDS = 'bonds.v1'
const KEY_STORY = 'story.v1'

export const BOND_BASE = { ok: 10, shaky: 6, miss: 2 }
export const REPEAT_FACTOR = 0.2
export const DAILY_LINE_LIMIT = 3
export const VARIETY_BONUS_MAX = 3

export function localDate(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function positiveInt(v) {
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
}

function normalizeBonds(v) {
  const s = v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  const out = {
    day: typeof s.day === 'string' ? s.day : '',
    registers: Array.isArray(s.registers) ? s.registers.filter(r => typeof r === 'string') : [],
    spirits: {}
  }
  const spirits = s.spirits && typeof s.spirits === 'object' && !Array.isArray(s.spirits) ? s.spirits : {}
  for (const [id, raw] of Object.entries(spirits)) {
    const e = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    const lines = {}
    const rawLines = e.lines && typeof e.lines === 'object' && !Array.isArray(e.lines) ? e.lines : {}
    for (const [lineId, rawLine] of Object.entries(rawLines)) {
      const l = rawLine && typeof rawLine === 'object' && !Array.isArray(rawLine) ? rawLine : {}
      lines[lineId] = {
        day: typeof l.day === 'string' ? l.day : '',
        count: positiveInt(l.count),
        best: positiveInt(l.best)
      }
    }
    out.spirits[id] = { bond: positiveInt(e.bond), lastAt: positiveInt(e.lastAt), lines }
  }
  return out
}

export function getBonds() {
  return normalizeBonds(load(KEY_BONDS, null))
}

export function getSpiritBond(spiritId) {
  const e = getBonds().spirits[spiritId]
  return { bond: e?.bond ?? 0, lastAt: e?.lastAt ?? 0 }
}

// 练过（best > 0）的句子 id 集合：场景进度以此为准
export function clearedLineIds(spiritId) {
  const e = getBonds().spirits[spiritId]
  if (!e) return new Set()
  return new Set(Object.entries(e.lines).filter(([, l]) => l.best > 0).map(([id]) => id))
}

export function awardBond({ spiritId, lineId, register, rating }, nowFn = Date.now) {
  const ts = nowFn()
  const day = localDate(ts)
  const state = getBonds()
  if (state.day !== day) {
    state.day = day
    state.registers = []
  }
  if (register && !state.registers.includes(register)) state.registers.push(register)

  const spirit = (state.spirits[spiritId] ??= { bond: 0, lastAt: 0, lines: {} })
  const prev = spirit.lines[lineId]
  const dayCount = prev && prev.day === day ? prev.count : 0
  const firstClear = !prev || prev.best === 0
  const base = BOND_BASE[rating] ?? 0
  const variety = Math.max(0, state.registers.length - 1)

  let gained = 0
  let reason = 'first'
  if (dayCount >= DAILY_LINE_LIMIT - 1) {
    reason = 'daily-limit'
  } else {
    gained = Math.floor(base * (firstClear ? 1 : REPEAT_FACTOR)) + Math.min(VARIETY_BONUS_MAX, variety)
    reason = firstClear ? 'first' : 'repeat'
  }

  spirit.lines[lineId] = {
    day,
    count: dayCount + 1,
    best: Math.max(prev?.best ?? 0, base)
  }
  spirit.bond += gained
  spirit.lastAt = ts

  return {
    gained,
    base,
    firstClear,
    dayCount: dayCount + 1,
    variety: Math.min(VARIETY_BONUS_MAX, variety),
    reason,
    state,
    persisted: save(KEY_BONDS, state)
  }
}

const DEFAULT_NODE = allScenes()[0]?.id ?? ''
const SCENE_IDS = new Set(allScenes().map(s => s.id))

// 抉择存档：choices 记「这一场选了哪一项」，flags 记选项落下的剧情标记
function normalizeChoices(v) {
  const s = v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  const out = {}
  for (const [sceneId, optionId] of Object.entries(s)) {
    if (typeof optionId === 'string' && optionId) out[sceneId] = optionId
  }
  return out
}

function normalizeFlags(v) {
  const s = v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  const out = {}
  for (const [name, on] of Object.entries(s)) if (on === true) out[name] = true
  return out
}

export function getStory() {
  const v = load(KEY_STORY, null)
  const s = v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  const raw = s.cleared && typeof s.cleared === 'object' && !Array.isArray(s.cleared) ? s.cleared : {}
  const cleared = {}
  for (const [id, done] of Object.entries(raw)) if (done === true) cleared[id] = true
  return {
    // 旧存档可能指向已归档的站（如 scn00）：回落到当前第一站，避免「当前」标记落空
    node: typeof s.node === 'string' && SCENE_IDS.has(s.node) ? s.node : DEFAULT_NODE,
    cleared,
    choices: normalizeChoices(s.choices),
    flags: normalizeFlags(s.flags),
    updatedAt: positiveInt(s.updatedAt)
  }
}

// 在场次选项里落一笔：选项 id 必须属于该场（防伪造/旧档脏数据）
export function recordChoice(sceneId, optionId, nowFn = Date.now) {
  const scene = allScenes().find(s => s.id === sceneId)
  const option = scene?.choice?.options?.find(o => o.id === optionId)
  if (!option) return { state: getStory(), recorded: false, persisted: true }

  const state = getStory()
  state.choices[sceneId] = option.id
  if (option.flag) state.flags[option.flag] = true
  state.updatedAt = nowFn()
  return { state, recorded: true, persisted: save(KEY_STORY, state) }
}

// 本场全部句已练过时调用：标记已完成，并把剧情指针推到下一站
export function advanceStory(sceneId, nowFn = Date.now) {
  const state = getStory()
  const scenes = allScenes()
  const idx = scenes.findIndex(s => s.id === sceneId)
  if (idx < 0) return { state, advanced: false, nextId: null, persisted: true }

  state.cleared[sceneId] = true
  state.updatedAt = nowFn()
  const next = scenes[idx + 1] || null
  const advanced = Boolean(next) && state.node === sceneId
  if (advanced) state.node = next.id
  return { state, advanced, nextId: next?.id ?? null, persisted: save(KEY_STORY, state) }
}
