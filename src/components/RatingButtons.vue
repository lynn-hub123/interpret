<template>
  <div class="rating-row">
    <button v-for="r in ratings" :key="r.value" class="btn" @click="emit('rate', r.value)">{{ r.label }}</button>
  </div>
</template>

<script setup>
const emit = defineEmits(['rate'])
const ratings = [
  { value: 'ok', label: '能译' },
  { value: 'shaky', label: '磕绊' },
  { value: 'miss', label: '不会' }
]
</script>

<style scoped>
.rating-row { display: flex; gap: 14px; justify-content: center; }
.rating-row .btn { min-width: 84px; }
</style>
