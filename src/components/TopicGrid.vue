<template>
  <div class="topic-grid">
    <button v-for="t in topics" :key="t.id" class="btn px-btn topic-card" @click="start(t.id)">
      <span class="topic-label">{{ t.label }}</span>
      <span class="topic-count">{{ countOf(t.id) }} 句</span>
    </button>
  </div>
</template>

<script setup>
import { TOPICS, allBuiltinSentences } from '../lib/sentences.js'

const topics = TOPICS
const countOf = id => allBuiltinSentences().filter(s => s.topic === id).length

function start(topicId) {
  location.hash = `#/`
  sessionStorage.setItem('interpret.session', JSON.stringify({ mode: 'topic', topicId }))
}
</script>

<style scoped>
.topic-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.topic-card { display: flex; flex-direction: column; gap: 8px; padding: 16px; align-items: flex-start; }
.topic-label { font-size: 17px; }
.topic-count { font-size: 12px; color: var(--text-muted); }
</style>
