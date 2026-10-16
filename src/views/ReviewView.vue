<template>
  <main class="view">
    <h2>弱项回顾</h2>
    <p class="hint">最近 30 天磕绊过的句子。只是回顾工具——不看不欠</p>
    <p v-if="list.length === 0" class="empty neu-raised">目前没有弱句，太稳了</p>
    <ul v-else class="weak-list">
      <li v-for="it in list" :key="it.sentenceId + it.ts" class="neu-raised">
        <p class="weak-src">{{ it.sentence?.zh || it.sentence?.en || it.sentenceId }}</p>
        <p class="weak-meta">{{ it.rating === 'miss' ? '不会' : '磕绊' }} · {{ fmt(it.ts) }}</p>
      </li>
    </ul>
    <button v-if="list.length" class="btn btn-primary" @click="replay">重练这 {{ list.length }} 句</button>
  </main>
</template>

<script setup>
import { reviewList } from '../lib/review.js'

const list = reviewList()
const fmt = ts => new Date(ts).toLocaleDateString('zh-CN')

function replay() {
  sessionStorage.setItem('interpret.session', JSON.stringify({ mode: 'replay', ids: list.map(i => i.sentenceId) }))
  location.hash = '#/'
}
</script>

<style scoped>
h2 { font-size: 20px; }
.hint { font-size: 13px; color: var(--text-muted); }
.weak-list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.weak-list li { padding: 14px 16px; }
.weak-src { margin: 0 0 6px; font-size: 15px; }
.weak-meta { margin: 0; font-size: 12px; color: var(--text-muted); }
.empty { padding: 32px; text-align: center; color: var(--text-muted); }
.btn-primary { width: 100%; margin-top: 16px; }
</style>
