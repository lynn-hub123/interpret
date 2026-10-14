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
  const dump = { version: 1, exportedAt: new Date().toISOString(), records: [], custom: [], settings: null }
  dump.records = load('records.v1', [])
  dump.custom = load('custom.v1', [])
  dump.settings = load('settings.v1', null)
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
  save('records.v1', d.records)
  save('custom.v1', d.custom)
  if (d.settings) save('settings.v1', d.settings)
  return true
}
