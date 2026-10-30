import { load, save } from './storage.js'
import { getRecords } from './records.js'
import { getStory } from './bonds.js'

const KEY = 'onboarded.v1'

export function onboardingDone() {
  return load(KEY, false) === true
}

// 老玩家（已有练习记录或主线痕迹）不再补放引导，避免打扰
export function needsOnboarding() {
  if (onboardingDone()) return false
  const story = getStory()
  const hasProgress = getRecords().length > 0 ||
    Object.keys(story.cleared).length > 0 ||
    Object.keys(story.choices).length > 0
  return !hasProgress
}

export function completeOnboarding() {
  return save(KEY, true)
}
