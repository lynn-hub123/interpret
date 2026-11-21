// 硬门禁本地判定：只做规范化与信息槽匹配，不理解语义、不调用模型。
// 规则来源：story 仓 specs/2026-11-14-hard-gate-mechanics-design.md §4

// 缩写展开：先展开再切词，避免撇号被标点清洗吞掉
const CONTRACTIONS = [
  [/\bcan['’]t\b/g, 'cannot'],
  [/\bwon['’]t\b/g, 'will not'],
  [/\bshan['’]t\b/g, 'shall not'],
  [/n['’]t\b/g, ' not'],
  [/\bi['’]m\b/g, 'i am'],
  [/\b(it|that|there|he|she|what|who)['’]s\b/g, '$1 is'],
  [/\b(you|we|they)['’]re\b/g, '$1 are'],
  [/\b(you|we|they|i)['’]ve\b/g, '$1 have'],
  [/\b(you|we|they|he|she|it|i)['’]ll\b/g, '$1 will'],
  [/\b(you|we|they|he|she|it|i)['’]d\b/g, '$1 would'],
  [/\bwanna\b/g, 'want to'],
  [/\bgonna\b/g, 'going to'],
  [/\bgotta\b/g, 'got to']
]

// 规则表只覆盖常见不规则形，不追求全量词法
const IRREGULAR = {
  went: 'go', gone: 'go', going: 'go', goes: 'go',
  said: 'say', says: 'say', told: 'tell', came: 'come', coming: 'come',
  saw: 'see', seen: 'see', seeing: 'see',
  knew: 'know', known: 'know', made: 'make', making: 'make',
  took: 'take', taken: 'take', taking: 'take', gave: 'give', given: 'give', giving: 'give',
  left: 'leave', leaving: 'leave', found: 'find', thought: 'think',
  brought: 'bring', kept: 'keep', heard: 'hear', felt: 'feel', met: 'meet',
  ran: 'run', began: 'begin', begun: 'begin', spoke: 'speak', spoken: 'speak',
  wrote: 'write', written: 'write', stood: 'stand', sat: 'sit',
  paid: 'pay', sent: 'send', spent: 'spend', built: 'build',
  broke: 'break', broken: 'break', chose: 'choose', chosen: 'choose',
  drove: 'drive', driven: 'drive', ate: 'eat', eaten: 'eat',
  fell: 'fall', fallen: 'fall', forgot: 'forget', forgotten: 'forget',
  got: 'get', gotten: 'get', hid: 'hide', hidden: 'hide', held: 'hold',
  lost: 'lose', meant: 'mean', rose: 'rise', risen: 'rise',
  sold: 'sell', sang: 'sing', sung: 'sing', slept: 'sleep', taught: 'teach',
  tore: 'tear', torn: 'tear', threw: 'throw', thrown: 'throw',
  understood: 'understand', woke: 'wake', woken: 'wake', wore: 'wear', worn: 'wear',
  won: 'win', been: 'be', being: 'be', am: 'be', is: 'be', are: 'be', was: 'be', were: 'be',
  has: 'have', had: 'have', having: 'have', does: 'do', did: 'do', done: 'do', doing: 'do'
}

const EN_NUMBERS = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
  seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12',
  thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17',
  eighteen: '18', nineteen: '19', twenty: '20', thirty: '30', forty: '40',
  fifty: '50', sixty: '60', seventy: '70', eighty: '80', ninety: '90',
  hundred: '100', thousand: '1000', dozen: '12', half: '0.5', once: '1', twice: '2'
}

const ZH_NUMBERS = {
  零: '0', 一: '1', 二: '2', 两: '2', 三: '3', 四: '4', 五: '5',
  六: '6', 七: '7', 八: '8', 九: '9', 十: '10', 半: '0.5'
}

const ZH_DIGITS = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
const ZH_UNITS = { 十: 10, 百: 100, 千: 1000, 万: 10000 }
const ZH_NUM_SEQ = /[零一二两三四五六七八九十百千万]+/g

function zhNumberToArabic(seq) {
  let total = 0
  let section = 0
  let num = 0
  for (const ch of seq) {
    if (ch in ZH_DIGITS) {
      num = ZH_DIGITS[ch]
    } else if (ch in ZH_UNITS) {
      const unit = ZH_UNITS[ch]
      if (unit === 10000) {
        section = (section + num) * unit
        total += section
        section = 0
      } else {
        section += (num || 1) * unit
      }
      num = 0
    }
  }
  return total + section + num
}

const NEGATORS = new Set([
  'not', 'no', 'never', 'cannot', 'none', 'nobody', 'nothing', 'nowhere',
  'without', 'nor', 'neither', 'refuse', 'refused', "n't"
])

const ZH_NEGATORS = /[不没別别未无非]/

function expandContractions(text) {
  let out = text
  for (const [re, rep] of CONTRACTIONS) out = out.replace(re, rep)
  return out
}

function deDouble(s) {
  return /([b-df-hj-np-tv-z])\1$/.test(s) ? s.slice(0, -1) : s
}

// 归并词形：只服务 accept 命中，不要求语法正确
export function stem(word) {
  const w = String(word || '').toLowerCase()
  if (!w) return ''
  if (IRREGULAR[w]) return IRREGULAR[w]
  if (w.length <= 3) return w
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y'
  if (w.endsWith('ing') && w.length > 5) return deDouble(w.slice(0, -3))
  if (w.endsWith('ed') && w.length > 4) return deDouble(w.slice(0, -2))
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) return w.slice(0, -1)
  return w
}

// 规范化文本：小写、去标点、缩写展开、数字归一，返回空格分隔的词串
export function normalize(text) {
  let s = String(text || '').toLowerCase()
  s = expandContractions(s)
  s = s.replace(/(\d),(?=\d{3}\b)/g, '$1') // 1,704 → 1704
  s = s.replace(/[’']/g, '')
  s = s.replace(/[^a-z0-9\u4e00-\u9fff\s-]/g, ' ')
  s = s.replace(/[-\s]+/g, ' ').trim()
  const tokens = s.split(' ').filter(Boolean).map(t => {
    if (/\d/.test(t) && !/^[a-z]/.test(t)) return t
    if (EN_NUMBERS[t]) return EN_NUMBERS[t]
    return t.replace(ZH_NUM_SEQ, m => String(zhNumberToArabic(m)))
      .replace(/[半]/g, ZH_NUMBERS['半'])
  })
  return tokens.join(' ')
}

function tokensOf(text) {
  return normalize(text).split(' ').filter(Boolean)
}

// 极性只在同一小句内翻转；返回 negative / positive
export function detectPolarity(text) {
  const raw = String(text || '').toLowerCase()
  const clauses = raw.split(/[,;.!?。，；！？、\n]+/).filter(s => s.trim())
  for (const clause of clauses) {
    const words = expandContractions(clause).replace(/[^a-z0-9\u4e00-\u9fff\s]/g, ' ').split(/\s+/)
    if (words.some(w => NEGATORS.has(w))) return 'negative'
    if (ZH_NEGATORS.test(clause)) return 'negative'
  }
  return 'positive'
}

// accept 短语按词序列连续匹配，逐词做词形归并对齐
function containsPhrase(textTokens, phrase) {
  const want = tokensOf(phrase)
  if (!want.length) return false
  for (let i = 0; i + want.length <= textTokens.length; i++) {
    let ok = true
    for (let j = 0; j < want.length; j++) {
      if (stem(textTokens[i + j]) !== stem(want[j])) { ok = false; break }
    }
    if (ok) return true
  }
  return false
}

function numberHit(value, textTokens) {
  const want = Array.isArray(value) ? value : [value]
  return want.some(v => {
    const norm = normalize(String(v))
    if (!norm) return false
    if (/^\d+(\.\d+)?$/.test(norm)) return textTokens.some(t => t === norm)
    return containsPhrase(textTokens, norm)
  })
}

function slotHit(slot, value, textTokens, raw) {
  if (slot === 'quantity') return numberHit(value, textTokens)
  const list = Array.isArray(value) ? value : [value]
  return list.some(v => {
    const phrase = String(v)
    // 中文 accept 直接按子串比对（本章全为 zh2en，此分支仅兜底）
    if (/[\u4e00-\u9fff]/.test(phrase) && !/^[a-z0-9\s]+$/.test(phrase)) {
      return String(raw).includes(phrase)
    }
    return containsPhrase(textTokens, phrase)
  })
}

// 判定：极性优先，其次逐个必需槽；返回 { pass, failedSlots, polarityReversed, degraded }
export function judge(input, gate) {
  const raw = String(input || '')
  const textTokens = tokensOf(raw)
  const required = (gate && gate.required) || []
  const accept = (gate && gate.accept) || {}
  const out = { pass: true, failedSlots: [], polarityReversed: false, degraded: false }

  if (!textTokens.length) {
    out.pass = false
    out.failedSlots = [...required]
    return out
  }

  if (required.includes('polarity')) {
    const expected = accept.polarity
    const detected = detectPolarity(raw)
    if (expected && detected !== expected) {
      out.pass = false
      out.polarityReversed = true
      out.failedSlots = ['polarity']
      return out
    }
  }

  for (const slot of required) {
    if (slot === 'polarity') continue
    if (!(slot in accept)) { out.degraded = true; continue }
    if (!slotHit(slot, accept[slot], textTokens, raw)) {
      out.pass = false
      out.failedSlots.push(slot)
    }
  }
  return out
}
