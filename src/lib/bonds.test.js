import { describe, it, expect, beforeEach } from 'vitest'
import { BOND_BASE, awardBond, getBonds, getSpiritBond, clearedLineIds, advanceStory, getStory, recordChoice } from './bonds.js'
import { allScenes } from './scenes.js'

const DAY1 = new Date(2026, 9, 28, 10, 0, 0).getTime()
const DAY2 = DAY1 + 86400000
const at = ts => () => ts

beforeEach(() => localStorage.clear())

describe('羁绊累计', () => {
  it('首次练到一句按档位满额', () => {
    const r = awardBond({ spiritId: 'ya', lineId: 'scn00_01', register: '日常口语', rating: 'ok' }, at(DAY1))
    expect(r.gained).toBe(BOND_BASE.ok)
    expect(r.reason).toBe('first')
    expect(r.firstClear).toBe(true)
    expect(getSpiritBond('ya').bond).toBe(BOND_BASE.ok)
  })

  it('同日重复只计 20%', () => {
    awardBond({ spiritId: 'ya', lineId: 'scn00_01', register: '日常口语', rating: 'ok' }, at(DAY1))
    const r = awardBond({ spiritId: 'ya', lineId: 'scn00_01', register: '日常口语', rating: 'ok' }, at(DAY1))
    expect(r.reason).toBe('repeat')
    expect(r.gained).toBe(Math.floor(BOND_BASE.ok * 0.2))
    expect(getSpiritBond('ya').bond).toBe(BOND_BASE.ok + r.gained)
  })

  it('同一句当日第 3 次起归零', () => {
    awardBond({ spiritId: 'ya', lineId: 'scn00_01', register: '日常口语', rating: 'ok' }, at(DAY1))
    awardBond({ spiritId: 'ya', lineId: 'scn00_01', register: '日常口语', rating: 'ok' }, at(DAY1))
    const before = getSpiritBond('ya').bond
    const r = awardBond({ spiritId: 'ya', lineId: 'scn00_01', register: '日常口语', rating: 'ok' }, at(DAY1))
    expect(r.reason).toBe('daily-limit')
    expect(r.gained).toBe(0)
    expect(getSpiritBond('ya').bond).toBe(before)
  })

  it('换日后当日次数重置，但重复系数仍是 20%', () => {
    awardBond({ spiritId: 'ya', lineId: 'scn00_01', register: '日常口语', rating: 'ok' }, at(DAY1))
    const r = awardBond({ spiritId: 'ya', lineId: 'scn00_01', register: '日常口语', rating: 'ok' }, at(DAY2))
    expect(r.dayCount).toBe(1)
    expect(r.reason).toBe('repeat')
    expect(r.gained).toBe(Math.floor(BOND_BASE.ok * 0.2))
  })

  it('当日覆盖的语域每多一种加 1 分，最多 +3', () => {
    const scenes = allScenes()
    const a = awardBond({ spiritId: scenes[0].spirit.id, lineId: scenes[0].lines[0].id, register: scenes[0].register, rating: 'ok' }, at(DAY1))
    expect(a.variety).toBe(0)
    expect(a.gained).toBe(BOND_BASE.ok)

    // 归档后只剩一场，用另一个语域直接验证「多一种语域 +1」
    const b = awardBond({ spiritId: scenes[0].spirit.id, lineId: scenes[0].lines[1].id, register: '会议口译', rating: 'ok' }, at(DAY1))
    expect(b.variety).toBe(1)
    expect(b.gained).toBe(BOND_BASE.ok + 1)
  })

  it('练 miss 也算练过，但只得最低档', () => {
    const r = awardBond({ spiritId: 'ya', lineId: 'scn00_02', register: '日常口语', rating: 'miss' }, at(DAY1))
    expect(r.gained).toBe(BOND_BASE.miss)
    expect(clearedLineIds('ya').has('scn00_02')).toBe(true)
  })

  it('未练过的精灵与坏存档都降级为空', () => {
    expect(getSpiritBond('nope')).toEqual({ bond: 0, lastAt: 0 })
    expect(clearedLineIds('nope').size).toBe(0)
    localStorage.setItem('interpret.bonds.v1', JSON.stringify({ spirits: 'bad', registers: 42 }))
    expect(getBonds().spirits).toEqual({})
    expect(getBonds().registers).toEqual([])
  })
})

describe('剧情指针', () => {
  it('默认停在第一站', () => {
    expect(getStory().node).toBe(allScenes()[0].id)
    expect(getStory().cleared).toEqual({})
    expect(getStory().choices).toEqual({})
    expect(getStory().flags).toEqual({})
  })

  it('本场完成时标记完成并把指针推到下一站', () => {
    const scenes = allScenes()
    const r = advanceStory(scenes[0].id, at(DAY1))
    expect(getStory().cleared[scenes[0].id]).toBe(true)
    const next = scenes[1] ?? null
    expect(r.advanced).toBe(Boolean(next))
    expect(r.nextId).toBe(next?.id ?? null)
    expect(getStory().node).toBe(next ? next.id : scenes[0].id)
  })

  it('旧存档指向已归档的站时回落到第一站', () => {
    localStorage.setItem('interpret.story.v1', JSON.stringify({ node: 'scn00', cleared: { scn00: true } }))
    expect(getStory().node).toBe(allScenes()[0].id)
    expect(getStory().cleared).toEqual({ scn00: true }) // 归档站的历史完成记录原样保留
  })

  it('最后一站没有下一站，只标记完成', () => {
    const scenes = allScenes()
    const last = scenes[scenes.length - 1]
    for (const s of scenes.slice(0, -1)) advanceStory(s.id, at(DAY1))
    const r = advanceStory(last.id, at(DAY1))
    expect(r.advanced).toBe(false)
    expect(r.nextId).toBeNull()
    expect(getStory().node).toBe(last.id)
  })

  it('未知场景不写指针', () => {
    const before = getStory()
    const r = advanceStory('nope', at(DAY1))
    expect(r.advanced).toBe(false)
    expect(getStory()).toEqual(before)
  })
})

describe('抉择存档', () => {
  it('记录选项并落下 flag', () => {
    const scene = allScenes()[0]
    const option = scene.choice.options[0]
    const r = recordChoice(scene.id, option.id, at(DAY1))
    expect(r.recorded).toBe(true)
    expect(r.persisted).toBe(true)
    expect(getStory().choices[scene.id]).toBe(option.id)
    expect(getStory().flags[option.flag]).toBe(true)
    expect(getStory().updatedAt).toBe(DAY1)
  })

  it('选项不存在或场次已归档时不写存档', () => {
    const before = getStory()
    expect(recordChoice('scn02', 'nope', at(DAY1)).recorded).toBe(false)
    expect(recordChoice('scn00', 'honest', at(DAY1)).recorded).toBe(false)
    expect(getStory()).toEqual(before)
  })

  it('推进指针不会冲掉已记录的抉择', () => {
    const scene = allScenes()[0]
    recordChoice(scene.id, scene.choice.options[0].id, at(DAY1))
    advanceStory(scene.id, at(DAY1))
    expect(getStory().choices[scene.id]).toBe(scene.choice.options[0].id)
    expect(getStory().flags[scene.choice.options[0].flag]).toBe(true)
  })

  it('坏存档里的 choices / flags 降级为空', () => {
    localStorage.setItem('interpret.story.v1', JSON.stringify({ choices: 'bad', flags: [1, 2] }))
    expect(getStory().choices).toEqual({})
    expect(getStory().flags).toEqual({})
  })
})
