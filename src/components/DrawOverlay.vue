<template>
  <div class="draw-overlay">
    <div class="stage">
      <div v-if="!flipped" class="card-back neu-raised">
        <span class="mark">?</span>
      </div>
      <template v-else>
        <CardReveal :name="card.name" :tier="card.tier" :accent="card.accent" :progress="0" :full="hiddenChallenge" />
        <div class="draw-tags">
          <span class="tier-tag">{{ TIER_LABEL[card.tier] }}</span>
          <span v-if="isNew" class="new-tag">新卡</span>
        </div>
        <p class="draw-hint">{{ tip }}</p>
        <div class="draw-actions">
          <button class="btn btn-primary" @click="emit('start')">{{ hiddenChallenge ? '开始隐藏挑战' : '开始解锁' }}</button>
          <button class="btn" @click="emit('later')">先放着</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import CardReveal from './CardReveal.vue'

const props = defineProps({
  card: { type: Object, required: true },
  isNew: { type: Boolean, default: false },
  hiddenChallenge: { type: Boolean, default: false }
})
const emit = defineEmits(['start', 'later'])
const TIER_LABEL = { normal: '普通', rare: '稀有', super: '超稀有' }

const flipped = ref(false)
let timer = null

const tip = computed(() => {
  if (props.hiddenChallenge) return '隐藏挑战：这一次的第一发翻到 100%，才能拿到隐藏形态'
  return '剪影会按你这次翻出的程度露出，第一次就翻到 100% 可得隐藏形态'
})

onMounted(() => {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce) { flipped.value = true; return }
  timer = setTimeout(() => { flipped.value = true }, 300)
})

onUnmounted(() => { if (timer) clearTimeout(timer) })
</script>

<style scoped>
.draw-overlay {
  position: fixed; inset: 0; z-index: 60;
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.62);
  backdrop-filter: blur(6px);
}
.stage { width: min(320px, 82vw); display: flex; flex-direction: column; align-items: center; gap: 14px; }
.card-back {
  width: 100%; aspect-ratio: 3 / 4.2; border-radius: 18px;
  display: flex; align-items: center; justify-content: center;
  background: repeating-linear-gradient(45deg, #22222a 0 12px, #1b1b21 12px 24px);
  color: var(--accent-text); font-size: 42px;
}
.draw-tags { display: flex; gap: 8px; }
.tier-tag, .new-tag { font-size: 11px; padding: 3px 10px; border-radius: 999px; background: var(--surface); color: var(--text-muted); }
.new-tag { color: var(--accent-text); background: var(--accent-soft); }
.draw-hint { margin: 0; font-size: 13px; line-height: 1.6; color: var(--text-muted); text-align: center; }
.draw-actions { display: flex; flex-direction: column; gap: 10px; width: 100%; }
</style>
