<script setup lang="ts">
import { computed, onMounted, provide, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { listBooks, shareBooks, switchBook } from '../api/book'
import { listCategories } from '../api/category'
import { useAuthStore } from '../stores/auth'
import { SHELL_KEY, type ShellApi } from '../composables/shell'
import TransactionFormDialog from '../components/TransactionFormDialog.vue'
import type { Category, ShareLinkCreated, Transaction } from '../types/api'

/**
 * 桌面壳：左侧竖栏 + 顶栏 + 内容区（最大 1440）。
 * <p>「记一笔」「分享」两个弹窗挂在这里，三个子页面共用；子页面通过 useShell() 拿到分类与数据版本号。
 * <p>切账本时给 RouterView 换 key，子页面重新挂载 → 各自 onMounted 重新拉数据，
 * 比在每个页面里手写 watch 当前账本更不容易漏。
 */

const route = useRoute()
const router = useRouter()
/** 「记一笔」只在流水页出现：统计/账本/设置页不提供入口，避免误以为在哪都能记 */
const onTransactions = computed(() => route.name === 'transactions')
const auth = useAuthStore()

const currentBook = computed(() => auth.books.find((b) => b.current) ?? auth.books[0] ?? null)
const currentBookId = computed(() => currentBook.value?.id ?? null)
/** 当前账本已归档 = 只读：记一笔的入口要收起，并在页面顶部说明原因 */
const currentArchived = computed(() => currentBook.value?.archived === true)

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

/** 分类以服务端为准：分类页增删改后也走这里，避免各页面各拉一份导致下拉与筛选不一致 */
async function reloadCategories(): Promise<void> {
  categories.value = await listCategories().catch(() => categories.value)
}

function onCategoryCreated(category: Category): void {
  // 先插进缓存，弹窗要立刻选中新分类；随后再拉一次对齐后端顺序
  categories.value = [...categories.value, category]
  void reloadCategories()
}

const shell: ShellApi = {
  categories,
  txVersion,
  openCreate,
  openEdit,
  notifyTxChanged,
  reloadCategories,
}
provide(SHELL_KEY, shell)

/* ---------- 分享（多选账本 → 一条链接） ---------- */

const shareVisible = ref(false)
const shareLoading = ref(false)
/** 勾选的账本 id；默认只勾当前账本，避免一进来就「全选」误发一堆账本 */
const shareSelected = ref<number[]>([])
const shareResult = ref<ShareLinkCreated | null>(null)
/** 结果里那个只读输入框：局域网 http 下复制要选中它再 execCommand */
const shareInputRef = ref<{ input?: HTMLInputElement } | null>(null)

const allSelected = computed(
  () => auth.books.length > 0 && shareSelected.value.length === auth.books.length,
)
const someSelected = computed(
  () => shareSelected.value.length > 0 && shareSelected.value.length < auth.books.length,
)

function openShare(): void {
  // 每次打开都按「当前账本」重置，避免上次的勾选残留
  shareSelected.value = currentBookId.value ? [currentBookId.value] : []
  shareResult.value = null
  shareVisible.value = true
}

function toggleSelectAll(value: boolean | string | number): void {
  shareSelected.value = value ? auth.books.map((b) => b.id) : []
}

function shareLinkUrl(): string {
  return shareResult.value ? `${window.location.origin}/report/${shareResult.value.token}` : ''
}

/** 生成一条链接，包含勾选的全部账本；**每次都会换新 token，旧链接立即失效** */
async function onGenerateShare(): Promise<void> {
  if (!shareSelected.value.length || shareLoading.value) return
  shareLoading.value = true
  try {
    shareResult.value = await shareBooks(shareSelected.value)
  } catch {
    // request.ts 已按响应码弹过提示
  } finally {
    shareLoading.value = false
  }
}

async function copyShareLink(): Promise<void> {
  const text = shareLinkUrl()
  if (!text) return

  // 1) 安全上下文（https / localhost）直接用标准 API
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      ElMessage.success('链接已复制')
      return
    } catch {
      // 有 API 但被拒：继续走兜底
    }
  }

  // 2) 局域网 http：没有 clipboard API，只能选中**弹窗里那个真实可见的输入框**再 execCommand。
  //    不能用隐藏的 textarea：安卓/iOS 对不可见元素、以及 contentEditable 的选区行为不一致，
  //    会出现「提示复制成功，粘出来却是别的内容 / 打不开」的问题。
  const input = shareInputRef.value?.input
  if (input) {
    input.focus()
    input.select()
    input.setSelectionRange(0, text.length)
  }
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  if (ok) {
    ElMessage.success('链接已复制')
  } else {
    ElMessage.warning('浏览器不允许自动复制，请长按上面的链接手动选中')
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
watch(currentBookId, () => {
  void reloadCategories()
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
  await reloadCategories()
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
          to="/categories"
          class="nav-item"
          :class="{ active: route.path === '/categories' }"
          title="分类"
        >
          <span class="nav-icon">🏷</span><span class="label">分类</span>
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

      <el-button v-if="onTransactions" class="new-btn" type="primary" @click="openCreate">
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
            <span class="tb-user">{{ auth.user?.username }} ▾</span>
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
        <div v-if="currentArchived" class="readonly-banner">
          <span class="readonly-title">当前账本已归档（学期结束），只读</span>
          <span class="readonly-desc">仍可查看、统计、导出、分享；要补记流水或改分类，请先取消归档。</span>
          <el-button link type="primary" size="small" @click="router.push({ name: 'books' })">
            去账本页
          </el-button>
        </div>
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
        <RouterLink
          to="/categories"
          class="nav-item"
          :class="{ active: route.path === '/categories' }"
        >
          <span class="nav-icon">🏷</span><span>分类</span>
        </RouterLink>
        <RouterLink to="/settings" class="nav-item" :class="{ active: route.path === '/settings' }">
          <span class="nav-icon">⚙️</span><span>设置</span>
        </RouterLink>
        <el-button class="drawer-logout" text type="danger" @click="onLogout">退出登录</el-button>
      </nav>
    </el-drawer>

    <el-button v-if="onTransactions && !currentArchived" class="fab" type="primary" @click="openCreate">＋ 记一笔</el-button>

    <TransactionFormDialog
      v-model="formVisible"
      :categories="categories"
      :editing="editing"
      @saved="notifyTxChanged"
      @category-created="onCategoryCreated"
    />

    <el-dialog v-model="shareVisible" title="分享账本" width="min(560px, 94vw)">
      <div class="share-toolbar">
        <el-checkbox
          :model-value="allSelected"
          :indeterminate="someSelected"
          @change="toggleSelectAll"
        >
          全选
        </el-checkbox>
        <span class="share-count">已选 {{ shareSelected.length }} / {{ auth.books.length }} 本</span>
      </div>

      <el-checkbox-group v-model="shareSelected" class="share-books">
        <el-checkbox v-for="b in auth.books" :key="b.id" :value="b.id" class="share-book">
          {{ b.name }}
          <span v-if="b.current" class="share-tag">当前</span>
          <span v-if="b.archived" class="share-tag archived">已归档</span>
        </el-checkbox>
      </el-checkbox-group>

      <p class="share-tip">链接 <strong>3 天有效</strong>。</p>

      <div v-if="shareResult" class="share-result">
        <div class="share-result-head">
          <span class="share-result-name">
            含 {{ shareResult.books.length }} 本：{{
              shareResult.books.map((b) => b.name).join('、')
            }}
          </span>
          <span class="share-result-exp">到期 {{ shareResult.expiresAt }}</span>
        </div>
        <el-input
          ref="shareInputRef"
          :model-value="shareLinkUrl()"
          readonly
          @focus="($event.target as HTMLInputElement).select()"
        >
          <template #append>
            <el-button @click="copyShareLink">复制</el-button>
          </template>
        </el-input>
      </div>

      <template #footer>
        <el-button @click="shareVisible = false">关闭</el-button>
        <el-button
          type="primary"
          :loading="shareLoading"
          :disabled="!shareSelected.length"
          @click="onGenerateShare"
        >
          {{ shareResult ? '重新生成链接' : '生成链接' }}
        </el-button>
      </template>
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

/* 归档账本只读提示：一条就够，不弹窗，不挡住页面内容 */
.readonly-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid var(--el-color-warning-light-5);
  background: var(--el-color-warning-light-9);
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.readonly-title {
  font-weight: 600;
  color: var(--el-color-warning-dark-2);
}

.readonly-desc {
  color: var(--el-text-color-secondary);
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

.share-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.share-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.share-books {
  display: grid;
  gap: 2px;
  max-height: 180px;
  overflow-y: auto;
  margin-bottom: 10px;
}

.share-book {
  margin-right: 0;
}

.share-tag {
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 8px;
  font-size: 11px;
  color: var(--el-color-success);
  background: var(--el-color-success-light-9);
}

.share-tag.archived {
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color);
}

.share-result-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 12px;
}

.share-result-name {
  font-weight: 600;
  font-size: 13px;
}

.share-result-exp {
  margin-left: auto;
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