<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { register } from '../api/auth'
import { useAuthStore } from '../stores/auth'
import { emailFormatRule } from '../utils/validate'

/**
 * 注册向导：第一步账号，第二步给账本起名，最后一次性提交。
 * 为什么不在「注册成功」之后再命名账本：后端 register 是一个事务（账号 + 账本 + 13 条分类）一次建完，
 * 也没有改账本名的接口，所以「定义账本」只能发生在提交之前——顺序上是「填账号 → 定义账本 → 进首页」。
 * 后端 register 只返回用户信息、**不发 token**，成功后这里自动登录一次，省用户再输密码。
 */

const router = useRouter()
const auth = useAuthStore()

const formRef = ref<FormInstance>()
const submitting = ref(false)
const step = ref(0)

/** 用户名只限长度（后端 UsernameRules.MAX / MESSAGE 同一条规则），字符不设限 */
const USERNAME_MAX = 20
const USERNAME_MESSAGE = '用户名长度不能超过 20 位'

const form = reactive({
  username: '',
  password: '',
  confirmPassword: '',
  email: '',
  bookName: '班级账本',
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
    { max: USERNAME_MAX, message: USERNAME_MESSAGE, trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 32, message: '密码长度为 6–32 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    { validator: validateConfirm, trigger: 'blur' },
  ],
  email: [
    { required: true, message: '请输入邮箱（找回密码要用）', trigger: 'blur' },
    emailFormatRule,
  ],
  bookName: [
    { required: true, message: '给账本起个名字', trigger: 'blur' },
    { max: 50, message: '账本名不能超过 50 个字', trigger: 'blur' },
  ],
}

/** 只校验当前步骤的字段；整表校验会把没填的第二步骤也标红 */
function validateFields(fields: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    formRef.value?.validateField(fields, (isValid) => resolve(Boolean(isValid)))
  })
}

async function next(): Promise<void> {
  const valid = await validateFields(['username', 'password', 'confirmPassword', 'email'])
  if (!valid) return
  step.value = 1
}

async function onSubmit(): Promise<void> {
  if (!formRef.value) return
  const valid = await validateFields(['bookName'])
  if (!valid) return

  // 注册接口非幂等（PLAN §8 第 15 条）：连点两次会变成「第一笔成功、第二笔 400」
  if (submitting.value) return
  submitting.value = true

  const username = form.username.trim()
  const email = form.email.trim()
  const password = form.password
  try {
    await register({
      username,
      password,
      email,
      bookName: form.bookName.trim(),
    })
    // 注册成功但没 token：立刻用同一组凭据登录（登录凭据是邮箱）
    await auth.login(email, password)
    ElMessage.success('注册成功，已为你建好账本')
    await router.push({ name: 'transactions' })
  } catch (error) {
    // 拦截器已经弹过错误提示，这里只处理「用户名/邮箱已存在」这种情况的下一步引导
    const message = error instanceof Error ? error.message : ''
    if (message.includes('用户名已存在') || message.includes('邮箱已被注册')) {
      const goLogin = await ElMessageBox.confirm(
        '这个用户名或邮箱已经注册过了。如果刚才是你点的注册，直接去登录即可。',
        '已被占用',
        { confirmButtonText: '去登录', cancelButtonText: '改一下', type: 'info' },
      )
        .then(() => true)
        .catch(() => false)
      if (goLogin) {
        await router.push({ name: 'login', query: { email } })
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
        <p class="register-subtitle">先创建账号，再给这本账起个名字，然后就能记班费了</p>
      </template>

      <el-steps :active="step" simple class="steps">
        <el-step title="账号" />
        <el-step title="账本" />
      </el-steps>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        @submit.prevent="step === 0 ? next() : onSubmit()"
      >
        <!-- 第一步：账号 -->
        <template v-if="step === 0">
          <el-form-item label="用户名" prop="username">
            <el-input
              v-model="form.username"
              placeholder="不超过 20 位"
              maxlength="20"
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
              @keyup.enter="next"
            />
          </el-form-item>

          <el-form-item label="邮箱" prop="email">
            <el-input v-model="form.email" placeholder="登录用，也是找回密码的通道" clearable />
          </el-form-item>

          <el-button type="primary" size="large" class="register-submit" @click="next">
            下一步：给账本起名
          </el-button>
        </template>

        <!-- 第二步：账本名（注册时一并创建，之后没有改名入口，所以这一步要认真填） -->
        <template v-else>
          <el-form-item label="账本名字" prop="bookName">
            <el-input
              v-model="form.bookName"
              maxlength="50"
              show-word-limit
              placeholder="比如：计科2301班费"
              @keyup.enter="onSubmit"
            />
          </el-form-item>

          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="会一并预置 13 个常用分类（8 个支出 + 5 个收入）"
            description="账本名就是分享给同学看的公示页标题，建议写清班级。"
          />

          <div class="register-actions">
            <el-button size="large" @click="step = 0">上一步</el-button>
            <el-button type="primary" size="large" :loading="submitting" @click="onSubmit">
              完成注册
            </el-button>
          </div>
        </template>
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

.steps {
  margin-bottom: 18px;
}

.register-submit {
  width: 100%;
  margin-top: 4px;
}

.register-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.register-actions .el-button {
  flex: 1;
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