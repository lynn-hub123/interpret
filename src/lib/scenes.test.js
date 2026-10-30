import { describe, it, expect, beforeEach } from 'vitest'
import { allScenes, sceneById, sceneSentences, sceneSentenceById, sceneProgress, sceneOpening } from './scenes.js'
import { sentenceById } from './sentences.js'

beforeEach(() => localStorage.clear())

describe('场景卡内容', () => {
  it('按 index 升序加载；旧世界卡片已归档，只留汐洲两幕', () => {
    const scenes = allScenes()
    expect(scenes.length).toBeGreaterThanOrEqual(2)
    expect(scenes.map(s => s.index)).toEqual([...scenes.map(s => s.index)].sort((a, b) => a - b))
    expect(scenes.map(s => s.id)).toEqual(['scn02', 'scn03'])
  })

  it('每场都有场所、精灵、语域、钩子与术语卡', () => {
    for (const s of allScenes()) {
      expect(s.title, s.id).toBeTruthy()
      expect(s.place, s.id).toBeTruthy()
      expect(s.time, s.id).toBeTruthy()
      expect(s.premise, s.id).toBeTruthy()
      expect(s.level, s.id).toBeTruthy()
      expect(s.register, s.id).toBeTruthy()
      expect(s.spirit.id, s.id).toBeTruthy()
      expect(s.spirit.name, s.id).toBeTruthy()
      expect(s.spirit.domain, s.id).toBeTruthy()
      expect(s.glossary.length, s.id).toBeGreaterThanOrEqual(5)
      for (const g of s.glossary) {
        expect(g.en, s.id).toBeTruthy()
        expect(g.zh, s.id).toBeTruthy()
      }
    }
  })

  it('id 全局唯一，且以场景 id 为前缀', () => {
    const ids = allScenes().flatMap(s => s.lines.map(l => l.id))
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of allScenes()) {
      expect(s.lines.every(l => l.id.startsWith(`${s.id}_`)), s.id).toBe(true)
    }
  })

  it('每场无条件句双向各 8 句，中英俱备，难度在 1-5，且每句有说话人与意图', () => {
    for (const s of allScenes()) {
      const base = s.lines.filter(l => !l.when)
      expect(base.filter(l => l.dir === 'zh2en').length, s.id).toBe(8)
      expect(base.filter(l => l.dir === 'en2zh').length, s.id).toBe(8)
      for (const l of s.lines) {
        expect(l.zh.length, l.id).toBeGreaterThanOrEqual(5)
        expect(l.en.length, l.id).toBeGreaterThanOrEqual(5)
        expect(l.difficulty, l.id).toBeGreaterThanOrEqual(1)
        expect(l.difficulty, l.id).toBeLessThanOrEqual(5)
        expect(l.speaker, l.id).toBeTruthy()
        expect(l.intent, l.id).toBeTruthy()
      }
    }
  })

  it('条件句的 when 必须指向别处真的落过的 flag', () => {
    const declared = new Set()
    for (const s of allScenes()) {
      for (const o of s.choice?.options ?? []) if (o.flag) declared.add(o.flag)
    }
    for (const s of allScenes()) {
      for (const l of s.lines) {
        if (l.when) expect(declared.has(l.when), `${l.id} → ${l.when}`).toBe(true)
      }
    }
  })
})

describe('加载层', () => {
  it('sceneById 命中与未命中；已归档场景返回 null', () => {
    expect(sceneById('scn02').id).toBe('scn02')
    expect(sceneById('nope')).toBeNull()
    expect(sceneById('scn00')).toBeNull()
  })

  it('sceneSentences 转成练习层句对象，含说话人与意图', () => {
    const scene = sceneById('scn02')
    const list = sceneSentences('scn02')
    expect(list).toHaveLength(scene.lines.length)
    expect(list[0]).toEqual(expect.objectContaining({
      id: scene.lines[0].id,
      zh: scene.lines[0].zh,
      en: scene.lines[0].en,
      topic: scene.spirit.domain,
      source: 'scene',
      sceneId: 'scn02',
      dir: scene.lines[0].dir,
      speaker: scene.lines[0].speaker,
      intent: scene.lines[0].intent
    }))
    expect(sceneSentences('nope')).toEqual([])
  })

  it('sceneSentenceById 可按 id 反查，未知返回 null', () => {
    const first = sceneById('scn02').lines[0]
    expect(sceneSentenceById(first.id).id).toBe(first.id)
    expect(sceneSentenceById('nope_01')).toBeNull()
  })

  it('sentenceById 能解析场景句（SRS 与统计据此工作）', () => {
    const first = sceneById('scn02').lines[0]
    expect(sentenceById(first.id).zh).toBe(first.zh)
  })

  it('sceneProgress 统计已练句数', () => {
    const scene = sceneById('scn02')
    const ids = new Set([scene.lines[0].id, scene.lines[1].id])
    expect(sceneProgress(scene, ids)).toEqual({ cleared: 2, total: 16, done: false })
    expect(sceneProgress(scene, new Set(scene.lines.map(l => l.id))).done).toBe(true)
  })

  it('条件句按 flag 进出句池', () => {
    expect(sceneSentences('scn03')).toHaveLength(16)
    expect(sceneSentences('scn03', { shore_knows_you: true })).toHaveLength(17)
    expect(sceneSentences('scn03').some(s => s.id === 'scn03_19')).toBe(false)
    expect(sceneSentences('scn03', { got_direction: true }).some(s => s.id === 'scn03_19')).toBe(true)
  })

  it('sceneProgress 只统计当前 flag 下可见的句子', () => {
    const scene = sceneById('scn03')
    const all = new Set(scene.lines.map(l => l.id))
    expect(sceneProgress(scene, all)).toEqual({ cleared: 16, total: 16, done: true })
    expect(sceneProgress(scene, all, { shore_knows_you: true })).toEqual({ cleared: 17, total: 17, done: true })
  })

  it('开场白随上一幕的抉择切换，没命中就回默认 premise', () => {
    const scene = sceneById('scn03')
    expect(sceneOpening(scene, {})).toBe(scene.premise)
    expect(sceneOpening(scene, { got_direction: true })).toBe(scene.openings.find(o => o.flag === 'got_direction').text)
    expect(sceneOpening(null)).toBe('')
  })
})
