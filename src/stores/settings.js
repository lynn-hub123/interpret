import { ref } from 'vue'
import { load, save } from '../lib/storage.js'

const DEFAULTS = { direction: 'zh2en', theme: 'dark', showTimer: false }

export const settings = ref({ ...DEFAULTS })

export function loadSettings() {
  settings.value = { ...DEFAULTS, ...load('settings.v1', {}) }
  applyTheme()
}

export function saveSettings() {
  save('settings.v1', { ...settings.value })
}

export function setDirection(v) { settings.value.direction = v; saveSettings() }
export function setTheme(v) { settings.value.theme = v; saveSettings(); applyTheme() }
export function setShowTimer(v) { settings.value.showTimer = v; saveSettings() }

export function applyTheme() {
  document.documentElement.dataset.theme = settings.value.theme
}
