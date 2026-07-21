import { createRouter, createWebHashHistory } from 'vue-router'
import BoardView from '../views/BoardView.vue'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'board',
      component: BoardView,
    },
  ],
})

export default router
