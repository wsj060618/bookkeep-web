<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { deleteAccount, updatePassword, updateProfile } from '../api/user'
import { useAuthStore } from '../stores/auth'
import { isEmail, passwordRule } from '../utils/validate'

/**
 * 账号设置：资料 / 改密码 / 注销。
 * 改密码和注销都会让 token 失效（后端 token_version +1 / user 已删），所以成功后必须清本地状态回登录页。
 * 资料保存和注销都要二次确认，各自一个对话框（注销对话框里带密码，等于一次确认）。
 */

const router = useRouter()
const auth = useAuthStore()

/** 用户名只限长度，字符不设限（后端 UsernameRules 同一条规则） */
const USERNAME_MAX = 20
const USERNAME_MESSAGE = '用户名长度不能超过 20 位'

/* ---------- 资料 ---------- */

const profileForm = reactive({
  username: auth.user?.username ?? '',
  email: auth.user?.email ?? '',
})
// 子页面 setup 早于 AppLayout 的 onMounted（/me 还没回来），所以这里要用 watch 补一次回填，
// 否则打开设置页会看到空的用户名/邮箱
watch(
  () => auth.user,
  (user) => {
    if (!user) return
    profileForm.username = user.username
    profileForm.email = user.email
  },
  { immediate: true },
)

/** 只有邮箱被改动时才需要「当前密码」（邮箱是登录凭据） */
const emailChanged = computed(
  () => profileForm.email.trim().toLowerCase() !== (auth.user?.email ?? '').toLowerCase(),
)

const profileDialog = ref(false)
const profilePassword = ref('')
const profileSaving = ref(false)

/**
 * 点「保存资料」：先做格式校验，再弹确认框（改邮箱时才要密码）
 */
function openProfileDialog(): void {
  const username = profileForm.username.trim()
  const email = profileForm.email.trim()
  if (!username) {
    ElMessage.warning('用户名不能为空')
    return
  }
  if (username.length > USERNAME_MAX) {
    ElMessage.warning(USERNAME_MESSAGE)
    return
  }
  if (!email) {
    ElMessage.warning('邮箱不能为空')
    return
  }
  if (!isEmail(email)) {
    ElMessage.warning('邮箱格式不正确')
    return
  }
  profilePassword.value = ''
  profileDialog.value = true
}

async function confirmSaveProfile(): Promise<void> {
  if (profileSaving.value) return
  if (emailChanged.value && !profilePassword.value) {
    ElMessage.warning('修改登录邮箱需要输入当前密码')
    return
  }
  profileSaving.value = true
  try {
    await updateProfile({
      username: profileForm.username.trim(),
      email: profileForm.email.trim(),
      password: emailChanged.value ? profilePassword.value : undefined,
    })
    profileDialog.value = false
    profilePassword.value = ''
    await auth.loadMe() // 顶栏名字立即变
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
    passwordRule,
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

const deleteDialog = ref(false)
const deletePassword = ref('')
const deleting = ref(false)

function openDeleteDialog(): void {
  deletePassword.value = ''
  deleteDialog.value = true
}

async function confirmDelete(): Promise<void> {
  if (deleting.value) return
  if (!deletePassword.value) {
    ElMessage.warning('请输入当前密码')
    return
  }
  deleting.value = true
  try {
    await deleteAccount({ password: deletePassword.value })
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
      <p class="page-desc">用户名只是显示名，可随时修改；邮箱是登录凭据，改它需要输入当前密码。</p>
    </div>

    <section class="card">
      <h3 class="card-title">资料</h3>
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="用户名（显示名）">
          <el-input v-model="profileForm.username" maxlength="20" placeholder="不超过 20 位" />
        </el-form-item>
        <el-form-item label="登录邮箱">
          <el-input v-model="profileForm.email" maxlength="100" placeholder="name@example.com" />
        </el-form-item>
        <el-button type="primary" @click="openProfileDialog">保存资料</el-button>
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
          <el-input
            v-model="pwdForm.newPassword"
            type="password"
            show-password
            autocomplete="new-password"
            placeholder="6–32 位字母、数字或下划线"
          />
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
        账号与名下全部账本、分类、流水会被<strong>立即彻底删除</strong>，不进回收站、无法恢复。
        请确认已经从别处保留需要的数据。
      </p>
      <el-button type="danger" @click="openDeleteDialog">注销账户</el-button>
    </section>

    <!-- 保存资料的确认框：只有改了邮箱才要求密码 -->
    <el-dialog v-model="profileDialog" title="保存资料" width="min(460px, 92vw)">
      <div class="dialog-body">
        <p class="dialog-line">
          用户名：<strong>{{ auth.user?.username }}</strong>
          <span v-if="profileForm.username.trim() !== auth.user?.username"> → {{ profileForm.username.trim() }}</span>
        </p>
        <p class="dialog-line">
          登录邮箱：<strong>{{ auth.user?.email }}</strong>
          <span v-if="emailChanged"> → {{ profileForm.email.trim() }}</span>
        </p>
        <p v-if="!emailChanged" class="dialog-tip">只修改显示名，不需要密码。</p>
        <template v-else>
          <p class="dialog-tip">邮箱是登录凭据，修改后请用新邮箱登录。需要验证当前密码：</p>
          <el-input
            v-model="profilePassword"
            type="password"
            show-password
            autocomplete="current-password"
            placeholder="当前登录密码"
            @keyup.enter="confirmSaveProfile"
          />
        </template>
      </div>
      <template #footer>
        <el-button @click="profileDialog = false">取消</el-button>
        <el-button type="primary" :loading="profileSaving" @click="confirmSaveProfile">确认保存</el-button>
      </template>
    </el-dialog>

    <!-- 注销确认框：密码 + 后果说明，一次确认，避免「弹两次框」 -->
    <el-dialog v-model="deleteDialog" title="注销账户" width="min(460px, 92vw)">
      <el-alert
        type="error"
        :closable="false"
        show-icon
        title="注销后无法恢复"
        description="账号与名下全部账本、分类、流水会被立即物理删除，不进回收站。"
      />
      <div class="dialog-body">
        <el-input
          v-model="deletePassword"
          type="password"
          show-password
          autocomplete="current-password"
          placeholder="输入当前密码确认"
          @keyup.enter="confirmDelete"
        />
      </div>
      <template #footer>
        <el-button @click="deleteDialog = false">取消</el-button>
        <el-button type="danger" :loading="deleting" @click="confirmDelete">确认注销</el-button>
      </template>
    </el-dialog>
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

.dialog-body {
  display: grid;
  gap: 12px;
  margin-top: 8px;
}

.dialog-line {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-all;
}

.dialog-tip {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
</style>