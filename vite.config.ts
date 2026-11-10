import vue from '@vitejs/plugin-vue'
// 用 vitest/config 的 defineConfig：它比 vite 的多一个 `test` 段，否则 vite.config 里写 test 会 TS 报错
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // 单测走 happy-dom（够快，不需要真浏览器）；断言放在 src/**/__tests__ 下
  test: {
    environment: 'happy-dom',
    include: ['src/**/__tests__/**/*.spec.ts'],
  },
  server: {
    port: 5173,
    proxy: {
      // 前端代码里只写 /api/xxx，由 Vite 转发到后端 8080。
      // 这样开发期前后端「同源」，不需要后端配 CORS（PLAN §8 第 8 条）。
      // 生产环境用 nginx 做同样的事，前端代码一行都不用改。
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})