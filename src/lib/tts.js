// TTS 封装：按语言朗读，同一时刻只播一句（播新先停旧）。
// 依赖全局 speechSynthesis / SpeechSynthesisUtterance，测试中用 vi.stubGlobal 注入 mock。
export function ttsSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function voicesFor(lang) {
  if (!ttsSupported()) return null
  const prefix = lang === 'zh' ? 'zh' : 'en'
  const list = window.speechSynthesis
    .getVoices()
    .filter(v => (v.lang || '').toLowerCase().startsWith(prefix))
  return list[0] || null
}

export function speak(text, lang) {
  if (!ttsSupported()) return false
  const synth = window.speechSynthesis
  cancel()
  const v = voicesFor(lang)
  // 语音列表非空但缺该语言语音包 → 失败；列表为空（Chrome 首次异步加载）→ 交给引擎默认语音
  if (synth.getVoices().length && !v) return false
  const u = new window.SpeechSynthesisUtterance(text)
  u.lang = lang === 'zh' ? 'zh-CN' : 'en-US'
  if (v) u.voice = v
  synth.speak(u)
  return true
}

export function cancel() {
  if (ttsSupported()) window.speechSynthesis.cancel()
}
