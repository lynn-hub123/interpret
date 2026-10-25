<template>
  <div
    class="reveal"
    :class="[`tier-${tier}`, { 'hidden-form': hidden, full }]"
    :style="{ '--card-accent': accent }"
    :data-progress="bucket"
    :data-hidden="hidden ? '1' : '0'"
  >
    <div class="silhouette" aria-hidden="true">
      <svg class="figure" viewBox="0 0 100 140">
        <circle cx="50" cy="34" r="17" />
        <path d="M50 52c-18 0-30 12-32 30l-3 26h70l-3-26c-2-18-14-30-32-30z" />
      </svg>
    </div>
    <div class="art" :style="artStyle" aria-hidden="true">
      <svg class="figure" viewBox="0 0 100 140">
        <circle cx="50" cy="34" r="17" />
        <path d="M50 52c-18 0-30 12-32 30l-3 26h70l-3-26c-2-18-14-30-32-30z" />
      </svg>
    </div>
    <span v-if="!full" class="pct" aria-hidden="true">{{ bucket }}%</span>
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
const BUCKETS = [0, 25, 50, 75, 100]

// 非法档位一律回落到 0（失败就少露，不多露）
const bucket = computed(() => (BUCKETS.includes(props.progress) ? props.progress : 0))

// 遮罩洞面积随档位放大；0 无洞（art 完全不可见），100 直接取消遮罩
const VEIL_SIZE = { 0: '0% 0%', 25: '58% 58%', 50: '82% 82%', 75: '108% 108%' }
const BLOB = "url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20100%20100'%3E%3Cpath%20fill='%23000'%20d='M50%203c21%200%2045%2015%2045%2044%200%2030-17%2050-45%2050S5%2078%205%2048C5%2020%2028%203%2050%203z'/%3E%3C/svg%3E\")"

const artStyle = computed(() => {
  if (props.full || bucket.value === 100) {
    return { maskImage: 'none', WebkitMaskImage: 'none' }
  }
  const size = VEIL_SIZE[bucket.value]
  return {
    maskImage: BLOB,
    WebkitMaskImage: BLOB,
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
    maskPosition: 'center',
    WebkitMaskPosition: 'center',
    maskSize: size,
    WebkitMaskSize: size,
    maskMode: 'alpha',
    WebkitMaskMode: 'alpha'
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
  background: linear-gradient(160deg, #1c1c22, #0d0d11);
}
.silhouette,
.art {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.silhouette .figure { width: 78%; height: 82%; fill: #2a2a33; }
.art {
  background: radial-gradient(circle at 50% 30%, var(--card-accent) 0%, transparent 62%);
}
.art .figure { width: 78%; height: 82%; fill: #f4f4f6; opacity: 0.9; }
.pct { position: absolute; top: 8px; left: 10px; z-index: 3; font-size: 12px; color: #f4f4f6; opacity: 0.85; }
.meta {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 2;
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 12px; font-size: 13px; color: #f4f4f6;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.55));
}
.tier-badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: rgba(255, 255, 255, 0.14); }
.hidden-form { box-shadow: 0 0 0 1px rgba(255, 215, 130, 0.6), 0 0 24px rgba(255, 215, 130, 0.25); }
.hidden-form .art .figure { fill: #fff3d0; }
.hidden-badge {
  position: absolute; top: 8px; right: 8px; z-index: 3;
  font-size: 11px; padding: 3px 8px; border-radius: 999px;
  background: rgba(255, 215, 130, 0.18); color: #ffe2a0;
}
</style>
