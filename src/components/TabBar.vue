<template>
  <nav class="tab-bar neu-raised">
    <router-link v-for="t in tabs" :key="t.to" :to="t.to" class="tab-item">
      <span class="tab-icon"><PixelIcon :name="t.icon" :size="24" /></span>
      <span class="tab-label">{{ t.label }}</span>
    </router-link>
  </nav>
</template>

<script setup>
import PixelIcon from './PixelIcon.vue'

const tabs = [
  { to: '/', icon: 'tide', label: '主线' },
  { to: '/me', icon: 'card', label: '拾潮人手册' }
]
</script>

<style scoped>
.tab-icon { display: flex; align-items: center; justify-content: center; line-height: 1; }
</style>
