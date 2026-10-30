<template>
  <svg
    class="ling-sprite"
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    shape-rendering="crispEdges"
    role="img"
    :aria-label="label"
  >
    <rect
      v-for="p in pixels"
      :key="`${p.x}-${p.y}`"
      :x="p.x"
      :y="p.y"
      width="1"
      height="1"
      :fill="p.fill"
    />
  </svg>
</template>

<script setup>
import { computed } from 'vue'
import { LING_PALETTE, LING_PIXELS } from '../data/lingSprite.js'

defineProps({
  size: { type: Number, default: 96 },
  label: { type: String, default: '铃：寄居蟹，背着停摆的怀表壳' }
})

const pixels = computed(() => LING_PIXELS.map(p => ({ ...p, fill: LING_PALETTE[p.c] })))
</script>

<style scoped>
.ling-sprite { display: block; }
</style>
