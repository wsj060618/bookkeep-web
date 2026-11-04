<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listCategories } from '../api/category'
import { deleteTransaction, fetchBalance, pageTransactions } from '../api/transaction'
import type { Category, Transaction, TransactionQuery, TxType } from '../types/api'
import { useAuthStore } from '../stores/auth'
import TransactionFormDialog from '../components/TransactionFormDialog.vue'
import { colorOf, iconOf } from '../utils/category'

/**
 * 首页 = 流水列表 + 记一笔。
 * 验收标准是可观察行为：连点只发一次请求、刷新后数据还在、空数据显示 0.00。
 */

const router = useRouter()
const auth = useAuthStore()

const loading = ref(false)
const list = ref<Transaction[]>([])
const total = ref(0)
const page = ref(1)
const size = ref(10)
const balance = ref('0.00')
const categories = ref<Category[]>([])

const filterType = ref<TxType | ''>('')
const filterCategoryId = ref<number | null>(null)
const dateRange = ref<[string, string] | null>(null)
const keyword = ref('')

const dialogVisible = ref(false)
const editing = ref<Transaction | null>(null)

/** 筛选区只列当前收支方向下的分类，选完收入再切支出时旧分类会被清掉 */
const filterCategories = computed(() =>
  filterType.value ? categories.value.filter((c) => c.type === filterType.value) : categories.value,
)

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
  } catch {
    // 401 已由拦截器跳登录页，其余错误已弹提示
  } finally {
    loading.value = false
  }
}

async function loadBalance(): Promise<void> {
  try {
    balance.value = await fetchBalance()
  } catch {
    balance.value = '0.00'
  }
}

async function refresh(): Promise<void> {
  await Promise.all([loadList(), loadBalance()])
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

function openCreate(): void {
  editing.value = null
  dialogVisible.value = true
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
  categories.value = await listCategories().catch(() => [])
  await refresh()
})
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div class="brand">
        <span class="brand-name">班级账本</span>
        <span class="brand-user">{{ auth.user?.nickname || auth.user?.username }}</span>
      </div>
      <el-button text type="primary" @click="onLogout">退出</el-button>
    </header>

    <section class="balance-card">
      <span class="balance-label">当前结余</span>
      <span class="balance-value" :class="{ negative: balance.startsWith('-') }">￥{{ balance }}</span>
      <span class="balance-hint">累计收入 − 累计支出</span>
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
        :current-page="page"
        :page-size="size"
        :total="total"
        layout="prev, pager, next"
        :hide-on-single-page="true"
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

.brand-user {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.balance-card {
  display: grid;
  gap: 4px;
  padding: 16px;
  border-radius: 12px;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  color: #fff;
}

.balance-label {
  font-size: 12px;
  opacity: 0.85;
}

.balance-value {
  font-size: 26px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.balance-value.negative {
  color: #fecaca;
}

.balance-hint {
  font-size: 11px;
  opacity: 0.75;
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

@media (max-width: 520px) {
  .filter-type,
  .filter-category,
  .filter-keyword {
    flex: 1;
    width: auto;
  }

  .filter-date {
    width: 100%;
  }
}
</style>