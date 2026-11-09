import { createRouter, createWebHistory } from 'vue-router'
import { getToken } from '../utils/token'

/**
 * vue-router 的 meta 默认类型是 Record<string, unknown>，
 * 直接用 to.meta.requiresAuth 会被当成 unknown 用不了。
 * 这段 declare module 就是给 meta 补一个字段的类型（TS 的「声明合并」，运行时没有任何代码）。
 */
declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
  }
}

/**
 * 登录后的页面都挂在 AppLayout 下（左侧竖栏 + 顶栏 + 最大 1440 的内容区）。
 * /login、/register、/report/:token 不套布局：前两个是未登录页，最后一个是给同学看的只读公示页。
 */
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../views/RegisterView.vue'),
    },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: () => import('../views/ForgotPasswordView.vue'),
    },
    // 邮件里的链接落在这里：/reset-password?token=xxx（匿名可访问）
    {
      path: '/reset-password',
      name: 'reset-password',
      component: () => import('../views/ResetPasswordView.vue'),
    },
    {
      path: '/',
      component: () => import('../layouts/AppLayout.vue'),
      // 子路由继承父级 meta：不用每条都写一遍
      meta: { requiresAuth: true },
      children: [
        // 默认落在流水页：登录后最常做的就是看流水/记一笔
        { path: '', redirect: { name: 'transactions' } },
        {
          path: 'transactions',
          name: 'transactions',
          component: () => import('../views/TransactionsView.vue'),
        },
        {
          path: 'stats',
          name: 'stats',
          component: () => import('../views/StatsView.vue'),
        },
        {
          path: 'books',
          name: 'books',
          component: () => import('../views/BooksView.vue'),
        },
        {
          path: 'categories',
          name: 'categories',
          component: () => import('../views/CategoriesView.vue'),
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('../views/SettingsView.vue'),
        },
      ],
    },
    // 只读公示页：免登录（后端 /api/public/report/** 是唯一匿名放行的接口）
    {
      path: '/report/:token',
      name: 'public-report',
      component: () => import('../views/PublicReportView.vue'),
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
  // 已登录就不该再看到登录/注册页
  if ((to.name === 'login' || to.name === 'register') && hasToken) {
    return { name: 'transactions' }
  }
  return true
})

export default router