import { describe, it, expect } from 'vitest'
import { chapter, scenes, speakers, speakerName, lineText, isPlayerBeat, hasSceneIntro } from './story.js'

describe('ch01 数据', () => {
  it('三场，每场 14 条（场景四行台词 + 十条消息）', () => {
    expect(scenes).toHaveLength(3)
    for (const scene of scenes) {
      expect((scene.caption?.length || 0) + scene.beats.length).toBe(14)
    }
  })

  it('每回合候选不超过 2 条', () => {
    for (const scene of scenes) {
      for (const beat of scene.beats) {
        if (isPlayerBeat(beat)) expect(beat.candidates.length).toBeLessThanOrEqual(2)
      }
    }
  })

  it('两个硬门禁，槽位与候选一致', () => {
    const gates = scenes.flatMap(s => s.beats).filter(b => b.gate?.type === 'hard')
    expect(gates).toHaveLength(2)
    for (const beat of gates) {
      expect(beat.candidates).toHaveLength(1)
      expect(beat.gate.required).toEqual(beat.candidates[0].required)
      for (const slot of beat.gate.required) expect(beat.gate.accept[slot]).toBeTruthy()
    }
  })

  it('说话人都能解析', () => {
    for (const scene of scenes) {
      for (const beat of scene.beats) {
        if (beat.kind === 'npc') {
          expect(speakers[beat.speaker]).toBeTruthy()
          expect(lineText(beat)).toBeTruthy()
          expect(speakerName(beat.speaker)).toBeTruthy()
        }
      }
    }
  })

  it('只有第一场是场景界面，且四行台词', () => {
    expect(hasSceneIntro(scenes[0])).toBe(true)
    expect(scenes[0].caption).toHaveLength(4)
    expect(hasSceneIntro(scenes[1])).toBe(false)
    expect(hasSceneIntro(scenes[2])).toBe(false)
  })
})
