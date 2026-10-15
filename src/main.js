import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router.js'
import { loadSettings } from './stores/settings.js'
import './styles/main.css'

import { registerSW } from 'virtual:pwa-register'

loadSettings()
const app = createApp(App)
app.use(router)
app.mount('#app')

const updateSW = registerSW({
  onNeedRefresh() {
    const bar = document.createElement('div')
    bar.textContent = '有新版本，点击刷新'
    bar.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#32f08c;color:#062d18;padding:10px 18px;border-radius:999px;font-size:14px;cursor:pointer;z-index:99'
    bar.onclick = () => updateSW(true)
    document.body.appendChild(bar)
  }
})
