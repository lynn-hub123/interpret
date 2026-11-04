<template>
  <main class="view">
    <h2>自由练习</h2>
    <p class="hint">不推剧情，只练句子。练完照样攒券抽卡。</p>

    <section class="block">
      <h3>按主题练</h3>
      <TopicGrid />
    </section>

    <section class="block">
      <h3>粘一段进来</h3>
      <PastePanel />
    </section>
  </main>
</template>

<script setup>
import TopicGrid from '../components/TopicGrid.vue'
import PastePanel from '../components/PastePanel.vue'
</script>

<style scoped>
h2 { font-size: 20px; }
.hint { font-size: 13px; color: var(--text-muted); }
.block { margin-top: 24px; }
.block h3 { font-size: 15px; margin: 0 0 12px; color: var(--text-muted); }
</style>
