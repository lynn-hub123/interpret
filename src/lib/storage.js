// 本模块是全应用唯一的持久化抽象层（interpret.* 前缀）。
// 契约：同步语义、本地为准；未来账号系统以"本地缓存 + 后台同步"实现，不改变同步签名。
const PREFIX = 'interpret.'

function fullKey(key) {
  return key.startsWith(PREFIX) ? key : PREFIX + key
}

export function storageAvailable() {
  try {
    const k = fullKey('__probe__')
    localStorage.setItem(k, '1')
    localStorage.removeItem(k)
    return true
  } catch {
    return false
  }
}

export function load(key, fallback) {
  try {
    const full = fullKey(key)
    let raw = localStorage.getItem(full)
    let srcKey = full
    if (raw === null && full !== key) {
      raw = localStorage.getItem(key)
      srcKey = key
    }
    if (raw === null) return fallback
    try {
      return JSON.parse(raw)
    } catch {
      try { localStorage.setItem(srcKey + '.corrupt', raw) } catch { /* ignore */ }
      return fallback
    }
  } catch {
    // 存储被禁（隐私模式等）导致读取抛异常时静默降级
    return fallback
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(fullKey(key), JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function exportAll() {
  const dump = { version: 1, exportedAt: new Date().toISOString(), records: [], custom: [], settings: null, srs: null, progress: null, cards: null }
  dump.records = load('records.v1', [])
  dump.custom = load('custom.v1', [])
  dump.settings = load('settings.v1', null)
  dump.srs = load('srs.v1', null)
  dump.progress = load('progress.v1', null)
  dump.cards = load('cards.v1', null)
  // ai.v1 故意不导出：避免备份文件泄露用户密钥
  return dump
}

function isValidDump(d) {
  return d && typeof d === 'object' && Array.isArray(d.records) && Array.isArray(d.custom)
}

export function importAll(payload) {
  let d = payload
  if (typeof payload === 'string') {
    try { d = JSON.parse(payload) } catch { return false }
  }
  if (!isValidDump(d)) return false
  const results = [save('records.v1', d.records), save('custom.v1', d.custom)]
  if (d.settings) results.push(save('settings.v1', d.settings))
  if (d.srs) results.push(save('srs.v1', d.srs))
  if (d.progress) results.push(save('progress.v1', d.progress))
  if (d.cards) results.push(save('cards.v1', d.cards))
  return results.every(Boolean)
}
