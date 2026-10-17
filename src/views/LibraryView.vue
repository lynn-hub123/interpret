<template>
  <main class="view">
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

const topics = TOPICS
const countOf = id => allBuiltinSentences().filter(s => s.topic === id).length

function start(topicId) {
  location.hash = `#/` // 回练习页
  sessionStorage.setItem('interpret.session', JSON.stringify({ mode: 'topic', topicId }))
}
</script>

<style scoped>
h2 { font-size: 20px; }
.hint { font-size: 13px; color: var(--text-muted); }
.topic-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.topic-card { display: flex; flex-direction: column; gap: 6px; padding: 18px; align-items: flex-start; }
.topic-label { font-size: 17px; }
.topic-count { font-size: 12px; color: var(--text-muted); }
</style>
