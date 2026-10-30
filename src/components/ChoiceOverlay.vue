<template>
  <div class="choice-overlay">
    <div class="choice-panel neu-raised">
      <p class="choice-kicker">本场结束 · 你要怎么开口</p>
      <p class="choice-trigger">{{ choice.trigger }}</p>
      <p v-if="choice.note" class="choice-note">{{ choice.note }}</p>
      <div class="choice-list">
        <button v-for="o in choice.options" :key="o.id" class="btn choice-card" @click="emit('choose', o.id)">
          <span class="choice-stance">{{ o.stance }}</span>
          <span class="choice-line">{{ o.zh }}</span>
        </button>
      </div>
      <button class="btn choice-later" @click="emit('later')">先不决定</button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  choice: { type: Object, required: true }
})
const emit = defineEmits(['choose', 'later'])
</script>

<style scoped>
.choice-overlay {
  position: fixed; inset: 0; z-index: 60;
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.62);
  backdrop-filter: blur(6px);
}
.choice-panel {
  width: min(420px, 92vw); max-height: 86vh; overflow-y: auto;
  padding: 20px; display: flex; flex-direction: column; gap: 10px;
}
.choice-kicker { margin: 0; font-size: 12px; color: var(--accent-text); }
.choice-trigger { margin: 0; font-size: 17px; line-height: 1.6; }
.choice-note { margin: 0; font-size: 12px; line-height: 1.6; color: var(--text-muted); }
.choice-list { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
.choice-card { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; text-align: left; padding: 12px 14px; }
.choice-stance { font-size: 12px; color: var(--accent-text); }
.choice-line { font-size: 15px; line-height: 1.6; }
.choice-later { font-size: 12px; opacity: 0.6; margin-top: 2px; }
</style>
