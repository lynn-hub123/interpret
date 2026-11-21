// 剧情数据访问与断点：JSON 只读，进度写 localStorage（interpret.story.ch01.v1）。
// 章节由同级 story 仓同步而来（npm run sync:story）；未同步时用占位章节，构建不依赖剧本仓。
import { load, save } from './storage.js'

export const STORY_KEY = 'story.ch01.v1'

const PLACEHOLDER = {
  id: 'unsynced',
  title: '章节未同步',
  dir: 'zh2en',
  scenes: [
    {
      id: 'unsynced_s1',
      index: 1,
      title: '未同步',
      place: '章节未同步',
      time: '',
      presentation: 'chat',
      caption: [],
      beats: [
        {
          id: 'unsynced_01',
          kind: 'narration',
          text: '章节未同步。先在游戏仓运行 npm run sync:story，再刷新页面。'
        }
      ]
    }
  ]
}

function build(chapterData, speakersData) {
  const chapter = chapterData || PLACEHOLDER
  const scenes = chapter.scenes || []
  const speakers = (speakersData?.speakers || []).reduce((map, speaker) => {
    map[speaker.id] = speaker
    return map
  }, {})

  function speakerName(id) {
    return speakers[id]?.displayName || id
  }

  // zh2en = 角色说英文（输出面），en2zh 反之；聊天流显示角色当前使用的语言
  function lineText(beat) {
    if (!beat || !beat.text) return ''
    return chapter.dir === 'zh2en' ? beat.text.en : beat.text.zh
  }

  function isPlayerBeat(beat) {
    return !!beat && beat.kind === 'player'
  }

  function hasSceneIntro(scene) {
    return scene?.presentation === 'scene'
  }

  return { chapter, scenes, speakers, speakerName, lineText, isPlayerBeat, hasSceneIntro }
}

const chapterModules = import.meta.glob('../data/story-import/ch01.json', { eager: true })
const speakerModules = import.meta.glob('../data/story-import/speakers.json', { eager: true })

// 测试与工具可以用任意章节数据构造一套访问器，不依赖导入目录
export function createStory(chapterData, speakersData) {
  return build(chapterData, speakersData)
}

const active = build(
  chapterModules['../data/story-import/ch01.json']?.default,
  speakerModules['../data/story-import/speakers.json']?.default
)

export const chapter = active.chapter
export const scenes = active.scenes
export const speakers = active.speakers
export const speakerName = active.speakerName
export const lineText = active.lineText
export const isPlayerBeat = active.isPlayerBeat
export const hasSceneIntro = active.hasSceneIntro

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
