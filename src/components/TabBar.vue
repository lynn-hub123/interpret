<template>
  <nav class="tab-bar neu-raised">
    <router-link v-for="t in tabs" :key="t.to" :to="t.to" class="tab-item">
      <span class="tab-icon">{{ t.icon }}</span>
      <span class="tab-label">{{ t.label }}</span>
    </router-link>
  </nav>
</template>

<script setup>
const tabs = [
  { to: '/', icon: '🌊', label: '主线' },
  { to: '/me', icon: '🎴', label: '拾潮人手册' }
]
</script>
