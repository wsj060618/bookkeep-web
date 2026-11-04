<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listCategories } from '../api/category'
import { deleteTransaction, exportTransactions, pageTransactions } from '../api/transaction'
import { fetchCategoryStat, fetchSummary } from '../api/statistic'
import { listBooks, switchBook } from '../api/book'
import { saveBlob } from '../api/request'
import type { Category, CategoryStat, Summary, Transaction, TransactionQuery, TxType } from '../types/api'
import { useAuthStore } from '../stores/auth'
import TransactionFormDialog from '../components/TransactionFormDialog.vue'
import BookManageDialog from '../components/BookManageDialog.vue'
import { colorOf, iconOf } from '../utils/category'

/**
 * 首页 = 月度统计 + 流水列表 + 记一笔 + 导出/分享入口。
 * 验收标准是可观察行为：连点只发一次请求、刷新后数据还在、空数据显示 0.00、导出的是 CSV 不是 JSON。
 */

const router = useRouter()
const auth = useAuthStore()

const loading = ref(false)
const list = ref<Transaction[]>([])
const total = ref(0)
const page = ref(1)
const size = ref(10)

const statLoading = ref(false)
/** 空字符串 = 当月，由后端按 Asia/Shanghai 决定；回显后用后端返回的 month */
const statMonth = ref('')
const summary = ref<Summary | null>(null)
const categoryStats = ref<CategoryStat[]>([])
const exporting = ref(false)

const filterType = ref<TxType | ''>('')
const filterCategoryId = ref<number | null>(null)
const dateRange = ref<[string, string] | null>(null)
const keyword = ref('')

const dialogVisible = ref(false)
const editing = ref<Transaction | null>(null)

const shareVisible = ref(false)

const manageVisible = ref(false)

const categories = ref<Category[]>([])

/** 筛选区只列当前收支方向下的分类，选完收入再切支出时旧分类会被清掉 */
const filterCategories = computed(() =>
  filterType.value ? categories.value.filter((c) => c.type === filterType.value) : categories.value,
)

/** 分享链接只认登录响应里的 shareToken（PLAN §5.9），不要用 book.id 拼 */
const currentBook = computed(() => auth.books.find((b) => b.current) ?? auth.books[0] ?? null)

const shareLink = computed(() =>
  currentBook.value ? `${window.location.origin}/report/${currentBook.value.shareToken}` : '',
)

const topCategories = computed(() => categoryStats.value.slice(0, 5))

async function loadList(): Promise<void> {
  loading.value = true
  try {
    const query: TransactionQuery = { page: page.value, size: size.value }
    if (filterType.value) query.type = filterType.value
    if (filterCategoryId.value) query.categoryId = filterCategoryId.value
    if (dateRange.value) {
      query.startDate = dateRange.value[0]
      query.endDate = dateRange.value[1]
    }
    const kw = keyword.value.trim()
    if (kw) query.keyword = kw

    const resp = await pageTransactions(query)
    list.value = resp.list
    total.value = resp.total

    // 条数变大或删数据后页码可能越界：回到最后一页再拉一次，避免停在空白页
    if (list.value.length === 0 && total.value > 0 && page.value > 1) {
      page.value = Math.max(1, Math.ceil(total.value / size.value))
      await loadList()
    }
  } catch {
    // 401 已由拦截器跳登录页，其余错误已弹提示
  } finally {
    loading.value = false
  }
}

async function loadStats(): Promise<void> {
  statLoading.value = true
  try {
    const month = statMonth.value || undefined
    const [resp, stats] = await Promise.all([fetchSummary(month), fetchCategoryStat(month, 'expense')])
    summary.value = resp
    categoryStats.value = stats
    statMonth.value = resp.month
  } catch {
    summary.value = null
    categoryStats.value = []
  } finally {
    statLoading.value = false
  }
}

async function refresh(): Promise<void> {
  await Promise.all([loadList(), loadStats()])
}

function onSearch(): void {
  page.value = 1
  void loadList()
}

function onReset(): void {
  filterType.value = ''
  filterCategoryId.value = null
  dateRange.value = null
  keyword.value = ''
  page.value = 1
  void loadList()
}

function onTypeChange(): void {
  // 分类下拉跟着方向变，切方向时把不属于新方向的已选分类清掉
  if (filterCategoryId.value && !filterCategories.value.some((c) => c.id === filterCategoryId.value)) {
    filterCategoryId.value = null
  }
  onSearch()
}

function onPageChange(value: number): void {
  page.value = value
  void loadList()
}

/** 换每页条数必须回第 1 页：停在原来的页码上多半会越界 */
function onSizeChange(): void {
  page.value = 1
  void loadList()
}

async function onExport(): Promise<void> {
  if (exporting.value) return
  exporting.value = true
  try {
    // 有日期筛选就导这一段，没有就整本；区间由后端解释（含首尾）
    const params = dateRange.value
      ? { startDate: dateRange.value[0], endDate: dateRange.value[1] }
      : {}
    const file = await exportTransactions(params)
    saveBlob(file.blob, file.filename)
    ElMessage.success('已开始下载')
  } catch {
    // 参数错误（如区间颠倒）时后端回的是 JSON 信封，request.ts 已经弹过提示
  } finally {
    exporting.value = false
  }
}

async function copyShareLink(): Promise<void> {
  if (!shareLink.value) return
  try {
    await navigator.clipboard.writeText(shareLink.value)
    ElMessage.success('链接已复制')
  } catch {
    // 局域网 http 下 clipboard API 不可用（非安全上下文），只能提示手动复制
    ElMessage.warning('复制失败，请手动选中链接复制')
  }
}

function openCreate(): void {
  editing.value = null
  dialogVisible.value = true
}

/** 顶栏账本下拉：直接切换某一本，或打开管理弹窗 */
async function onBookCommand(command: string): Promise<void> {
  if (command === 'manage') {
    manageVisible.value = true
    return
  }
  const id = Number(command)
  if (!id || id === currentBook.value?.id) return
  try {
    auth.setBooks(await switchBook(id))
    ElMessage.success(`已切换到「${currentBook.value?.name ?? ''}」`)
    await onBooksChanged()
  } catch {
    // 提示已由拦截器弹出
  }
}

/** 当前账本变了（切换/新建/删除）：分类也必须重拉，两本账本的分类 id 完全不同 */
async function onBooksChanged(): Promise<void> {
  filterCategoryId.value = null
  page.value = 1
  categories.value = await listCategories().catch(() => [])
  await refresh()
}

function openEdit(tx: Transaction): void {
  editing.value = tx
  dialogVisible.value = true
}

async function onDelete(tx: Transaction): Promise<void> {
  const confirmed = await ElMessageBox.confirm(
    `确定删除「${tx.categoryName} ${tx.amount} 元」这笔吗？`,
    '删除流水',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
  ).catch(() => false)
  if (!confirmed) return

  try {
    await deleteTransaction(tx.id)
    ElMessage.success('已删除')
    // 删掉本页最后一条时回退一页，否则会停在空页
    if (list.value.length === 1 && page.value > 1) {
      page.value -= 1
    }
    await refresh()
  } catch {
    // 提示已由拦截器弹出
  }
}

async function onLogout(): Promise<void> {
  auth.logout()
  await router.replace({ name: 'login' })
}

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
  await refresh()
})
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div class="brand">
        <el-dropdown trigger="click" @command="onBookCommand">
          <span class="brand-name brand-switch">{{ currentBook?.name || '班级账本' }} ▾</span>
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
        <span class="brand-user">{{ auth.user?.nickname || auth.user?.username }}</span>
      </div>
      <div class="topbar-actions">
        <el-button text type="primary" :disabled="!shareLink" @click="shareVisible = true">分享</el-button>
        <el-button text type="primary" @click="onLogout">退出</el-button>
      </div>
    </header>

    <section v-loading="statLoading" class="stats">
      <div class="stats-head">
        <span class="stats-title">收支统计</span>
        <el-date-picker
          v-model="statMonth"
          class="stats-month"
          type="month"
          value-format="YYYY-MM"
          placeholder="选择月份"
          :clearable="false"
          @change="loadStats"
        />
      </div>

      <div class="stats-numbers">
        <div class="stat">
          <span class="stat-label">本月收入</span>
          <span class="stat-value income">+￥{{ summary?.income ?? '0.00' }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">本月支出</span>
          <span class="stat-value expense">-￥{{ summary?.expense ?? '0.00' }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">本月结余</span>
          <span class="stat-value">￥{{ summary?.balance ?? '0.00' }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">累计结余</span>
          <span class="stat-value strong">￥{{ summary?.totalBalance ?? '0.00' }}</span>
        </div>
      </div>

      <div v-if="topCategories.length" class="category-stats">
        <div v-for="c in topCategories" :key="c.categoryId" class="category-row">
          <span class="category-name">
            {{ iconOf(c.categoryIcon) }} {{ c.categoryName }}
          </span>
          <span class="category-bar">
            <span
              class="category-bar-inner"
              :style="{ width: `${c.percent}%`, background: colorOf(c.categoryColor) }"
            />
          </span>
          <span class="category-amount">￥{{ c.amount }}</span>
          <span class="category-percent">{{ c.percent }}%</span>
        </div>
      </div>
      <p v-else class="stats-empty">本月还没有支出，分类占比暂时为空</p>
    </section>

    <section class="filters">
      <el-select v-model="filterType" class="filter-type" @change="onTypeChange">
        <el-option label="全部收支" value="" />
        <el-option label="支出" value="expense" />
        <el-option label="收入" value="income" />
      </el-select>

      <el-select v-model="filterCategoryId" class="filter-category" clearable placeholder="全部分类" @change="onSearch">
        <el-option v-for="c in filterCategories" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>

      <el-date-picker
        v-model="dateRange"
        class="filter-date"
        type="daterange"
        value-format="YYYY-MM-DD"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        unlink-panels
        @change="onSearch"
      />

      <el-input
        v-model="keyword"
        class="filter-keyword"
        clearable
        placeholder="搜备注"
        @keyup.enter="onSearch"
        @clear="onSearch"
      />
      <el-button class="filter-reset" @click="onReset">重置</el-button>
      <el-button type="primary" plain :loading="exporting" @click="onExport">
        {{ dateRange ? '导出所选区间' : '导出全部' }}
      </el-button>
    </section>

    <section v-loading="loading" class="tx-list">
      <el-empty v-if="!loading && list.length === 0" description="还没有流水，点右下角记一笔" />

      <article v-for="tx in list" :key="tx.id" class="tx-item">
        <span class="tx-icon" :style="{ background: colorOf(tx.categoryColor) + '22' }">
          {{ iconOf(tx.categoryIcon) }}
        </span>

        <div class="tx-main">
          <div class="tx-line">
            <span class="tx-category">{{ tx.categoryName }}</span>
            <span class="tx-amount" :class="tx.type">
              {{ tx.type === 'income' ? '+' : '-' }}￥{{ tx.amount }}
            </span>
          </div>
          <div class="tx-line">
            <span class="tx-note">{{ tx.note || '—' }}</span>
            <span class="tx-date">{{ tx.transDate }}</span>
          </div>
        </div>

        <div class="tx-actions">
          <el-button text size="small" @click="openEdit(tx)">改</el-button>
          <el-button text size="small" type="danger" @click="onDelete(tx)">删</el-button>
        </div>
      </article>
    </section>

    <footer class="pager">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="size"
        :page-sizes="[10, 20, 50, 100]"
        :total="total"
        layout="total, sizes, prev, pager, next, jumper"
        size="small"
        background
        @size-change="onSizeChange"
        @current-change="onPageChange"
      />
    </footer>

    <el-button class="fab" type="primary" circle size="large" @click="openCreate">记一笔</el-button>

    <TransactionFormDialog
      v-model="dialogVisible"
      :categories="categories"
      :editing="editing"
      @saved="refresh"
    />

    <BookManageDialog v-model="manageVisible" @changed="onBooksChanged" />

    <el-dialog v-model="shareVisible" title="分享给同学看" width="min(480px, 92vw)">
      <p class="share-tip">
        任何人打开这个链接都能看到本月收支，<strong>不需要登录</strong>，页面上没有你的用户名和邮箱。
      </p>
      <el-input :model-value="shareLink" readonly>
        <template #append>
          <el-button @click="copyShareLink">复制</el-button>
        </template>
      </el-input>
      <p class="share-tip">链接里的 token 就是账本的公示凭证，转发前确认对象。</p>
    </el-dialog>
  </div>
</template>

<style scoped>
.page {
  max-width: 720px;
  margin: 0 auto;
  padding: 16px 16px 96px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.brand-name {
  font-size: 18px;
  font-weight: 600;
}

.brand-switch {
  cursor: pointer;
}

.brand-user {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.topbar-actions {
  display: flex;
}

.stats {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: 12px;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  color: #fff;
}

.stats-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.stats-title {
  font-size: 13px;
  opacity: 0.9;
}

.stats-month {
  width: 130px;
}

.stats-numbers {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.stat {
  display: grid;
  gap: 2px;
}

.stat-label {
  font-size: 11px;
  opacity: 0.8;
}

.stat-value {
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.stat-value.strong {
  font-size: 16px;
}

.stat-value.income {
  color: #bbf7d0;
}

.stat-value.expense {
  color: #fecaca;
}

.category-stats {
  display: grid;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px solid rgb(255 255 255 / 20%);
}

.category-row {
  display: grid;
  grid-template-columns: 90px 1fr 78px 52px;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.category-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-bar {
  height: 6px;
  border-radius: 3px;
  background: rgb(255 255 255 / 25%);
  overflow: hidden;
}

.category-bar-inner {
  display: block;
  height: 100%;
  border-radius: 3px;
}

.category-amount,
.category-percent {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.stats-empty {
  margin: 0;
  font-size: 12px;
  opacity: 0.8;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 16px 0;
}

.filter-type {
  width: 110px;
}

.filter-category {
  width: 130px;
}

.filter-date {
  width: 240px;
}

.filter-keyword {
  width: 140px;
}

.tx-list {
  min-height: 160px;
  display: grid;
  gap: 8px;
}

.tx-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 10px;
  background: var(--el-bg-color);
  box-shadow: 0 1px 2px rgb(0 0 0 / 6%);
}

.tx-icon {
  flex: none;
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-size: 18px;
}

.tx-main {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 4px;
}

.tx-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.tx-category {
  font-weight: 600;
}

.tx-amount {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  white-space: nowrap;
}

.tx-amount.income {
  color: #10b981;
}

.tx-amount.expense {
  color: #ef4444;
}

.tx-note,
.tx-date {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.tx-note {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-actions {
  flex: none;
  display: flex;
}

.pager {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}

.fab {
  position: fixed;
  right: 24px;
  bottom: 24px;
  box-shadow: 0 6px 16px rgb(59 130 246 / 40%);
}

.share-tip {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

@media (max-width: 520px) {
  .stats-numbers {
    grid-template-columns: repeat(2, 1fr);
  }

  .category-row {
    grid-template-columns: 80px 1fr 70px 46px;
  }

  .filter-type,
  .filter-category,
  .filter-keyword {
    flex: 1;
    width: auto;
  }

  .filter-date {
    width: 100%;
  }

  /* 窄屏放不下「总数 + 条数 + 页码 + 跳页」：先藏跳页，保留总数与条数选择 */
  .pager :deep(.el-pagination__jump) {
    display: none;
  }
}
</style>