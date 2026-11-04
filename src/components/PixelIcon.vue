<template>
  <svg
    class="px-icon"
    :class="`px-icon--${name}`"
    :width="size"
    :height="size"
    viewBox="0 0 8 8"
    shape-rendering="crispEdges"
    aria-hidden="true"
    :data-name="name"
  >
    <!-- 齿轮带孔，单独用矩形画，孔的底色跟随按钮表面 -->
    <template v-if="name === 'gear'">
      <g fill="currentColor">
        <rect x="2" y="0" width="4" height="1" />
        <rect x="2" y="7" width="4" height="1" />
        <rect x="0" y="2" width="1" height="4" />
        <rect x="7" y="2" width="1" height="4" />
        <rect x="1" y="1" width="6" height="6" />
      </g>
      <rect x="3" y="3" width="2" height="2" fill="var(--surface)" />
    </template>
    <rect
      v-else
      v-for="(p, i) in pixels"
      :key="i"
      :x="p[0]"
      :y="p[1]"
      width="1"
      height="1"
      fill="currentColor"
    />
  </svg>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: Number, default: 16 }
})

// 8×8 单色像素图：# 为实心像素，. 为透明
const MAP = {
  tide: [
    '........',
    '.##..##.',
    '.#.##.#.',
    '.##..##.',
    '........',
    '.##..##.',
    '.#.##.#.',
    '.##..##.'
  ],
  card: [
    '........',
    '..####..',
    '.#....#.',
    '.#.##.#.',
    '.#.##.#.',
    '.#....#.',
    '..####..',
    '........'
  ],
  mic: [
    '...##...',
    '..#..#..',
    '..#..#..',
    '..#..#..',
    '...##...',
    '...#....',
    '..####..',
    '........'
  ],
  play: [
    '........',
    '..#.....',
    '..##....',
    '..###...',
    '..####..',
    '..###...',
    '..##....',
    '..#.....'
  ],
  stop: [
    '........',
    '........',
    '..####..',
    '..####..',
    '..####..',
    '..####..',
    '........',
    '........'
  ],
  pause: [
    '........',
    '..##.##.',
    '..##.##.',
    '..##.##.',
    '..##.##.',
    '..##.##.',
    '..##.##.',
    '........'
  ],
  ticket: [
    '........',
    '.######.',
    '.#....#.',
    '..#..#..',
    '..#..#..',
    '.#....#.',
    '.######.',
    '........'
  ]
}

const pixels = computed(() => {
  const rows = MAP[props.name] || []
  const out = []
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') out.push([x, y])
  })
  return out
})
</script>
