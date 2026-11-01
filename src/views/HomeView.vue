<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

/**
 * 第 0 步的落地页，只做一件事：证明「token + /api/auth/me」这条链路是通的。
 * 真正的首页（流水列表）等 P2 的前端一起做。
 */

const router = useRouter()
const auth = useAuthStore()
const loading = ref(true)

onMounted(async () => {
  // 刷新页面后 Pinia 是空的，只剩 localStorage 里的 token。
  // 用 /api/auth/me 把它换回用户资料——这一步走通，说明请求头里的 Bearer token 是对的。
  try {
    await auth.loadMe()
  } catch {
    // 401 时拦截器已经清 token 并跳转，这里再兜一次底
    await router.replace({ name: 'login' })
  } finally {
    loading.value = false
  }
})

async function onLogout(): Promise<void> {
  auth.logout()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <div class="home-page">
    <el-card class="home-card" v-loading="loading">
      <template #header>
        <div class="home-header">
          <span>记账本</span>
          <el-button text type="primary" @click="onLogout">退出登录</el-button>
        </div>
      </template>

      <!-- v-if 让 TS 知道: 这个分支里 auth.user 一定不是 null -->
      <template v-if="auth.user">
        <p class="home-greeting">
          你好，<strong>{{ auth.user.nickname || auth.user.username }}</strong>
        </p>
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="用户名">{{ auth.user.username }}</el-descriptions-item>
          <el-descriptions-item label="当前账本 ID">
            {{ auth.user.currentBookId ?? '未设置' }}
          </el-descriptions-item>
          <el-descriptions-item label="数据来源">
            GET /api/auth/me（页面刷新后仍然能显示，说明 token 持久化生效）
          </el-descriptions-item>
        </el-descriptions>

        <el-alert
          class="home-next"
          type="info"
          :closable="false"
          title="下一步：P2 分类 + 流水接口，然后做「记一笔」和流水列表"
        />
      </template>
    </el-card>
  </div>
</template>

<style scoped>
.home-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.home-card {
  width: 100%;
  max-width: 520px;
}

.home-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.home-greeting {
  margin: 0 0 16px;
  font-size: 18px;
}

.home-next {
  margin-top: 16px;
}
</style>