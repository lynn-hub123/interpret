<template>
  <main class="view">
    <h2>现场</h2>
    <p class="hint">跟着铃，把海底的话一句一句带上来</p>
    <div class="scene-list">
      <button v-for="s in sceneList" :key="s.id" class="btn scene-card neu-raised" @click="startScene(s.id)">
        <span class="scene-head">
          <span class="scene-title">{{ s.title }}</span>
          <span v-if="s.current" class="badge">当前</span>
          <span v-else-if="s.cleared" class="badge done">已完成</span>
        </span>
        <span class="scene-meta">{{ s.place }} · {{ s.time }}</span>
        <span class="scene-meta">{{ s.spirit.name }} · {{ s.register }} · {{ s.level }}</span>
        <span class="scene-stat">已练 {{ s.stat.cleared }}/{{ s.stat.total }} · 羁绊 {{ s.bond }}</span>
      </button>
    </div>

    <h2>题库</h2>
    <p class="hint">点主题进入连续练习</p>
    <div class="topic-grid">
      <button v-for="t in topics" :key="t.id" class="btn topic-card neu-raised" @click="start(t.id)">
        <span class="topic-label">{{ t.label }}</span>
        <span class="topic-count">{{ countOf(t.id) }} 句</span>
      </button>
    </div>
  </main>
</template>

<script setup>
import { TOPICS, allBuiltinSentences } from '../lib/sentences.js'
import { allScenes, sceneProgress } from '../lib/scenes.js'
import { getSpiritBond, clearedLineIds, getStory } from '../lib/bonds.js'

const topics = TOPICS
const countOf = id => allBuiltinSentences().filter(s => s.topic === id).length

// 进页面读一次存档：主线指针决定哪一站是「当前」，本场已练句数来自羁绊存档
const story = getStory()
const sceneList = allScenes().map(s => ({
  ...s,
  current: story.node === s.id,
  cleared: story.cleared[s.id] === true,
  stat: sceneProgress(s, clearedLineIds(s.spirit.id), story.flags),
  bond: getSpiritBond(s.spirit.id).bond
}))

function startScene(sceneId) {
  location.hash = `#/`
  sessionStorage.setItem('interpret.session', JSON.stringify({ mode: 'scene', sceneId }))
}

function start(topicId) {
  location.hash = `#/` // 回练习页
  sessionStorage.setItem('interpret.session', JSON.stringify({ mode: 'topic', topicId }))
}
</script>

<style scoped>
h2 { font-size: 20px; }
.hint { font-size: 13px; color: var(--text-muted); }
.scene-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 28px; }
.scene-card { display: flex; flex-direction: column; gap: 4px; padding: 16px 18px; align-items: flex-start; text-align: left; }
.scene-head { display: flex; align-items: center; gap: 8px; }
.scene-title { font-size: 16px; }
.badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--accent-soft); color: var(--accent-text); }
.badge.done { color: var(--gold-text); }
.scene-meta { font-size: 12px; color: var(--text-muted); }
.scene-stat { font-size: 12px; color: var(--accent-text); }
.topic-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.topic-card { display: flex; flex-direction: column; gap: 6px; padding: 18px; align-items: flex-start; }
.topic-label { font-size: 17px; }
.topic-count { font-size: 12px; color: var(--text-muted); }
</style>
