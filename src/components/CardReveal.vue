<template>
  <div
    class="reveal"
    :class="[`tier-${tier}`, { 'hidden-form': hidden, full }]"
    :style="{ '--card-accent': accent }"
    :data-progress="progress"
    :data-hidden="hidden ? '1' : '0'"
  >
    <div class="art" aria-hidden="true">
      <svg class="figure" viewBox="0 0 100 140">
        <circle cx="50" cy="34" r="17" />
        <path d="M50 52c-18 0-30 12-32 30l-3 26h70l-3-26c-2-18-14-30-32-30z" />
      </svg>
    </div>
    <div v-if="!full && progress < 100" class="veil" :style="veilStyle"></div>
    <span v-if="!full" class="pct">{{ progress }}%</span>
    <span v-if="hidden" class="hidden-badge">隐藏形态</span>
    <div class="meta">
      <span class="name">{{ name }}</span>
      <span class="tier-badge">{{ TIER_LABEL[tier] || '' }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, default: '' },
  tier: { type: String, default: 'normal' },
  accent: { type: String, default: '#7c6cf0' },
  progress: { type: Number, default: 0 },
  hidden: { type: Boolean, default: false },
  full: { type: Boolean, default: false }
})

const TIER_LABEL = { normal: '普通', rare: '稀有', super: '超稀有' }

// 遮罩洞面积随档位放大：0 无洞（全遮），100 直接移除遮罩
const VEIL_SIZE = { 0: '0% 0%', 25: '58% 58%', 50: '82% 82%', 75: '108% 108%' }
const BLOB = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath fill='%23000' d='M50 3c21 0 45 15 45 44 0 30-17 50-45 50S5 78 5 48C5 20 28 3 50 3z'/%3E%3C/svg%3E\")"

const veilStyle = computed(() => {
  const size = VEIL_SIZE[props.progress] || '0% 0%'
  return {
    maskImage: BLOB,
    WebkitMaskImage: BLOB,
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
    maskPosition: 'center',
    WebkitMaskPosition: 'center',
    maskSize: size,
    WebkitMaskSize: size
  }
})
</script>

<style scoped>
.reveal {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4.2;
  border-radius: 18px;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 30%, var(--card-accent) 0%, transparent 62%),
    linear-gradient(160deg, #24242c, #101014);
}
.art { position: absolute; inset: 0; display: flex; align-items: flex-end; justify-content: center; }
.figure { width: 78%; height: 82%; fill: #f4f4f6; opacity: 0.88; }
.veil { position: absolute; inset: 0; z-index: 1; background: #17171a; opacity: 0.96; }
.pct { position: absolute; top: 8px; left: 10px; z-index: 3; font-size: 12px; color: #f4f4f6; opacity: 0.85; }
.meta {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 2;
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 12px; font-size: 13px; color: #f4f4f6;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.55));
}
.tier-badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: rgba(255, 255, 255, 0.14); }
.hidden-form { box-shadow: 0 0 0 1px rgba(255, 215, 130, 0.6), 0 0 24px rgba(255, 215, 130, 0.25); }
.hidden-form .figure { fill: #fff3d0; }
.hidden-badge {
  position: absolute; top: 8px; right: 8px; z-index: 3;
  font-size: 11px; padding: 3px 8px; border-radius: 999px;
  background: rgba(255, 215, 130, 0.18); color: #ffe2a0;
}
</style>
