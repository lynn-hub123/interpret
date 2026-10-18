// 统一播放入口：内置句优先播预生成音频，缺失/失败回退实时 TTS；自定义句直接 TTS。
// 单例语义与 tts.js 一致：同一时刻只播一个，播新停旧。
import { speak, cancel } from './tts.js'

let current = null // { audio, settle } —— 当前活动播放

function detachAudio(a) {
  if (!a) return
  a.onended = null
  a.onerror = null
  a.pause()
}

// 停止当前播放（幂等）：清理音频、停 TTS、并让等待方收到 'stopped'
export function stop() {
  const c = current
  current = null
  detachAudio(c?.audio)
  cancel()
  if (c) c.settle('stopped')
}

// Promise<'played' | 'stopped' | 'failed'>：正常播完 / 被新播放或 stop() 打断 / 兜底 TTS 也不可用
export function playText({ id, source, text, lang }) {
  stop() // 播新停旧
  return new Promise(resolve => {
    let state = null
    const settle = r => {
      if (!state || state.done) return
      state.done = true
      if (current === state) current = null
      detachAudio(state.audio)
      resolve(r)
    }
    state = { audio: null, done: false, settle }
    current = state // custom 句 TTS 播放期间也要可被 stop()
    // TTS 播放：custom 句直接走此路径；builtin 句音频失败后也落到这里
    const speakFallback = () => {
      const ok = speak(text, lang, () => settle('played'))
      if (!ok) settle('failed')
    }
    if (source !== 'builtin') { speakFallback(); return }
    const audio = new Audio(`${import.meta.env.BASE_URL}audio/${id}.${lang}.mp3`)
    state.audio = audio
    audio.onended = () => settle('played')
    audio.onerror = () => speakFallback()
    audio.play().catch(() => {}) // 播放失败最终会走 onerror，这里只防未处理拒绝
  })
}
