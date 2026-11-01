import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import './style.css'
import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia()) // 状态管理：登录态放在 stores/auth.ts
app.use(router) // 路由：未登录由 router/index.ts 的守卫拦到 /login
app.use(ElementPlus, { locale: zhCn }) // 组件库：日期选择器等组件默认中文

app.mount('#app')