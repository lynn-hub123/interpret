<template>
  <svg
    class="story-icon"
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    shape-rendering="crispEdges"
    aria-hidden="true"
    :data-icon="name"
  >
    <path
      v-if="icon.line"
      :d="icon.line"
      fill="none"
      stroke="currentColor"
      stroke-width="1"
    />
    <rect
      v-for="(r, i) in icon.solid || []"
      :key="`s${i}`"
      :x="r[0]"
      :y="r[1]"
      :width="r[2]"
      :height="r[3]"
      fill="currentColor"
    />
    <rect
      v-for="(r, i) in icon.accent || []"
      :key="`a${i}`"
      :x="r[0]"
      :y="r[1]"
      :width="r[2]"
      :height="r[3]"
      class="accent"
    />
  </svg>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: Number, default: 16 }
})

// 16×16 网格、1px 线；line 为描边，solid 为实心块，accent 走玫红点睛
const ICONS = {
  // 状态
  mic: { line: 'M6.5 2.5h3v7h-3z M8.5 9.5v2 M5.5 12.5h6' },
  rec: { line: 'M4.5 4.5h7v7h-7z', solid: [[6, 6, 4, 4]] },
  send: { line: 'M2.5 8.5h9 M8.5 4.5l4 4-4 4' },
  play: { solid: [[5, 3, 2, 10], [7, 5, 2, 6], [9, 7, 2, 2]] },
  pause: { solid: [[5, 3, 2, 10], [9, 3, 2, 10]] },

  // 物件
  clue: { line: 'M4.5 2.5h6l2 2v9h-8z M10.5 2.5v2h2 M6.5 8.5h3 M6.5 11.5h2' },
  roster: {
    line: 'M3.5 3.5h9v9h-9z M3.5 6.5h9 M3.5 9.5h9 M8 3.5v9',
    accent: [[9, 10, 2, 2]]
  },
  phone: {
    line: 'M5.5 3.5h5v10h-5z M3.5 5.5h2v5h-2z',
    solid: [[7, 7, 1, 1], [9, 7, 1, 1]]
  },
  recorder: {
    line: 'M2.5 6.5h11v6h-11z M2.5 10.5h11',
    accent: [[4, 7, 2, 2], [10, 7, 2, 2]]
  },

  // 动作
  stairs: { line: 'M2.5 12.5h4v-3h4v-3h3' },
  leave: {
    line: 'M2.5 3.5h6v9h-6z M14.5 8.5h-4 M12.5 6.5l2 2-2 2',
    solid: [[6, 7, 1, 1]]
  }
}

const icon = computed(() => ICONS[props.name] || {})
</script>

<style scoped>
.story-icon {
  display: block;
  flex-shrink: 0;
  color: currentColor;
}
.story-icon .accent { fill: var(--story-rose-soft, #C08FA2); }
</style>
