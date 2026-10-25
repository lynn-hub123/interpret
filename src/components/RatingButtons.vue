<template>
  <div class="rating-row" :class="`variant-${variant}`">
    <button v-for="r in ratings" :key="r.value" class="btn" @click="emit('rate', r.value)">{{ r.label }}</button>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  variant: { type: String, default: 'translate' }
})
const emit = defineEmits(['rate'])
const LABELS = {
  translate: [
    { value: 'ok', label: '能译' },
    { value: 'shaky', label: '磕绊' },
    { value: 'miss', label: '不会' }
  ],
  retell: [
    { value: 'ok', label: '流畅' },
    { value: 'shaky', label: '磕绊' },
    { value: 'miss', label: '没记住' }
  ],
  unlock: [
    { value: 0, label: '完全翻不出来' },
    { value: 25, label: '翻出一小部分' },
    { value: 50, label: '翻出大半' },
    { value: 75, label: '基本完整' },
    { value: 100, label: '完整流畅' }
  ]
}
const ratings = computed(() => LABELS[props.variant] || LABELS.translate)
</script>

<style scoped>
.rating-row { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
.rating-row .btn { min-width: 84px; }
.variant-unlock { gap: 8px; }
.variant-unlock .btn { min-width: 0; font-size: 12px; padding: 10px 10px; }
</style>
