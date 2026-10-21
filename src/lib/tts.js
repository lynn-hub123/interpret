// TTS 封装：按语言朗读，同一时刻只播一句（播新先停旧）。
// 依赖全局 speechSynthesis / SpeechSynthesisUtterance，测试中用 vi.stubGlobal 注入 mock。
export function ttsSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

// 优选在线自然语音：Edge 的 Natural 语音最自然，其次 Chrome 的 Google 在线语音，
// 都没有时回退第一个本地语音。
export function voicesFor(lang) {
  if (!ttsSupported()) return null
  const prefix = lang === 'zh' ? 'zh' : 'en'
  const list = window.speechSynthesis
    .getVoices()
    .filter(v => (v.lang || '').toLowerCase().startsWith(prefix))
  if (!list.length) return null
  return list.find(v => /natural/i.test(v.name)) || list.find(v => /google/i.test(v.name)) || list[0]
}

export function speak(text, lang, onend, rate = 1) {
  if (!ttsSupported()) return false
  const synth = window.speechSynthesis
  cancel()
  const v = voicesFor(lang)
  // 语音列表非空但缺该语言语音包 → 失败；列表为空（Chrome 首次异步加载）→ 交给引擎默认语音
  if (synth.getVoices().length && !v) return false
  const u = new window.SpeechSynthesisUtterance(text)
  u.lang = lang === 'zh' ? 'zh-CN' : 'en-US'
  if (v) u.voice = v
  u.rate = rate
  if (onend) u.onend = onend
  synth.speak(u)
  return true
}

export function cancel() {
  if (ttsSupported()) window.speechSynthesis.cancel()
}
