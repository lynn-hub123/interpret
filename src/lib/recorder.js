// 录音封装：MediaRecorder 状态机。录音仅会话级（浏览器限制，不持久化），
// Blob URL 由调用方负责 revoke。
const state = { recorder: null, stream: null, chunks: [] }

export function recorderSupported() {
  return typeof window !== 'undefined' &&
    typeof window.MediaRecorder === 'function' &&
    !!navigator.mediaDevices?.getUserMedia
}

export async function startRecording() {
  if (!recorderSupported()) return false
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    return false // 不支持或权限被拒
  }
  state.chunks = []
  state.recorder = new MediaRecorder(state.stream)
  state.recorder.ondataavailable = e => { if (e.data && e.data.size) state.chunks.push(e.data) }
  state.recorder.start()
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
