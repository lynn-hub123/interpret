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

    <h3>设置</h3>
    <label class="setting">默认方向
      <select :value="settings.direction" @change="setDirection($event.target.value)">
        <option value="zh2en">中 → 英</option>
        <option value="en2zh">英 → 中</option>
      </select>
    </label>
    <label class="setting">计时显示 <input type="checkbox" :checked="settings.showTimer" @change="setShowTimer($event.target.checked)" /></label>
    <label class="setting">深色主题 <input type="checkbox" :checked="settings.theme === 'dark'" @change="setTheme($event.target.checked ? 'dark' : 'light')" /></label>

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
import { stats } from '../lib/records.js'
import { TOPICS } from '../lib/sentences.js'
import { settings, setDirection, setTheme, setShowTimer } from '../stores/settings.js'
import { exportAll, importAll, storageAvailable } from '../lib/storage.js'

const s = stats()
const fileInput = ref(null)
const msg = ref('')

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
    msg.value = importAll(t) ? '导入成功' : '文件格式不对，没有覆盖任何数据'
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
.topic-name { width: 40px; font-size: 13px; }
.bar { flex: 1; height: 10px; border-radius: 999px; overflow: hidden; }
.bar-fill { height: 100%; background: var(--accent); border-radius: 999px; }
.topic-rate { width: 40px; text-align: right; font-size: 12px; color: var(--text-muted); }
.setting { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; font-size: 14px; }
.data-row { display: flex; gap: 12px; }
.msg { font-size: 13px; color: var(--accent-text); }
select { background: var(--surface); color: var(--text); border: none; border-radius: 8px; padding: 6px 10px; box-shadow: var(--shadow-in); }
</style>
