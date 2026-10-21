// 语音识别封装：Web Speech API 单例状态机（Chrome/Edge/Safari 支持，Firefox 无此 API）。
// 识别为会话级：跟录音绑定启停，文字仅供实时展示，不持久化。
// 内部自治重启：静音/单句结束触发 onend 时自动重启，直到手动 stop 或致命错误。
export function speechSupported() {
  return typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

const state = { rec: null, manual: false, netFails: 0 }
let retryTimer = null
const NET_RETRY_LIMIT = 4 // 连续 network 失败达此次数才致命

// handlers = { onFinal(text), onInterim(text), onError(name) }
// 返回 boolean；重复 start 先 abort 旧会话（幂等，避免旧 final 串入新会话）
export function start(lang, handlers) {
  if (!speechSupported()) return false
  stopSession(true)
  state.manual = false
  state.netFails = 0 // 新会话重置网络失败计数
  spawn(lang, handlers, false)
  return true
}

// 手动停止：优雅停（rec.stop），最后半句 final 仍会吐出；不再自动重启
export function stop() {
  stopSession(false)
}

function stopSession(abort) {
  state.manual = true
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
  const rec = state.rec
  state.rec = null
  if (rec) { try { abort ? rec.abort() : rec.stop() } catch { /* 已停止/未启动，忽略 */ } }
}

// 共用重试调度：先清旧定时器保证幂等；触发时已手动停或已有会话则放弃
function scheduleRetry(lang, handlers, delay, isRetry) {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
  retryTimer = setTimeout(() => {
    retryTimer = null
    if (state.manual || state.rec) return
    spawn(lang, handlers, isRetry)
  }, delay)
}

function spawn(lang, handlers, isRetry) {
  let rec
  try {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
    rec = new Ctor()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true
    // onresult 故意不加 stale 守卫：stop() 后末段 final 仍要送达视图层
    rec.onresult = e => {
      state.netFails = 0 // 出结果说明服务连通，重置网络失败计数
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
      if (name === 'network') {
        // 移动网络抖动常见：退避自动重试，连续超限才致命断流
        state.netFails++
        if (state.netFails >= NET_RETRY_LIMIT) {
          state.manual = true
          handlers.onError('network')
          return
        }
        scheduleRetry(lang, handlers, Math.min(500 * 2 ** (state.netFails - 1), 3000), false)
        return
      }
      state.manual = true // 致命：停止重启循环
      handlers.onError(name === 'service-not-allowed' ? 'not-allowed' : name)
    }
    rec.onend = () => {
      if (state.rec !== rec) return // 旧实例不再接管
      state.rec = null
      if (retryTimer) return // 已排定退避重试，交给定时器重启，避免双 spawn
      if (!state.manual) spawn(lang, handlers, false) // 断流自动重启
    }
    state.rec = rec
    rec.start()
  } catch {
    // 部分引擎在 onend 内同步重启会偶发 InvalidStateError：延迟单次重试，仍抛才致命
    state.rec = null
    if (isRetry) { handlers.onError('unknown'); return }
    scheduleRetry(lang, handlers, 250, true)
  }
}
