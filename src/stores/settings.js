import { ref } from 'vue'
import { load, save } from '../lib/storage.js'

const DEFAULTS = { direction: 'zh2en', theme: 'dark', showTimer: false, mode: 'sight' }

export const settings = ref({ ...DEFAULTS })

export function loadSettings() {
  const v = load('settings.v1', {})
  const stored = v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  settings.value = { ...DEFAULTS, ...stored }
  applyTheme()
}

export function saveSettings() {
  return save('settings.v1', { ...settings.value })
}

export function setDirection(v) { settings.value.direction = v; return saveSettings() }
export function setTheme(v) { settings.value.theme = v; applyTheme(); return saveSettings() }
export function setShowTimer(v) { settings.value.showTimer = v; return saveSettings() }

export function setMode(v) {
  if (v !== 'sight' && v !== 'listen') return false
  settings.value.mode = v
  return saveSettings()
}

export function applyTheme() {
  document.documentElement.dataset.theme = settings.value.theme
}
