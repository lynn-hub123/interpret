import { createRouter, createWebHashHistory } from 'vue-router'
import StoryView from './views/StoryView.vue'

// 旧玩法（题库 / 自由练习 / 手册 / 解锁）暂时挂起：视图文件保留，路由不再指向。
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'story', component: StoryView },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})
