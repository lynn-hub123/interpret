<template>
  <main class="view">
    <h2>粘贴开练</h2>
    <p class="hint">随手贴一段文字，自动拆句立刻练</p>
    <textarea v-model="text" class="neu-inset" rows="8" placeholder="把文章、新闻、讲稿……任何文字丢进来"></textarea>
    <p v-if="sentences.length" class="preview">{{ sentences.length }} 句待练</p>
    <p v-if="error" class="error">{{ error }}</p>
    <button class="btn btn-primary" :disabled="!sentences.length" @click="start">开始练习</button>
  </main>
</template>

<script setup>
import { computed, ref } from 'vue'
import { splitPasteText, addCustomSentences } from '../lib/sentences.js'

const text = ref('')
const error = ref('')
const sentences = computed(() => splitPasteText(text.value))

function start() {
  if (sentences.value.length === 0) { error.value = '没有拆出可练的句子，检查一下内容'; return }
  error.value = ''
  addCustomSentences(sentences.value)
  sessionStorage.setItem('interpret.session', JSON.stringify({ mode: 'paste' }))
  location.hash = '/#/'
}
</script>

<style scoped>
h2 { font-size: 20px; }
.hint { font-size: 13px; color: var(--text-muted); }
textarea { width: 100%; border: none; resize: vertical; padding: 14px; font-size: 15px; color: var(--text); font-family: inherit; }
.preview { font-size: 13px; color: var(--accent-text); }
.error { font-size: 13px; color: #e8463a; }
.btn-primary:disabled { opacity: 0.4; }
</style>
