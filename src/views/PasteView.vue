<template>
  <main class="view">
    <h2>粘贴开练</h2>
    <p class="hint">随手贴一段文字，自动拆句立刻练</p>
    <textarea v-model="text" class="neu-inset" rows="8" placeholder="把文章、新闻、讲稿……任何文字丢进来"></textarea>
    <p v-if="sentences.length" class="preview">{{ sentences.length }} 句待练</p>
    <p v-if="error" class="error">{{ error }}</p>
    <button class="btn btn-primary" :disabled="!sentences.length" @click="start">开始练习</button>

    <p v-if="dataMsg" class="error">{{ dataMsg }}</p>

    <div v-if="customList.length" class="saved neu-raised">
      <button class="saved-head" @click="toggleExpand">
        <span>已保存 {{ customList.length }} 句</span>
        <span class="saved-arrow">{{ expanded ? '⌃' : '⌄' }}</span>
      </button>
      <div v-if="expanded" class="saved-body">
        <div class="saved-tools">
          <button v-if="managing" class="btn-tool all" @click="toggleAll">{{ allSelected ? '取消全选' : '全选' }}</button>
          <button class="btn-tool manage" @click="toggleManaging">{{ managing ? '完成' : '管理' }}</button>
        </div>
        <ul class="saved-list neu-inset">
          <li v-for="s in shown" :key="s.id" class="saved-item">
            <div class="saved-main" :class="{ pick: managing }" @click="managing && toggleSelect(s.id)">
              <span v-if="managing" class="check" :class="{ on: selected.includes(s.id) }"></span>
              <span class="saved-info">
                <span class="saved-text">{{ textOf(s) }}</span>
                <span class="saved-meta">{{ langOf(s) }} · {{ countOf(s.id) ? `已练 ${countOf(s.id)} 次` : '未练' }}</span>
              </span>
            </div>
            <button v-if="!managing" class="btn-remove" title="删除" @click="removeOne(s.id)">✕</button>
          </li>
        </ul>
        <button v-if="managing" class="btn btn-del" :disabled="!selected.length" @click="removeSelected">删除所选（{{ selected.length }}）</button>
      </div>
    </div>

    <div v-if="undoVisible" class="undo-bar">
      <span>{{ undoMsg }}</span>
      <button class="undo-btn" @click="undo">撤销</button>
    </div>
  </main>
</template>

<script setup>
import { computed, onUnmounted, ref } from 'vue'
import { splitPasteText, addCustomSentences, getCustomSentences, removeCustomSentences, restoreCustomSentences } from '../lib/sentences.js'
import { practiceCounts } from '../lib/records.js'

const text = ref('')
const error = ref('')
const sentences = computed(() => splitPasteText(text.value))

const customList = ref(getCustomSentences())
const expanded = ref(false)
const managing = ref(false)
const selected = ref([])
const counts = ref({})
const dataMsg = ref('')
const undoState = ref(null)
const undoVisible = ref(false)
const undoMsg = ref('')
const UNDO_MS = 6000
let undoTimer = null

const shown = computed(() => [...customList.value].reverse())
const allSelected = computed(() => shown.value.length > 0 && selected.value.length === shown.value.length)

const textOf = s => s.zh || s.en
const langOf = s => (s.zh ? '中' : '英')
const countOf = id => counts.value[id]?.count || 0

function toggleExpand() {
  expanded.value = !expanded.value
  if (!expanded.value) {
    managing.value = false
    selected.value = []
  } else {
    counts.value = practiceCounts()
  }
}

function toggleManaging() {
  managing.value = !managing.value
  selected.value = []
}

function toggleSelect(id) {
  selected.value = selected.value.includes(id)
    ? selected.value.filter(x => x !== id)
    : [...selected.value, id]
}

function toggleAll() {
  selected.value = allSelected.value ? [] : shown.value.map(s => s.id)
}

function showUndo(removed) {
  clearTimeout(undoTimer)
  undoState.value = removed
  undoMsg.value = `已删除 ${removed.length} 句`
  undoVisible.value = true
  undoTimer = setTimeout(() => {
    undoVisible.value = false
    undoState.value = null
  }, UNDO_MS)
}

function removeOne(id) {
  const { removed, persisted } = removeCustomSentences([id])
  if (removed.length === 0) return
  if (!persisted) {
    dataMsg.value = '删除未保存：存储不可用'
    return
  }
  dataMsg.value = ''
  customList.value = getCustomSentences()
  showUndo(removed)
}

function removeSelected() {
  if (!selected.value.length) return
  const { removed, persisted } = removeCustomSentences(selected.value)
  if (!persisted) {
    dataMsg.value = '删除未保存：存储不可用'
    return
  }
  dataMsg.value = ''
  customList.value = getCustomSentences()
  selected.value = []
  managing.value = false
  if (removed.length) showUndo(removed)
}

function undo() {
  if (!undoState.value) return
  restoreCustomSentences(undoState.value)
  customList.value = getCustomSentences()
  clearTimeout(undoTimer)
  undoVisible.value = false
  undoState.value = null
}

onUnmounted(() => clearTimeout(undoTimer))

function start() {
  if (sentences.value.length === 0) { error.value = '没有拆出可练的句子，检查一下内容'; return }
  error.value = ''
  const r = addCustomSentences(sentences.value)
  customList.value = getCustomSentences()
  sessionStorage.setItem('interpret.session', JSON.stringify({ mode: 'paste', persistWarn: !r.persisted }))
  location.hash = '#/'
}
</script>

<style scoped>
h2 { font-size: 20px; }
.hint { font-size: 13px; color: var(--text-muted); }
textarea { width: 100%; border: none; resize: vertical; padding: 14px; font-size: 15px; color: var(--text); font-family: inherit; }
.preview { font-size: 13px; color: var(--accent-text); }
.error { font-size: 13px; color: #e8463a; }
.btn-primary:disabled { opacity: 0.4; }
.saved { margin-top: 16px; padding: 6px; }
.saved-head {
  width: 100%; display: flex; justify-content: space-between; align-items: center;
  background: none; border: none; color: var(--text); font: inherit; font-size: 14px;
  padding: 10px 12px; cursor: pointer; border-radius: 12px;
}
.saved-arrow { color: var(--text-muted); font-size: 13px; }
.saved-body { padding: 0 6px 6px; }
.saved-tools { display: flex; justify-content: flex-end; gap: 4px; margin-bottom: 8px; }
.btn-tool { border: none; background: none; color: var(--accent-text); font: inherit; font-size: 13px; padding: 4px 8px; cursor: pointer; border-radius: 8px; }
.saved-list { list-style: none; margin: 0; padding: 4px; max-height: 40dvh; overflow-y: auto; }
.saved-item { display: flex; align-items: center; gap: 8px; padding: 10px 8px; border-bottom: 1px solid var(--border); }
.saved-item:last-child { border-bottom: none; }
.saved-main { flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; }
.saved-main.pick { cursor: pointer; }
.saved-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.saved-text {
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
  font-size: 14px; line-height: 1.5;
}
.saved-meta { font-size: 12px; color: var(--text-muted); }
.check {
  width: 18px; height: 18px; border-radius: 6px; box-shadow: var(--shadow-in); flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; font-size: 11px; color: var(--accent-text);
}
.check.on::after { content: '✓'; }
.btn-remove { border: none; background: none; color: var(--text-muted); font-size: 14px; padding: 6px 8px; cursor: pointer; border-radius: 8px; }
.btn-del { width: 100%; margin-top: 10px; color: #e8463a; font-size: 14px; }
.btn-del:disabled { opacity: 0.4; }
.undo-bar {
  position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(88px + env(safe-area-inset-bottom)); z-index: 20;
  display: flex; align-items: center; gap: 14px;
  background: var(--surface); border-radius: 999px; padding: 10px 18px;
  box-shadow: var(--shadow-out); font-size: 14px;
}
.undo-btn { border: none; background: none; color: var(--accent-text); font: inherit; font-size: 14px; padding: 0; cursor: pointer; }
</style>
