import { describe, it, expect, beforeEach } from 'vitest'
import { needsOnboarding, onboardingDone, completeOnboarding } from './onboarding.js'
import { addRecord } from './records.js'
import { advanceStory } from './bonds.js'
import { allScenes } from './scenes.js'

beforeEach(() => localStorage.clear())

describe('新手引导触发', () => {
  it('全新存档需要引导', () => {
    expect(onboardingDone()).toBe(false)
    expect(needsOnboarding()).toBe(true)
  })

  it('看过或跳过后不再出现', () => {
    expect(completeOnboarding()).toBe(true)
    expect(onboardingDone()).toBe(true)
    expect(needsOnboarding()).toBe(false)
  })

  it('已有练习记录的老玩家不补放', () => {
    addRecord({ sentenceId: 'b_01', direction: 'zh2en', rating: 'ok' })
    expect(needsOnboarding()).toBe(false)
  })

  it('已有主线痕迹的老玩家不补放', () => {
    advanceStory(allScenes()[0].id)
    expect(needsOnboarding()).toBe(false)
  })
})
