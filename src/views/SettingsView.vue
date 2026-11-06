<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { deleteAccount, updatePassword, updateProfile } from '../api/user'
import { useAuthStore } from '../stores/auth'

/**
 * 账号设置：资料 / 改密码 / 注销。
 * 改密码和注销都会让 token 失效（后端 token_version +1 / user 已删），所以成功后必须清本地状态回登录页。
 */

const router = useRouter()
const auth = useAuthStore()

/* ---------- 资料 ---------- */

const profileForm = reactive({
  nickname: auth.user?.nickname ?? '',
  email: auth.user?.email ?? '',
})
const profileSaving = ref(false)

async function onSaveProfile(): Promise<void> {
  if (profileSaving.value) return
  profileSaving.value = true
  try {
    await updateProfile({ nickname: profileForm.nickname, email: profileForm.email })
    await auth.loadMe() // 顶栏昵称立即变
    ElMessage.success('资料已更新')
  } catch {
    // 校验/网络错误已由 request.ts 弹过
  } finally {
    profileSaving.value = false
  }
}

/* ---------- 改密码 ---------- */

const pwdRef = ref<FormInstance>()
const pwdForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })
const pwdSaving = ref(false)

const pwdRules: FormRules = {
  oldPassword: [{ required: true, message: '请输入旧密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 32, message: '密码长度需 6–32 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再输入一次新密码', trigger: 'blur' },
    {
      validator: (_rule, value: string, callback) => {
        if (value !== pwdForm.newPassword) {
          callback(new Error('两次输入的新密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
}

async function onChangePassword(): Promise<void> {
  if (!pwdRef.value || pwdSaving.value) return
  const valid = await pwdRef.value.validate().catch(() => false)
  if (!valid) return

  pwdSaving.value = true
  try {
    await updatePassword({ oldPassword: pwdForm.oldPassword, newPassword: pwdForm.newPassword })
    ElMessage.success('密码已修改，请用新密码重新登录')
    // 旧 token 已在服务端作废，这里主动清掉本地状态，避免停在必然 401 的页面
    auth.logout()
    await router.replace({ name: 'login' })
  } catch {
    // 「旧密码不正确」等提示已由 request.ts 弹出
  } finally {
    pwdSaving.value = false
  }
}

/* ---------- 注销 ---------- */

const deleteForm = reactive({ password: '' })
const deleting = ref(false)

async function onDeleteAccount(): Promise<void> {
  if (deleting.value) return
  if (!deleteForm.password) {
    ElMessage.warning('请输入当前密码')
    return
  }

  const confirmed = await ElMessageBox.confirm(
    '注销后账号立即无法登录，名下账本会进入回收站（15 天后连同分类与流水彻底删除）。' +
      '期间无法自助恢复，只能联系维护者改库。确定继续吗？',
    '注销账户',
    { type: 'error', confirmButtonText: '确认注销', cancelButtonText: '取消' },
  )
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return

  deleting.value = true
  try {
    await deleteAccount({ password: deleteForm.password })
    ElMessage.success('账号已注销')
    auth.logout()
    await router.replace({ name: 'login' })
  } catch {
    // 「密码不正确」等提示已弹过
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="settings-page">
    <div class="page-head">
      <h2 class="page-title">账号设置</h2>
      <p class="page-desc">用户名不可修改（它是登录凭据），其余资料随时可改。</p>
    </div>

    <section class="card">
      <h3 class="card-title">资料</h3>
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="昵称">
          <el-input v-model="profileForm.nickname" maxlength="50" placeholder="留空则显示用户名" />
        </el-form-item>
        <el-form-item label="邮箱（仅展示，不发验证邮件）">
          <el-input v-model="profileForm.email" maxlength="100" placeholder="name@example.com" />
        </el-form-item>
        <el-button type="primary" :loading="profileSaving" @click="onSaveProfile">保存资料</el-button>
      </el-form>
    </section>

    <section class="card">
      <h3 class="card-title">修改密码</h3>
      <p class="card-tip">改完密码后，其他设备上已登录的会话会立即失效，需要用新密码重新登录。</p>
      <el-form ref="pwdRef" :model="pwdForm" :rules="pwdRules" label-position="top" @submit.prevent>
        <el-form-item label="旧密码" prop="oldPassword">
          <el-input v-model="pwdForm.oldPassword" type="password" show-password autocomplete="current-password" />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="pwdForm.newPassword" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-form-item label="确认新密码" prop="confirmPassword">
          <el-input v-model="pwdForm.confirmPassword" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-button type="primary" :loading="pwdSaving" @click="onChangePassword">修改密码</el-button>
      </el-form>
    </section>

    <section class="card danger">
      <h3 class="card-title">注销账户</h3>
      <p class="card-tip">
        账号立即无法登录，名下账本进入回收站，15 天后连同分类与流水彻底删除。
        <strong>期间无法自助恢复</strong>，只能联系维护者改库。
      </p>
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="当前密码">
          <el-input v-model="deleteForm.password" type="password" show-password autocomplete="current-password" />
        </el-form-item>
        <el-button type="danger" :loading="deleting" @click="onDeleteAccount">注销账户</el-button>
      </el-form>
    </section>
  </div>
</template>

<style scoped>
.settings-page {
  display: grid;
  gap: 16px;
  max-width: 640px;
}

.page-title {
  margin: 0;
  font-size: 18px;
}

.page-desc {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.card {
  padding: 16px;
  border-radius: 12px;
  background: var(--el-bg-color);
  box-shadow: 0 1px 2px rgb(0 0 0 / 6%);
}

.card-title {
  margin: 0 0 8px;
  font-size: 14px;
}

.card-tip {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.danger {
  border: 1px solid var(--el-color-danger-light-5);
}

.danger .card-title {
  color: var(--el-color-danger);
}
</style>