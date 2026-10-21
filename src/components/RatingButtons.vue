<template>
  <div class="rating-row">
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
  ]
}
const ratings = computed(() => LABELS[props.variant] || LABELS.translate)
</script>

<style scoped>
.rating-row { display: flex; gap: 14px; justify-content: center; }
.rating-row .btn { min-width: 84px; }
</style>
