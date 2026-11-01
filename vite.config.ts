import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
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