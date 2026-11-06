<script setup lang="ts">
import { computed, onMounted, provide, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { createShareLink, listBooks, switchBook } from '../api/book'
import { listCategories } from '../api/category'
import { useAuthStore } from '../stores/auth'
import { SHELL_KEY, type ShellApi } from '../composables/shell'
import { copyText } from '../utils/clipboard'
import TransactionFormDialog from '../components/TransactionFormDialog.vue'
import type { Category, Transaction } from '../types/api'

/**
 * 桌面壳：左侧竖栏 + 顶栏 + 内容区（最大 1440）。
 * <p>「记一笔」「分享」两个弹窗挂在这里，三个子页面共用；子页面通过 useShell() 拿到分类与数据版本号。
 * <p>切账本时给 RouterView 换 key，子页面重新挂载 → 各自 onMounted 重新拉数据，
 * 比在每个页面里手写 watch 当前账本更不容易漏。
 */

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const currentBook = computed(() => auth.books.find((b) => b.current) ?? auth.books[0] ?? null)
const currentBookId = computed(() => currentBook.value?.id ?? null)

const categories = ref<Category[]>([])
const txVersion = ref(0)

const formVisible = ref(false)
const editing = ref<Transaction | null>(null)

function openCreate(): void {
  editing.value = null
  formVisible.value = true
}

function openEdit(tx: Transaction): void {
  editing.value = tx
  formVisible.value = true
}

function notifyTxChanged(): void {
  txVersion.value += 1
}

const shell: ShellApi = { categories, txVersion, openCreate, openEdit, notifyTxChanged }
provide(SHELL_KEY, shell)

/* ---------- 分享 ---------- */

const shareVisible = ref(false)
const shareLoading = ref(false)
const shareLink = ref('')
const shareExpiresAt = ref('')

/** 点「分享」→ 重新生成一条 3 天有效的新链接，旧链接同时作废 */
async function openShare(): Promise<void> {
  const book = currentBook.value
  if (!book || shareLoading.value) return
  shareLoading.value = true
  try {
    const link = await createShareLink(book.id)
    shareLink.value = `${window.location.origin}/report/${link.token}`
    shareExpiresAt.value = link.expiresAt
    auth.applyBook({ ...book, shareToken: link.token, shareTokenExpiresAt: link.expiresAt })
    shareVisible.value = true
  } catch {
    // request.ts 已按响应码弹过提示
  } finally {
    shareLoading.value = false
  }
}

async function copyShareLink(): Promise<void> {
  if (!shareLink.value) return
  const ok = await copyText(shareLink.value)
  if (ok) {
    ElMessage.success('链接已复制')
  } else {
    ElMessage.warning('这个浏览器不允许自动复制，请长按链接手动选中')
  }
}

/* ---------- 账本 / 路由 ---------- */

async function onBookCommand(command: string): Promise<void> {
  if (command === 'manage') {
    await router.push({ name: 'books' })
    return
  }
  const id = Number(command)
  if (!id || id === currentBookId.value) return
  try {
    auth.setBooks(await switchBook(id))
    ElMessage.success(`已切换到「${currentBook.value?.name ?? ''}」`)
  } catch {
    // 提示已由拦截器弹出
  }
}

async function onLogout(): Promise<void> {
  auth.logout()
  await router.replace({ name: 'login' })
}

async function onUserCommand(command: string): Promise<void> {
  if (command === 'settings') {
    await router.push({ name: 'settings' })
    return
  }
  if (command === 'logout') {
    await onLogout()
  }
}

/** 窄屏汉堡菜单 */
const drawerVisible = ref(false)
watch(
  () => route.fullPath,
  () => {
    drawerVisible.value = false
  },
)

// 切账本 → 分类整套换掉，重拉一次给子页面的筛选/表单用
watch(currentBookId, async () => {
  categories.value = await listCategories().catch(() => [])
})

onMounted(async () => {
  try {
    // 刷新页面后 Pinia 是空的，用 /me 换回用户资料
    await auth.loadMe()
  } catch {
    await router.replace({ name: 'login' })
    return
  }
  // books 以服务端为准：localStorage 可能是旧数据（在别的设备上改过名或删过账本）
  auth.setBooks(await listBooks().catch(() => auth.books))
  categories.value = await listCategories().catch(() => [])
})
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="nav-icon">📒</span>
        <span class="label brand-text">班级记账</span>
      </div>

      <nav class="nav">
        <RouterLink
          to="/transactions"
          class="nav-item"
          :class="{ active: route.path === '/transactions' }"
          title="流水"
        >
          <span class="nav-icon">📋</span><span class="label">流水</span>
        </RouterLink>
        <RouterLink
          to="/stats"
          class="nav-item"
          :class="{ active: route.path === '/stats' }"
          title="统计"
        >
          <span class="nav-icon">📊</span><span class="label">统计</span>
        </RouterLink>
        <RouterLink
          to="/books"
          class="nav-item"
          :class="{ active: route.path === '/books' }"
          title="账本"
        >
          <span class="nav-icon">📚</span><span class="label">账本</span>
        </RouterLink>
        <RouterLink
          to="/settings"
          class="nav-item"
          :class="{ active: route.path === '/settings' }"
          title="设置"
        >
          <span class="nav-icon">⚙️</span><span class="label">设置</span>
        </RouterLink>
      </nav>

      <el-button class="new-btn" type="primary" @click="openCreate">
        <span class="nav-icon">＋</span><span class="label">记一笔</span>
      </el-button>
    </aside>

    <div class="main">
      <header class="topbar">
        <div class="tb-left">
          <button class="hamburger" type="button" aria-label="打开导航" @click="drawerVisible = true">
            ☰
          </button>
          <el-dropdown trigger="click" @command="onBookCommand">
            <span class="book-switch">{{ currentBook?.name || '班级账本' }} ▾</span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="book in auth.books"
                  :key="book.id"
                  :command="String(book.id)"
                  :disabled="book.current"
                >
                  {{ book.name }}<span v-if="book.current">（当前）</span>
                </el-dropdown-item>
                <el-dropdown-item divided command="manage">管理账本…</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

        <div class="tb-right">
          <el-button text type="primary" :loading="shareLoading" @click="openShare">分享</el-button>
          <el-dropdown trigger="click" @command="onUserCommand">
            <span class="tb-user">{{ auth.user?.nickname || auth.user?.username }} ▾</span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="settings">账号设置</el-dropdown-item>
                <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <main class="content">
        <RouterView :key="currentBookId ?? 0" />
      </main>
    </div>

    <el-drawer v-model="drawerVisible" title="导航" direction="ltr" size="220px">
      <nav class="drawer-nav">
        <RouterLink
          to="/transactions"
          class="nav-item"
          :class="{ active: route.path === '/transactions' }"
        >
          <span class="nav-icon">📋</span><span>流水</span>
        </RouterLink>
        <RouterLink to="/stats" class="nav-item" :class="{ active: route.path === '/stats' }">
          <span class="nav-icon">📊</span><span>统计</span>
        </RouterLink>
        <RouterLink to="/books" class="nav-item" :class="{ active: route.path === '/books' }">
          <span class="nav-icon">📚</span><span>账本</span>
        </RouterLink>
        <RouterLink to="/settings" class="nav-item" :class="{ active: route.path === '/settings' }">
          <span class="nav-icon">⚙️</span><span>设置</span>
        </RouterLink>
        <el-button class="drawer-logout" text type="danger" @click="onLogout">退出登录</el-button>
      </nav>
    </el-drawer>

    <el-button class="fab" type="primary" @click="openCreate">＋ 记一笔</el-button>

    <TransactionFormDialog
      v-model="formVisible"
      :categories="categories"
      :editing="editing"
      @saved="notifyTxChanged"
    />

    <el-dialog v-model="shareVisible" title="分享给同学看" width="min(480px, 92vw)">
      <p class="share-tip">
        任何人打开这个链接都能看到本月收支，<strong>不需要登录</strong>，页面上没有你的用户名和邮箱。
      </p>
      <el-input :model-value="shareLink" readonly>
        <template #append>
          <el-button @click="copyShareLink">复制</el-button>
        </template>
      </el-input>
      <p class="share-tip">
        链接 <strong>3 天后自动失效</strong>；每次点「分享」都会换一条新链接，之前发出去的立即作废。
      </p>
      <p v-if="shareExpiresAt" class="share-tip">当前链接有效期至 {{ shareExpiresAt }}</p>
    </el-dialog>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  min-height: 100vh;
  background: var(--app-bg);
}

/* ---------- 左侧竖栏 ---------- */
.sidebar {
  position: sticky;
  top: 0;
  flex: none;
  width: 220px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px 12px;
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-lighter);
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  font-weight: 600;
}

.brand-text {
  font-size: 16px;
}

.nav {
  display: grid;
  gap: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  color: var(--el-text-color-regular);
  text-decoration: none;
  font-size: 14px;
}

.nav-item:hover {
  background: var(--el-fill-color-light);
}

.nav-item.active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 600;
}

.nav-icon {
  flex: none;
  width: 20px;
  text-align: center;
  font-size: 16px;
}

.new-btn {
  margin-top: auto;
  width: 100%;
}

/* ---------- 右侧主区 ---------- */
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 24px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.tb-left,
.tb-right {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.book-switch {
  cursor: pointer;
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tb-user {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
}

.hamburger {
  display: none;
  border: 0;
  background: transparent;
  font-size: 20px;
  line-height: 1;
  padding: 4px 6px;
  cursor: pointer;
  color: var(--el-text-color-regular);
}

.content {
  flex: 1;
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px 32px 80px;
}

.drawer-nav {
  display: grid;
  gap: 4px;
}

.fab {
  display: none;
  position: fixed;
  right: 16px;
  bottom: 16px;
  height: 44px;
  padding: 0 18px;
  border-radius: 22px;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 6px 16px rgb(59 130 246 / 35%);
  z-index: 20;
}

.share-tip {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

/* 平板：竖栏收成图标栏 */
@media (max-width: 1023px) {
  .sidebar {
    width: 64px;
    padding: 16px 8px;
    align-items: center;
  }

  .sidebar .label,
  .brand-text {
    display: none;
  }

  .nav-item {
    justify-content: center;
    padding: 10px 0;
  }

  .new-btn {
    padding: 8px 0;
  }

  .content {
    padding: 20px 20px 80px;
  }
}

/* 手机：竖栏隐藏，改抽屉 + 悬浮按钮 */
@media (max-width: 767px) {
  .sidebar {
    display: none;
  }

  .hamburger {
    display: inline-flex;
  }

  .topbar {
    padding: 10px 16px;
  }

  .tb-user {
    display: none;
  }

  .content {
    padding: 16px 16px 96px;
  }

  .fab {
    display: inline-flex;
  }
}
</style>