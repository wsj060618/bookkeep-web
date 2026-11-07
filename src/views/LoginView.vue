<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useAuthStore } from '../stores/auth'
import { emailFormatRule } from '../utils/validate'

/**
 * 第 0 步唯一的页面：登录。
 * 验收链路：填账号密码 → POST /api/auth/login 拿 token → 存起来 →
 *           GET /api/auth/me 带上 token → 首页显示后端返回的昵称。
 */

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const formRef = ref<FormInstance>()
const submitting = ref(false)

const form = reactive({
  // 注册页「邮箱已注册」时会带 query 跳过来，省得再输一遍
  email: String(route.query.email ?? ''),
  password: '',
})

const rules: FormRules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    emailFormatRule,
  ],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function onSubmit(): Promise<void> {
  if (!formRef.value) return

  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  // 单飞：连点时只发一次请求。后端注册接口非幂等（PLAN §8 第 15 条），登录同理没必要重复打
  if (submitting.value) return
  submitting.value = true
  try {
    const resp = await auth.login(form.email, form.password)
    // 登录响应里已经带了 user，这里再请求一次 /me 是**故意的**：
    // 第 0 步要验收的是「token 真的能带在后续请求上」，而不是「页面能显示名字」
    await auth.loadMe()
    ElMessage.success(`欢迎回来，${resp.user.username}`)
    await router.push({ name: 'transactions' })
  } catch {
    // 失败提示已由 axios 拦截器统一弹出（密码错误 / 网络异常 / 401），
    // 这里只需要保证 submitting 被复位，别让按钮永远转圈
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <el-card class="login-card">
      <template #header>
        <h1 class="login-title">记账本</h1>
        <p class="login-subtitle">登录后查看你的账本</p>
      </template>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        @submit.prevent="onSubmit"
      >
        <el-form-item label="邮箱" prop="email">
          <el-input
            v-model="form.email"
            placeholder="注册时填的邮箱"
            autocomplete="email"
            clearable
          />
        </el-form-item>

        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            autocomplete="current-password"
            show-password
            @keyup.enter="onSubmit"
          />
        </el-form-item>

        <el-button
          type="primary"
          size="large"
          class="login-submit"
          :loading="submitting"
          @click="onSubmit"
        >
          登录
        </el-button>
      </el-form>

      <p class="login-hint">
        还没有账号？
        <router-link :to="{ name: 'register' }">注册一个</router-link>
        （注册后自动建好班级账本）
      </p>
      <p class="login-hint">
        <router-link :to="{ name: 'forgot-password' }">忘记密码？</router-link>
        （用注册邮箱重置）
      </p>
    </el-card>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.login-card {
  width: 100%;
  max-width: 380px;
}

.login-title {
  margin: 0;
  font-size: 20px;
}

.login-subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.login-submit {
  width: 100%;
  margin-top: 4px;
}

.login-hint {
  margin: 16px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.login-hint code {
  background: var(--el-fill-color-light);
  padding: 1px 4px;
  border-radius: 3px;
}

.login-hint a {
  color: var(--el-color-primary);
  text-decoration: none;
}
</style>