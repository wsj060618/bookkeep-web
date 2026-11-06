<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { resetPassword } from '../api/auth'

/**
 * 重置密码：token 来自邮件链接的 query。
 * 成功后后端已让所有旧会话失效（token_version +1），这里直接回登录页，让用户用新密码登录。
 */

const route = useRoute()
const router = useRouter()

const token = typeof route.query.token === 'string' ? route.query.token : ''
const formRef = ref<FormInstance>()
const submitting = ref(false)
const done = ref(false)

const form = reactive({ newPassword: '', confirmPassword: '' })

const rules: FormRules = {
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 32, message: '密码长度需 6–32 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再输入一次', trigger: 'blur' },
    {
      validator: (_rule, value: string, callback) => {
        if (value !== form.newPassword) {
          callback(new Error('两次输入的密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
}

async function onSubmit(): Promise<void> {
  if (!formRef.value || submitting.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    await resetPassword({ token, newPassword: form.newPassword })
    done.value = true
    ElMessage.success('密码已重置，请用新密码登录')
    setTimeout(() => void router.replace({ name: 'login' }), 1200)
  } catch {
    // 「链接已失效，请重新申请」等提示由 request.ts 弹出
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <el-card class="auth-card" shadow="always">
      <div class="auth-head">
        <h1 class="auth-title">重置密码</h1>
        <p class="auth-subtitle">设置一个新密码，旧密码立即失效</p>
      </div>

      <el-alert
        v-if="!token"
        type="error"
        :closable="false"
        title="链接不完整"
        description="请从邮件里重新打开重置链接，或回到登录页重新申请。"
        show-icon
      />

      <template v-else-if="!done">
        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
          <el-form-item label="新密码" prop="newPassword">
            <el-input v-model="form.newPassword" type="password" show-password autocomplete="new-password" />
          </el-form-item>
          <el-form-item label="确认新密码" prop="confirmPassword">
            <el-input
              v-model="form.confirmPassword"
              type="password"
              show-password
              autocomplete="new-password"
              @keyup.enter="onSubmit"
            />
          </el-form-item>
          <el-button type="primary" size="large" class="auth-submit" :loading="submitting" @click="onSubmit">
            确认重置
          </el-button>
        </el-form>
      </template>

      <el-result v-else icon="success" title="密码已更新">
        <template #sub-title>
          <p class="auth-tip">正在跳转到登录页…</p>
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