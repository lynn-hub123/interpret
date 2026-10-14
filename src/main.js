import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router.js'
import { loadSettings } from './stores/settings.js'
import './styles/main.css'

loadSettings()
createApp(App).use(router).mount('#app')
