<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { register } from '../api/auth'
import { useAuthStore } from '../stores/auth'

/**
 * 注册页：注册成功即建好一本班级账本 + 13 条预置分类。
 * 后端 register 只返回用户信息、**不发 token**，所以成功后这里自动调一次登录，省用户再输一遍密码。
 */

const router = useRouter()
const auth = useAuthStore()

const formRef = ref<FormInstance>()
const submitting = ref(false)

const form = reactive({
  username: '',
  password: '',
  confirmPassword: '',
  nickname: '',
  bookName: '',
  email: '',
})

function validateConfirm(_rule: unknown, value: string, callback: (error?: Error) => void): void {
  if (value !== form.password) {
    callback(new Error('两次输入的密码不一致'))
    return
  }
  callback()
}

const rules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 4, max: 20, message: '用户名长度为 4–20 位', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9_]+$/, message: '只能包含字母、数字和下划线', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 32, message: '密码长度为 6–32 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    { validator: validateConfirm, trigger: 'blur' },
  ],
  nickname: [{ max: 50, message: '昵称不能超过 50 个字', trigger: 'blur' }],
  bookName: [{ max: 50, message: '账本名不能超过 50 个字', trigger: 'blur' }],
  email: [{ type: 'email', message: '邮箱格式不正确', trigger: 'blur' }],
}

async function onSubmit(): Promise<void> {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  // 注册接口非幂等（PLAN §8 第 15 条）：连点两次会变成「第一笔成功、第二笔 400」
  if (submitting.value) return
  submitting.value = true

  const username = form.username.trim()
  const password = form.password
  try {
    await register({
      username,
      password,
      nickname: form.nickname.trim() || null,
      bookName: form.bookName.trim() || null,
      email: form.email.trim() || null,
    })
    // 注册成功但没 token：立刻用同一组账号密码登录
    await auth.login(username, password)
    ElMessage.success('注册成功，已为你建好班级账本')
    await router.push({ name: 'home' })
  } catch (error) {
    // 拦截器已经弹过错误提示，这里只处理「用户名已存在」这种情况的下一步引导
    const message = error instanceof Error ? error.message : ''
    if (message.includes('用户名已存在')) {
      const goLogin = await ElMessageBox.confirm(
        '这个用户名已经注册过了。如果刚才是你点的注册，直接去登录即可。',
        '用户名已被占用',
        { confirmButtonText: '去登录', cancelButtonText: '改个名字', type: 'info' },
      )
        .then(() => true)
        .catch(() => false)
      if (goLogin) {
        await router.push({ name: 'login', query: { username } })
      }
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="register-page">
    <el-card class="register-card">
      <template #header>
        <h1 class="register-title">创建班级账本</h1>
        <p class="register-subtitle">注册后自动建好账本和 13 个常用分类，直接开始记班费</p>
      </template>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        @submit.prevent="onSubmit"
      >
        <el-form-item label="用户名" prop="username">
          <el-input
            v-model="form.username"
            placeholder="4–20 位字母、数字或下划线，区分大小写"
            autocomplete="username"
            clearable
          />
        </el-form-item>

        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="6–32 位"
            autocomplete="new-password"
            show-password
          />
        </el-form-item>

        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="form.confirmPassword"
            type="password"
            placeholder="再输一次"
            autocomplete="new-password"
            show-password
            @keyup.enter="onSubmit"
          />
        </el-form-item>

        <el-form-item label="账本名（可不填）" prop="bookName">
          <el-input v-model="form.bookName" placeholder="默认「班级账本」" clearable />
        </el-form-item>

        <el-form-item label="昵称（可不填）" prop="nickname">
          <el-input v-model="form.nickname" placeholder="默认与用户名相同" clearable />
        </el-form-item>

        <el-form-item label="邮箱（可不填）" prop="email">
          <el-input v-model="form.email" placeholder="仅作资料展示，不支持找回密码" clearable />
        </el-form-item>

        <el-button
          type="primary"
          size="large"
          class="register-submit"
          :loading="submitting"
          @click="onSubmit"
        >
          注册并进入
        </el-button>
      </el-form>

      <p class="register-hint">
        已经有账号了？
        <router-link :to="{ name: 'login' }">去登录</router-link>
      </p>
    </el-card>
  </div>
</template>

<style scoped>
.register-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.register-card {
  width: 100%;
  max-width: 420px;
}

.register-title {
  margin: 0;
  font-size: 20px;
}

.register-subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.register-submit {
  width: 100%;
  margin-top: 4px;
}

.register-hint {
  margin: 16px 0 0;
  font-size: 12px;
  text-align: center;
  color: var(--el-text-color-secondary);
}

.register-hint a {
  color: var(--el-color-primary);
  text-decoration: none;
}
</style>