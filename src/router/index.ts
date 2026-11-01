import { createRouter, createWebHistory } from 'vue-router'
import { getToken } from '../utils/token'

/**
 * vue-router 的 meta 默认类型是 Record<string, unknown>，
 * 直接读 to.meta.requiresAuth 会被当成 unknown 用不了。
 * 这段 declare module 就是给 meta 补一个字段的类型（TS 的「声明合并」，运行时没有任何代码）。
 */
declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
    },
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
      meta: { requiresAuth: true },
    },
    // 兜底：访问不存在的路径回首页（首页未登录会被下面的守卫送去登录页）
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

/**
 * 全局前置守卫。只做「有没有 token」的粗判断：
 * token 是否真的有效由后端说了算（无效 token 会被 401，拦截器再跳回登录页）。
 * 前端解析 JWT 判断过期是多余且不可信的——签名验证只能在服务端做。
 */
router.beforeEach((to) => {
  const hasToken = getToken() !== null
  if (to.meta.requiresAuth && !hasToken) {
    return { name: 'login' }
  }
  if (to.name === 'login' && hasToken) {
    return { name: 'home' }
  }
  return true
})

export default router