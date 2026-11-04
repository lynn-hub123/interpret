import { createRouter, createWebHashHistory } from 'vue-router'
import PracticeView from './views/PracticeView.vue'
import FreePracticeView from './views/FreePracticeView.vue'
import MeView from './views/MeView.vue'
import UnlockView from './views/UnlockView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'practice', component: PracticeView },
    { path: '/free', name: 'free', component: FreePracticeView },
    { path: '/me', name: 'me', component: MeView },
    { path: '/unlock/:id', name: 'unlock', component: UnlockView },
    { path: '/library', redirect: '/free' },
    { path: '/paste', redirect: '/free' },
    { path: '/review', redirect: '/' }
  ]
})
