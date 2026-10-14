<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="panel neu-raised">
      <header>
        <h3>本轮练习</h3>
        <button class="btn btn-close" @click="emit('close')">关闭</button>
      </header>
      <p v-if="items.length === 0" class="hint">还没有练过，先来一句吧</p>
      <ol v-else class="thread">
        <li v-for="(it, i) in items" :key="i">
          <div class="bubble src">{{ sourceOf(it) }}</div>
          <div class="bubble ref">{{ refOf(it) }}</div>
        </li>
      </ol>
    </div>
  </div>
</template>

<script setup>
defineProps({ items: { type: Array, default: () => [] } })
const emit = defineEmits(['close'])
const sourceOf = it => (it.direction === 'zh2en' ? it.sentence.zh : it.sentence.en)
const refOf = it => (it.direction === 'zh2en' ? it.sentence.en || '（无参考译文）' : it.sentence.zh || '（无参考译文）')
</script>

<style scoped>
.overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); display: flex; align-items: flex-end; justify-content: center; z-index: 10; }
.panel { width: min(480px, 100%); max-height: 75dvh; overflow-y: auto; padding: 16px; border-radius: 20px 20px 0 0; }
header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
h3 { margin: 0; font-size: 16px; }
.btn-close { font-size: 13px; padding: 8px 14px; }
.thread { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.bubble { max-width: 85%; padding: 8px 12px; border-radius: 12px; font-size: 14px; }
.bubble.src { background: var(--surface-deep); box-shadow: var(--shadow-in); }
.bubble.ref { background: var(--accent-soft); color: var(--accent-text); margin-left: auto; }
.hint { color: var(--text-muted); font-size: 13px; }
</style>
