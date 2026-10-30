<template>
  <div class="onboard-overlay">
    <div class="onboard-panel neu-raised" :data-step="index">
      <div class="mascot">
        <LingSprite :size="96" />
        <span class="mascot-sub">寄居蟹 铃 · 壳里是一块停摆的怀表</span>
      </div>

      <p class="step-kicker">{{ step.kicker }}</p>
      <h3 class="step-title">{{ step.title }}</h3>
      <p class="step-body">{{ step.body }}</p>
      <ul v-if="step.rules" class="step-rules">
        <li v-for="r in step.rules" :key="r">{{ r }}</li>
      </ul>
      <p class="step-quote">{{ step.quote }}</p>

      <div class="dots" aria-hidden="true">
        <span v-for="(s, i) in steps" :key="s.kicker" class="dot" :class="{ on: i === index }" />
      </div>

      <div class="actions">
        <button class="btn" @click="emit('done')">跳过</button>
        <button class="btn btn-primary" @click="advance">{{ last ? '开始' : '下一步' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import LingSprite from './LingSprite.vue'

const emit = defineEmits(['done'])

const steps = [
  {
    kicker: '一 · 汐洲',
    title: '每年退潮七天',
    body: '这片大陆被一圈内海围住，叫环汐。退潮那七天，海底的沉城会露出来。三百年前，它是自己沉下去的；每次露出一点，都是那一夜的一部分。',
    quote: '铃：第一次下海的人都会问，城为什么在下面。我到现在也没答上来。'
  },
  {
    kicker: '二 · 你的活',
    title: '把海底的话带上来',
    body: '你是拾潮人的学徒。海底的话你听得见，但岸上的人听不懂，得你一字一句说出来。',
    rules: [
      '中 → 英：替你自己说',
      '英 → 中：替别人说',
      '每练 5 句攒一张券，在海底能遇见别的人'
    ],
    quote: '铃：说准了，我壳里的表会动一下。'
  },
  {
    kicker: '三 · 规矩',
    title: '下海前的两条禁忌',
    body: '这两条是守滩的老妇人教的。信不信由你，破了规矩的人，去年都没怎么上来。',
    rules: [
      '在下面别说自己的名字。水最先拿走的就是名字。',
      '听见背后有人喊你，继续走，别回头。'
    ],
    quote: '铃：你师父下水那天，把表留给了我。他说潮水转之前会回来。'
  }
]

const index = ref(0)
const step = computed(() => steps[index.value])
const last = computed(() => index.value === steps.length - 1)

function advance() {
  if (last.value) emit('done')
  else index.value += 1
}
</script>

<style scoped>
.onboard-overlay {
  position: fixed; inset: 0; z-index: 70;
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.66);
  backdrop-filter: blur(6px);
}
.onboard-panel {
  width: min(430px, 92vw); max-height: 86vh; overflow-y: auto;
  padding: 20px; display: flex; flex-direction: column; gap: 10px;
}
.mascot {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding-bottom: 12px; border-bottom: 1px dashed var(--border);
}
.mascot :deep(.ling-sprite) {
  background: var(--surface-deep); border: 1px solid var(--border);
  border-radius: 4px; padding: 10px;
}
.mascot-sub { font-size: 12px; color: var(--text-muted); }
.step-kicker { margin: 0; font-size: 12px; color: var(--accent-text); }
.step-title { margin: 0; font-size: 19px; }
.step-body { margin: 0; font-size: 15px; line-height: 1.7; }
.step-rules { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; font-size: 14px; line-height: 1.6; }
.step-quote { margin: 2px 0 0; font-size: 13px; line-height: 1.6; color: var(--text-muted); }
.dots { display: flex; gap: 6px; justify-content: center; margin: 4px 0; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--border); }
.dot.on { background: var(--accent-text); }
.actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 2px; }
.actions .btn:first-child { font-size: 13px; opacity: 0.7; }
</style>
