import { describe, it, expect } from 'vitest'
import fixture from '../data/story-fixture/ch01.json'
import speakerFile from '../data/story-fixture/speakers.json'
import { createStory } from './story.js'

const { chapter, scenes, speakers, speakerName, lineText, isPlayerBeat, hasSceneIntro } =
  createStory(fixture, speakerFile)

describe('样例章节', () => {
  it('场景数据完整，每场 8–14 条', () => {
    expect(chapter.dir).toBe('zh2en')
    expect(scenes).toHaveLength(1)
    for (const scene of scenes) {
      expect((scene.caption?.length || 0) + scene.beats.length).toBeGreaterThanOrEqual(8)
      expect((scene.caption?.length || 0) + scene.beats.length).toBeLessThanOrEqual(14)
    }
  })

  it('每回合候选不超过 2 条', () => {
    for (const scene of scenes) {
      for (const beat of scene.beats) {
        if (isPlayerBeat(beat)) expect(beat.candidates.length).toBeLessThanOrEqual(2)
      }
    }
  })

  it('硬门禁的槽位与候选一致', () => {
    const gates = scenes.flatMap((scene) => scene.beats).filter((beat) => beat.gate?.type === 'hard')
    expect(gates).toHaveLength(1)
    for (const beat of gates) {
      expect(beat.candidates).toHaveLength(1)
      expect(beat.gate.required).toEqual(beat.candidates[0].required)
      for (const slot of beat.gate.required) expect(beat.gate.accept[slot]).toBeTruthy()
    }
  })

  it('说话人都能解析，台词按输出语言取值', () => {
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
    expect(hasSceneIntro({ presentation: 'chat' })).toBe(false)
  })
})
