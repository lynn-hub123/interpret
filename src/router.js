import { createRouter, createWebHashHistory } from 'vue-router'
import PracticeView from './views/PracticeView.vue'
import LibraryView from './views/LibraryView.vue'
import PasteView from './views/PasteView.vue'
import MeView from './views/MeView.vue'
import UnlockView from './views/UnlockView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'practice', component: PracticeView },
    { path: '/library', name: 'library', component: LibraryView },
    { path: '/paste', name: 'paste', component: PasteView },
    { path: '/me', name: 'me', component: MeView },
    { path: '/unlock/:id', name: 'unlock', component: UnlockView },
    { path: '/review', redirect: '/' } // 弱项回顾页已下线，旧链接回首页
  ]
})
