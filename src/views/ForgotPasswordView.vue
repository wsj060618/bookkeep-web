<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { forgotPassword } from '../api/auth'

/**
 * 忘记密码：用户名 + 邮箱同时匹配才会发信。
 * 无论账号是否存在，后端都返回同一句提示，所以这里提交成功后**只展示统一文案**，不要判断账号存在与否。
 */

const formRef = ref<FormInstance>()
const submitting = ref(false)
const submitted = ref(false)

const form = reactive({ email: '' })

const rules: FormRules = {
  email: [
    { required: true, message: '请输入注册时填的邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' },
  ],
}

async function onSubmit(): Promise<void> {
  if (!formRef.value || submitting.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    await forgotPassword({ email: form.email.trim() })
    submitted.value = true
    ElMessage.success('如果该邮箱已注册，重置邮件已经发出')
  } catch {
    // 网络错误由 request.ts 提示；业务错误理论上不会出现（接口永远 200）
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <el-card class="auth-card" shadow="always">
      <div class="auth-head">
        <h1 class="auth-title">忘记密码</h1>
        <p class="auth-subtitle">用注册时填的邮箱申请重置链接（邮箱就是登录名）</p>
      </div>

      <template v-if="!submitted">
        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
          <el-form-item label="注册邮箱" prop="email">
            <el-input v-model="form.email" placeholder="name@example.com" clearable @keyup.enter="onSubmit" />
          </el-form-item>
          <el-button type="primary" size="large" class="auth-submit" :loading="submitting" @click="onSubmit">
            发送重置邮件
          </el-button>
        </el-form>
      </template>

      <el-result v-else icon="success" title="邮件已发送">
        <template #sub-title>
          <p class="auth-tip">
            如果该邮箱已注册，我们已经把重置链接发到那个邮箱。<br />
            链接 15 分钟内有效、只能用一次；没收到就检查垃圾邮件，或稍后重新申请。
          </p>
        </template>
      </el-result>

      <p class="auth-foot">
        <router-link :to="{ name: 'login' }">返回登录</router-link>
      </p>
    </el-card>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.auth-card {
  width: 100%;
  max-width: 420px;
}

.auth-head {
  margin-bottom: 16px;
}

.auth-title {
  margin: 0;
  font-size: 20px;
}

.auth-subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.auth-submit {
  width: 100%;
}

.auth-tip {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}

.auth-foot {
  margin: 16px 0 0;
  font-size: 13px;
  text-align: center;
}
</style>