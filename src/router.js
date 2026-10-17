import { createRouter, createWebHashHistory } from 'vue-router'
import PracticeView from './views/PracticeView.vue'
import LibraryView from './views/LibraryView.vue'
import PasteView from './views/PasteView.vue'
import MeView from './views/MeView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'practice', component: PracticeView },
    { path: '/library', name: 'library', component: LibraryView },
    { path: '/paste', name: 'paste', component: PasteView },
    { path: '/me', name: 'me', component: MeView }
  ]
})
