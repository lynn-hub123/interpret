<template>
  <main class="view">
    <h2>我的</h2>
    <div class="stat-row">
      <div class="stat neu-raised"><b>{{ s.streakDays }}</b><span>连续天数</span></div>
      <div class="stat neu-raised"><b>{{ s.todayCount }}</b><span>今日句数</span></div>
      <div class="stat neu-raised"><b>{{ s.totalCount }}</b><span>累计句数</span></div>
    </div>

    <h3>主题强弱</h3>
    <p v-if="topics.length === 0" class="hint">练几句就有数据啦</p>
    <div v-for="t in topics" :key="t.id" class="topic-row">
      <span class="topic-name">{{ t.label }}</span>
      <div class="bar neu-inset"><div class="bar-fill" :style="{ width: (t.rate * 100).toFixed(0) + '%' }"></div></div>
      <span class="topic-rate">{{ (t.rate * 100).toFixed(0) }}%</span>
    </div>

    <h3>卡牌图鉴</h3>
    <div class="gallery">
      <div
        v-for="c in cardList" :key="c.id"
        class="gallery-item"
        :class="{ 'is-locked': !hasCard(c.id) }"
        @click="openCard(c)"
      >
        <CardReveal
          :name="c.name" :tier="c.tier" :accent="c.accent"
          :progress="c.st.progress" :hidden="c.st.hidden" :full="c.st.unlocked"
        />
        <span v-if="hasCard(c.id)" class="gallery-progress">{{ c.st.progress }}%</span>
        <span class="slot" :class="{ got: c.st.hidden }">{{ c.st.hidden ? '隐藏形态 ✓' : '隐藏形态 ?' }}</span>
      </div>
    </div>

    <h3>设置</h3>
    <label class="setting">默认方向
      <select :value="settings.direction" @change="setDirection($event.target.value)">
        <option value="zh2en">中 → 英</option>
        <option value="en2zh">英 → 中</option>
      </select>
    </label>
    <label class="setting">计时显示 <input type="checkbox" :checked="settings.showTimer" @change="setShowTimer($event.target.checked)" /></label>
    <label class="setting">深色主题 <input type="checkbox" :checked="settings.theme === 'dark'" @change="setTheme($event.target.checked ? 'dark' : 'light')" /></label>

    <h3>AI 判分配置</h3>
    <div class="ai-form">
      <label class="setting">Base URL <input v-model="ai.baseUrl" placeholder="https://api.openai.com/v1" /></label>
      <label class="setting">模型 <input v-model="ai.model" placeholder="gpt-4o-mini" /></label>
      <label class="setting">API Key <input v-model="ai.apiKey" type="password" placeholder="sk-..." /></label>
      <div class="data-row">
        <button class="btn btn-ai-save" @click="saveAi">保存</button>
        <button class="btn" :disabled="testing" @click="testAi">{{ testing ? '测试中…' : '测试连接' }}</button>
      </div>
      <p class="ai-msg">{{ aiMsg }}</p>
      <p class="hint">密钥只存在本机浏览器，清缓存会丢失；识别文本会发送给你配置的服务商。未配置或调用失败时自动降级为自评。</p>
    </div>

    <h3>数据</h3>
    <div class="data-row">
      <button class="btn" @click="exportData">导出 JSON</button>
      <button class="btn" @click="fileInput.click()">导入 JSON</button>
      <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="importData" />
    </div>
    <p v-if="msg" class="msg">{{ msg }}</p>
  </main>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import CardReveal from '../components/CardReveal.vue'
import { stats } from '../lib/records.js'
import { TOPICS } from '../lib/sentences.js'
import { settings, setDirection, setTheme, setShowTimer } from '../stores/settings.js'
import { exportAll, importAll } from '../lib/storage.js'
import { allCards, getCards, EMPTY_CARD_STATE } from '../lib/cards.js'
import { getAiConfig, saveAiConfig, testConnection } from '../lib/grade.js'

const s = stats()
const fileInput = ref(null)
const msg = ref('')
const router = useRouter()
// 图鉴在页面挂载时读一次；从解锁页回来会重新挂载，自然刷新
const cards = getCards()
const cardList = allCards().map(c => ({ ...c, st: { ...EMPTY_CARD_STATE, ...(cards[c.id] || {}) } }))
const ai = ref(getAiConfig())
const aiMsg = ref('')
const testing = ref(false)

function hasCard(id) {
  return Boolean(cards[id])
}

function openCard(c) {
  if (hasCard(c.id) && !c.st.unlocked) router.push(`/unlock/${c.id}`)
}

function saveAi() {
  aiMsg.value = saveAiConfig(ai.value) ? '已保存（将在下次解锁评分时生效）' : '保存失败：存储不可用'
}

async function testAi() {
  testing.value = true
  const ok = await testConnection(ai.value)
  testing.value = false
  aiMsg.value = ok ? '连接成功' : '连接失败：请检查 Base URL / 模型名 / Key，或网络'
}

const topics = computed(() =>
  Object.entries(s.topicStrength)
    .map(([id, v]) => ({ ...v, id, label: TOPICS.find(t => t.id === id)?.label || id }))
    .sort((a, b) => b.rate - a.rate)
)

function exportData() {
  const blob = new Blob([JSON.stringify(exportAll(), null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `interpret-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

function importData(e) {
  const file = e.target.files?.[0]
  if (!file) return
  file.text().then(t => {
    msg.value = importAll(t) ? '导入成功' : '导入未完成：文件格式不对，或存储空间不足导致部分数据未写入'
  })
  e.target.value = ''
}
</script>

<style scoped>
h2 { font-size: 20px; } h3 { font-size: 15px; margin-top: 24px; }
.stat-row { display: flex; gap: 12px; }
.stat { flex: 1; padding: 14px; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.stat b { font-size: 20px; } .stat span { font-size: 12px; color: var(--text-muted); }
.topic-row { display: flex; align-items: center; gap: 10px; margin: 10px 0; }
.topic-name { width: 56px; font-size: 13px; }
.bar { flex: 1; height: 10px; border-radius: 999px; overflow: hidden; }
.bar-fill { height: 100%; background: var(--accent); border-radius: 999px; }
.topic-rate { width: 40px; text-align: right; font-size: 12px; color: var(--text-muted); }
.setting { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; font-size: 14px; }
.data-row { display: flex; gap: 12px; }
.msg { font-size: 13px; color: var(--accent-text); }
select { background: var(--surface); color: var(--text); border: none; border-radius: 8px; padding: 6px 10px; box-shadow: var(--shadow-in); }
.gallery { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.gallery-item { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.gallery-item.is-locked { opacity: 0.42; }
/* 4 列窄卡里卡面角标会重叠，改用图鉴自身的进度与暗格文字 */
.gallery-item :deep(.pct), .gallery-item :deep(.hidden-badge) { display: none; }
.gallery-progress { font-size: 11px; color: var(--text); }
.slot { font-size: 10px; color: var(--text-muted); white-space: nowrap; }
.slot.got { color: var(--gold-text); }
.ai-form { display: flex; flex-direction: column; gap: 4px; }
.ai-form input {
  background: var(--surface); color: var(--text); border: none; border-radius: 8px;
  padding: 6px 10px; font: inherit; font-size: 13px; box-shadow: var(--shadow-in); min-width: 0;
}
.ai-msg { font-size: 12px; color: var(--accent-text); margin: 6px 0 0; min-height: 16px; }
</style>
