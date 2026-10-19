// 语音识别封装：Web Speech API 单例状态机（Chrome/Edge/Safari 支持，Firefox 无此 API）。
// 识别为会话级：跟录音绑定启停，文字仅供实时展示，不持久化。
// 内部自治重启：静音/单句结束触发 onend 时自动重启，直到手动 stop 或致命错误。
export function speechSupported() {
  return typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

const state = { rec: null, manual: false }

// handlers = { onFinal(text), onInterim(text), onError(name) }
// 返回 boolean；重复 start 先 abort 旧会话（幂等，避免旧 final 串入新会话）
export function start(lang, handlers) {
  if (!speechSupported()) return false
  stopSession(true)
  state.manual = false
  spawn(lang, handlers)
  return true
}

// 手动停止：优雅停（rec.stop），最后半句 final 仍会吐出；不再自动重启
export function stop() {
  stopSession(false)
}

function stopSession(abort) {
  state.manual = true
  const rec = state.rec
  state.rec = null
  if (rec) { try { abort ? rec.abort() : rec.stop() } catch { /* 已停止/未启动，忽略 */ } }
}

function spawn(lang, handlers) {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
  const rec = new Ctor()
  rec.lang = lang
  rec.continuous = true
  rec.interimResults = true
  rec.onresult = e => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      if (r.isFinal) handlers.onFinal(r[0].transcript)
      else handlers.onInterim(r[0].transcript)
    }
  }
  rec.onerror = e => {
    if (state.rec !== rec) return // 已被新会话顶替的旧实例，静默
    const name = (e && e.error) || ''
    if (name === 'no-speech' || name === 'aborted') return // 瞬态：交给 onend 决定重启
    state.manual = true // 致命：停止重启循环
    handlers.onError(name === 'service-not-allowed' ? 'not-allowed' : name)
  }
  rec.onend = () => {
    if (state.rec !== rec) return // 旧实例不再接管
    state.rec = null
    if (!state.manual) spawn(lang, handlers) // 断流自动重启
  }
  state.rec = rec
  try {
    rec.start()
  } catch {
    stopSession(true) // start 抛错（状态非法等）：按致命收场
    handlers.onError('unknown')
  }
}
