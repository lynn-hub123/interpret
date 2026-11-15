// 剧情数据访问与断点：JSON 只读，进度写 localStorage（interpret.story.ch01.v1）。
import ch01 from '../data/story/ch01.json'
import speakersFile from '../data/story/speakers.json'
import { load, save } from './storage.js'

export const STORY_KEY = 'story.ch01.v1'
export const chapter = ch01
export const scenes = ch01.scenes
export const speakers = speakersFile.speakers.reduce((map, s) => {
  map[s.id] = s
  return map
}, {})

export function speakerName(id) {
  return speakers[id]?.displayName || id
}

// zh2en = 角色说英文（输出面），en2zh 反之；聊天流显示角色当前使用的语言
export function lineText(beat) {
  if (!beat || !beat.text) return ''
  return chapter.dir === 'zh2en' ? beat.text.en : beat.text.zh
}

export function isPlayerBeat(beat) {
  return !!beat && beat.kind === 'player'
}

export function hasSceneIntro(scene) {
  return scene?.presentation === 'scene'
}

export function loadStoryState() {
  const state = load(STORY_KEY, null)
  if (!state || typeof state !== 'object') return null
  if (!Array.isArray(state.log) || typeof state.scene !== 'number') return null
  return state
}

export function saveStoryState(state) {
  return save(STORY_KEY, state)
}

export function resetStoryState() {
  return save(STORY_KEY, null)
}
