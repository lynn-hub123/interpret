<template>
  <div class="story-shell">
    <div class="window">
      <div class="screen">
        <span class="corner tl"></span>
        <span class="corner tr"></span>
        <span class="corner bl"></span>
        <span class="corner br"></span>

        <!-- 场景界面：四行台词压在下三分之一 -->
        <div
          v-if="phase === 'intro'"
          class="stage"
          role="button"
          tabindex="0"
          aria-label="进入对话"
          @click="enterChat"
          @keydown.enter="enterChat"
          @keydown.space.prevent="enterChat"
        >
          <div class="art" aria-hidden="true">
            <div class="art-wall"></div>
            <div class="art-mirror"></div>
            <div class="art-door"><i class="art-gap"></i></div>
            <div class="art-floor">
              <i v-for="n in 5" :key="n" class="art-step"></i>
            </div>
          </div>
          <header class="stage-head">
            <span class="stage-ch">{{ chapter.title }}</span>
            <span class="stage-place">{{ scene.place }}</span>
            <span class="stage-time">{{ scene.time }}</span>
          </header>
          <div class="caption">
            <p v-for="(line, i) in scene.caption" :key="i">{{ line }}</p>
          </div>
          <span class="advance" aria-hidden="true">
            <PixelIcon name="play" :size="16" />
          </span>
        </div>

        <!-- 聊天界面 -->
        <template v-else-if="phase === 'chat'">
          <header class="head">
            <span class="head-place">{{ scene.place }}</span>
            <span class="head-time">{{ scene.time }}</span>
          </header>

          <div ref="streamEl" class="stream" :key="scene.id" @click="flush">
            <template v-for="m in log" :key="m.uid">
              <p v-if="m.kind === 'narration'" class="narration">{{ m.text }}</p>

              <p v-else-if="m.kind === 'divider'" class="divider">
                <span class="d-title">{{ m.title }}</span>
                <span class="d-time">{{ m.time }}</span>
              </p>

              <div v-else-if="m.kind === 'npc'" class="msg npc">
                <div class="msg-head">
                  <span class="name">{{ m.name }}</span>
                  <span class="stamp">{{ m.time }}</span>
                  <button
                    v-if="canSpeak"
                    class="tts"
                    type="button"
                    :aria-label="speakingId === m.uid ? '停止朗读' : '朗读'"
                    @click.stop="speak(m)"
                  >
                    <PixelIcon :name="speakingId === m.uid ? 'stop' : 'play'" :size="16" />
                  </button>
                </div>
                <p class="en">{{ m.text }}</p>
              </div>

              <div v-else-if="m.kind === 'player'" class="msg me">
                <p class="en">{{ m.text }}</p>
              </div>

              <div v-else-if="m.kind === 'event'" class="card">
                <span class="card-title">{{ m.card.title }}</span>
                <p class="card-body">{{ m.card.body }}</p>
                <span class="card-meta">{{ m.card.meta }}</span>
              </div>
            </template>

            <div v-if="typing" class="typing" :class="typing" aria-hidden="true">
              <i></i><i></i><i></i>
            </div>
          </div>

          <StoryComposer
            v-if="currentPlayer"
            :key="currentPlayer.id"
            :beat="currentPlayer"
            @commit="onCommit"
          />
        </template>

        <!-- 章末 -->
        <div v-else class="end">
          <span class="end-ch">{{ chapter.title }}</span>
          <span class="end-mark">完</span>
          <p class="end-line">雨还在下。</p>
          <button class="end-btn" type="button" @click="restart">从头再看</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PixelIcon from '../components/PixelIcon.vue'
import StoryComposer from '../components/StoryComposer.vue'
import { playText, stop as voiceStop } from '../lib/voice.js'
import { ttsSupported } from '../lib/tts.js'
import {
  chapter, scenes, speakers, speakerName, lineText,
  loadStoryState, saveStoryState, resetStoryState
} from '../lib/story.js'

const phase = ref(scenes[0].presentation === 'scene' ? 'intro' : 'chat')
const sceneIdx = ref(0)
const cursor = ref(0)
const log = ref([])
const flags = ref({})
const composing = ref(false)
const typing = ref('')
// 同一场连续没听懂的次数：三次后不再反应，剧情照常推进
const misheard = ref(0)
const speakingId = ref('')
const streamEl = ref(null)
const canSpeak = ttsSupported()

let timer = null
let sceneDone = false
let seq = 0

// 回合等待：对方打字 900ms，旁白停顿 620ms
const TYPING_NPC = 900
const TYPING_CUE = 620

const scene = computed(() => scenes[sceneIdx.value])
const currentBeat = computed(() => scene.value.beats[cursor.value] || null)
const currentPlayer = computed(() =>
  phase.value === 'chat' && composing.value && currentBeat.value?.kind === 'player'
    ? currentBeat.value
    : null
)

function uid() {
  seq += 1
  return `local-${seq}`
}

function clearTimer() {
  if (timer) { clearTimeout(timer); timer = null }
}

function save() {
  saveStoryState({
    scene: sceneIdx.value,
    cursor: cursor.value,
    phase: phase.value,
    flags: flags.value,
    log: log.value
  })
}

function toMessage(beat) {
  if (beat.kind === 'npc') {
    return {
      kind: 'npc',
      uid: beat.id,
      speaker: beat.speaker,
      name: speakerName(beat.speaker),
      text: lineText(beat),
      time: scene.value.time
    }
  }
  if (beat.kind === 'event') {
    return { kind: 'event', uid: beat.id, event: beat.event, card: beat.card }
  }
  return { kind: beat.kind, uid: beat.id, text: beat.text }
}

function pushBeat(beat) {
  log.value.push(toMessage(beat))
  cursor.value += 1
  save()
}

function pump() {
  clearTimer()
  if (phase.value !== 'chat' || sceneDone) return
  const beat = currentBeat.value
  if (!beat) { finishScene(); return }
  if (beat.kind === 'player') {
    composing.value = true
    typing.value = ''
    save()
    return
  }
  // 对方回合先出三点，旁白也留同样的等待，不瞬间铺满
  typing.value = beat.kind === 'npc' ? 'npc' : 'cue'
  timer = setTimeout(() => {
    timer = null
    typing.value = ''
    pushBeat(beat)
    pump()
  }, beat.kind === 'npc' ? TYPING_NPC : TYPING_CUE)
}

function flush() {
  if (phase.value !== 'chat' || sceneDone) return
  clearTimer()
  typing.value = ''
  while (phase.value === 'chat') {
    const beat = currentBeat.value
    if (!beat) { finishScene(); return }
    if (beat.kind === 'player') {
      composing.value = true
      save()
      return
    }
    pushBeat(beat)
  }
}

function finishScene() {
  if (sceneDone) return
  sceneDone = true
  composing.value = false
  typing.value = ''
  clearTimer()
  if (sceneIdx.value + 1 < scenes.length) {
    timer = setTimeout(nextScene, 800)
  } else {
    phase.value = 'end'
    save()
  }
}

function nextScene() {
  clearTimer()
  sceneDone = false
  sceneIdx.value += 1
  cursor.value = 0
  misheard.value = 0
  const next = scenes[sceneIdx.value]
  if (next.presentation === 'scene') {
    phase.value = 'intro'
    save()
    return
  }
  phase.value = 'chat'
  log.value.push({ kind: 'divider', uid: `div-${next.id}`, title: next.title, time: next.time })
  save()
  pump()
}

function enterChat() {
  if (phase.value !== 'chat') {
    phase.value = 'chat'
    save()
  }
  pump()
}

function onCommit(payload) {
  const beat = currentBeat.value
  if (!beat || beat.kind !== 'player') return

  if (payload.silent) {
    const flag = beat.gate?.failEffect?.flag
    if (flag) flags.value = { ...flags.value, [flag]: true }
    log.value.push({ kind: 'narration', uid: uid(), text: '你没有开口。' })
  } else {
    log.value.push({ kind: 'player', uid: uid(), text: payload.text })
    if (payload.read) {
      flags.value = { ...flags.value, read_reference: true }
      misheard.value = 0
    } else if (payload.heard === false) {
      reactToMisheard()
    } else {
      misheard.value = 0
    }
  }

  cursor.value += 1
  composing.value = false
  save()
  pump()
}

// 没听懂时只让对面回一句，不设分数、不拦推进
function reactToMisheard() {
  if (misheard.value >= 3) return
  const id = nextSpeaker()
  const lines = speakers[id]?.misheard || []
  if (!lines.length) return
  log.value.push({
    kind: 'npc',
    uid: uid(),
    speaker: id,
    name: speakerName(id),
    text: lines[misheard.value % lines.length],
    time: scene.value.time
  })
  misheard.value += 1
}

function nextSpeaker() {
  const beats = scene.value.beats
  for (let i = cursor.value; i < beats.length; i++) {
    if (beats[i].kind === 'npc' && beats[i].speaker) return beats[i].speaker
  }
  for (let i = cursor.value - 1; i >= 0; i--) {
    if (beats[i].kind === 'npc' && beats[i].speaker) return beats[i].speaker
  }
  return 'zhou_yan'
}

function restart() {
  resetStoryState()
  clearTimer()
  sceneDone = false
  seq = 0
  sceneIdx.value = 0
  cursor.value = 0
  log.value = []
  flags.value = {}
  composing.value = false
  typing.value = ''
  misheard.value = 0
  phase.value = scenes[0].presentation === 'scene' ? 'intro' : 'chat'
  if (phase.value === 'chat') pump()
}

async function speak(m) {
  if (speakingId.value === m.uid) {
    voiceStop()
    speakingId.value = ''
    return
  }
  speakingId.value = m.uid
  await playText({ source: 'custom', text: m.text, lang: 'en-US' })
  if (speakingId.value === m.uid) speakingId.value = ''
}

function scrollToEnd() {
  const el = streamEl.value
  if (el) el.scrollTop = el.scrollHeight
}

watch(
  [() => log.value.length, () => composing.value, () => typing.value, phase],
  scrollToEnd,
  { flush: 'post' }
)

onMounted(() => {
  const saved = loadStoryState()
  if (saved && Number.isInteger(saved.scene) && saved.scene >= 0 && saved.scene < scenes.length) {
    sceneIdx.value = saved.scene
    cursor.value = Number.isInteger(saved.cursor) ? saved.cursor : 0
    flags.value = saved.flags && typeof saved.flags === 'object' ? saved.flags : {}
    log.value = saved.log
    if (saved.phase === 'end') { phase.value = 'end'; return }
    if (saved.phase === 'intro') { phase.value = 'intro'; return }
    phase.value = 'chat'
    if (!currentBeat.value) finishScene()
    else if (currentBeat.value.kind === 'player') { composing.value = true; scrollToEnd() }
    else pump()
    return
  }
  if (phase.value === 'chat') pump()
})

onBeforeUnmount(() => {
  clearTimer()
  voiceStop()
})
</script>

<style>
.story-shell {
  --font-cn: system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  --font-px: ui-monospace, SFMono-Regular, Consolas, 'Courier New', monospace;
  --story-bg: #0A0812;
  --story-input: #100D18;
  --story-panel: #17141F;
  --story-frame: #171420;
  --story-line: #2B2A3A;
  --story-axis: #3A3550;
  --story-text: #C4BED6;
  --story-dim: #8A84A0;
  --story-faint: #55506B;
  --story-bright: #DCD6EC;
  --story-light: #F2EFFB;
  --story-rose: #9A4E68;
  --story-rose-soft: #C08FA2;
  --story-key: #1B1726;
  --story-key-edge: #453E5A;

  min-height: 100dvh;
  display: flex;
  justify-content: center;
  background: #08070E;
  font-family: var(--font-cn);
}
</style>

<style scoped>
.window {
  width: min(100vw, 480px);
  height: 100dvh;
  padding: 16px 12px 12px;
  background: var(--story-frame);
  display: flex;
}
.screen {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--story-bg);
  box-shadow: inset 0 0 0 4px #0D0A15;
  overflow: hidden;
}

/* 构件式遮挡：四角被窗框吃掉，留一个 12px 台阶 */
.corner {
  position: absolute;
  width: 24px;
  height: 24px;
  background: var(--story-frame);
  z-index: 6;
  pointer-events: none;
}
.corner::after {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  background: var(--story-bg);
}
.corner.tl { top: 0; left: 0; }
.corner.tl::after { right: 0; bottom: 0; }
.corner.tr { top: 0; right: 0; }
.corner.tr::after { left: 0; bottom: 0; }
.corner.bl { bottom: 0; left: 0; }
.corner.bl::after { right: 0; top: 0; }
.corner.br { bottom: 0; right: 0; }
.corner.br::after { left: 0; top: 0; }

/* 场景界面 */
.stage {
  position: absolute;
  inset: 0;
  overflow: hidden;
  cursor: pointer;
  outline: none;
}
.art { position: absolute; inset: 0; }
.art-wall { position: absolute; inset: 0; background: #14121C; }
.art-mirror {
  position: absolute;
  left: 12%;
  top: 16%;
  width: 18%;
  height: 22%;
  background: #1A1724;
  box-shadow: 0 0 0 1px #2B2A3A;
}
.art-door {
  position: absolute;
  right: 16%;
  bottom: 40%;
  width: 34%;
  height: 34%;
  background: #2B2A3A;
}
.art-gap {
  position: absolute;
  left: 0;
  top: 8%;
  bottom: 0;
  width: 2px;
  background: var(--story-light);
}
.art-floor {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 60%;
  background: #1E1B28;
  border-top: 1px solid #3A3550;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}
.art-step { display: block; height: 10px; background: #262233; margin-bottom: 12px; }
.art-step:nth-child(2) { margin-left: 12%; }
.art-step:nth-child(3) { margin-left: 24%; }
.art-step:nth-child(4) { margin-left: 36%; }
.art-step:nth-child(5) { margin-left: 48%; }

.stage-head {
  position: absolute;
  top: 24px;
  left: 20px;
  right: 20px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stage-ch { font-size: 17px; line-height: 26px; color: var(--story-text); }
.stage-place { font-size: 17px; line-height: 26px; color: var(--story-dim); }
.stage-time {
  font-family: var(--font-px);
  font-size: 24px;
  line-height: 32px;
  color: var(--story-faint);
}

.caption {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 34%;
  padding: 20px 20px calc(20px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  background: linear-gradient(to bottom, rgba(8, 7, 14, 0) 0, rgba(8, 7, 14, 0) 10%, #08070E 10%, #08070E 100%);
}
.caption p {
  margin: 0;
  font-size: 17px;
  line-height: 26px;
  color: var(--story-text);
}
.advance {
  position: absolute;
  right: 40px;
  bottom: calc(30px + env(safe-area-inset-bottom));
  color: var(--story-rose-soft);
}

/* 顶栏 */
.head {
  flex-shrink: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--story-line);
}
.head-place {
  font-size: 17px;
  line-height: 26px;
  color: var(--story-text);
  min-width: 0;
}
.head-time {
  font-family: var(--font-px);
  font-size: 24px;
  line-height: 32px;
  color: var(--story-dim);
  flex-shrink: 0;
}

/* 消息流 */
.stream {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 20px 16px;
  scroll-behavior: auto;
  animation: enter 160ms steps(2, end);
  scrollbar-width: thin;
  scrollbar-color: var(--story-line) transparent;
}
.stream::-webkit-scrollbar { width: 4px; }
.stream::-webkit-scrollbar-track { background: transparent; }
.stream::-webkit-scrollbar-thumb { background: var(--story-line); border-radius: 0; }

/* 逐条入场：位移推入，不淡入淡出，不做平滑缓动 */
.narration, .divider, .msg, .card { animation: enter 160ms steps(2, end); }
@keyframes enter {
  from { transform: translateX(16px); }
  to { transform: translateX(0); }
}

.narration {
  margin: 16px 0;
  font-size: 17px;
  line-height: 26px;
  color: var(--story-text);
}
.divider {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin: 16px 0 12px;
  padding-top: 12px;
  border-top: 1px solid var(--story-line);
  font-size: 17px;
  color: var(--story-dim);
}
.d-time {
  font-family: var(--font-px);
  font-size: 24px;
  color: var(--story-faint);
}

.msg { margin: 12px 0; }
.msg-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 4px;
}
.name { font-size: 17px; line-height: 26px; color: var(--story-text); }
.stamp {
  font-family: var(--font-px);
  font-size: 24px;
  line-height: 26px;
  color: var(--story-faint);
}
.tts {
  margin-left: auto;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid var(--story-line);
  border-radius: 0;
  color: var(--story-rose-soft);
  cursor: pointer;
}
.npc {
  background: #14111D;
  border-left: 2px solid var(--story-line);
  padding: 8px 12px;
}
.en {
  margin: 0;
  font-family: var(--font-cn);
  font-size: 17px;
  line-height: 26px;
  color: #BEB7D2;
  white-space: pre-wrap;
  word-break: break-word;
}
.me { display: flex; justify-content: flex-end; }
.me .en {
  max-width: 86%;
  background: #1E1A2A;
  padding: 8px 12px;
  color: var(--story-bright);
}

.card {
  margin: 16px 0;
  padding: 12px;
  border: 1px dashed var(--story-rose);
}
.card-title { display: block; font-size: 17px; line-height: 26px; color: var(--story-bright); }
.card-body { margin: 6px 0 0; font-size: 17px; line-height: 26px; color: var(--story-text); }
.card-meta { display: block; margin-top: 6px; font-size: 17px; line-height: 26px; color: var(--story-rose-soft); }

/* 等待：对方回合三点，旁白一个光标块 */
.typing {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  margin: 12px 0;
}
.typing i {
  display: block;
  width: 4px;
  height: 4px;
  background: var(--story-dim);
  animation: dot 600ms steps(1, end) infinite;
}
.typing i:nth-child(2) { animation-delay: 120ms; }
.typing i:nth-child(3) { animation-delay: 240ms; }
.typing.cue i { width: 4px; height: 16px; }
.typing.cue i:nth-child(n+2) { display: none; }
@keyframes dot {
  0%, 49% { opacity: 0.2; }
  50%, 100% { opacity: 1; }
}

/* 章末 */
.end {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 12px;
  padding: 0 32px;
  background: var(--story-bg);
}
.end-ch { font-size: 17px; line-height: 26px; color: var(--story-dim); }
.end-mark {
  font-family: var(--font-px);
  font-size: 48px;
  line-height: 56px;
  color: var(--story-bright);
}
.end-line { margin: 0; font-size: 17px; line-height: 26px; color: var(--story-text); }
.end-btn {
  margin-top: 16px;
  padding: 8px 16px;
  background: var(--story-panel);
  border: 1px solid var(--story-line);
  border-radius: 0;
  color: var(--story-text);
  font-family: var(--font-cn);
  font-size: 17px;
  cursor: pointer;
}

@media (prefers-reduced-motion: reduce) {
  .advance { animation: none; }
  .stream, .narration, .divider, .msg, .card { animation: none; }
  .typing i { animation: none; }
  :deep(*) { transition: none !important; }
}
</style>
