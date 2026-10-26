// 录音封装：MediaRecorder 状态机。录音仅会话级（浏览器限制，不持久化），
// Blob URL 由调用方负责 revoke。
const state = { recorder: null, stream: null, chunks: [], errorName: '' }

export function recorderSupported() {
  return typeof window !== 'undefined' &&
    typeof window.MediaRecorder === 'function' &&
    !!navigator.mediaDevices?.getUserMedia
}

// 最近一次 startRecording 失败的错误名（NotAllowedError/NotFoundError/NotReadableError…），供 UI 区分提示
export function lastErrorName() {
  return state.errorName
}

export async function startRecording() {
  if (!recorderSupported()) return false
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (e) {
    state.errorName = (e && e.name) || ''
    return false
  }
  state.errorName = ''
  state.chunks = []
  try {
    state.recorder = new MediaRecorder(state.stream)
    state.recorder.ondataavailable = e => { if (e.data && e.data.size) state.chunks.push(e.data) }
    state.recorder.start()
  } catch (e) {
    // 构造或 start 失败时麦克风已授权，必须停掉轨道释放设备，
    // 否则浏览器麦克风指示灯会一直亮着；同时清空状态供下次调用安全覆盖。
    if (state.stream) state.stream.getTracks().forEach(t => t.stop())
    state.recorder = null
    state.stream = null
    state.errorName = (e && e.name) || ''
    return false
  }
  return true
}

export function isRecording() {
  return !!state.recorder && state.recorder.state === 'recording'
}

export function stopRecording() {
  if (!state.recorder) return Promise.resolve(null)
  const rec = state.recorder
  const stream = state.stream
  const chunks = state.chunks
  return new Promise(resolve => {
    rec.onstop = () => {
      stream.getTracks().forEach(t => t.stop()) // 熄灭麦克风指示灯
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
      const url = URL.createObjectURL(blob)
      state.recorder = null; state.stream = null; state.chunks = []
      resolve(url)
    }
    rec.stop()
  })
}

export function revoke(url) {
  URL.revokeObjectURL(url)
}
