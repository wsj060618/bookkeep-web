<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { deleteTransaction, exportTransactions, pageTransactions } from '../api/transaction'
import { saveBlob } from '../api/request'
import { useShell } from '../composables/shell'
import TxItem from '../components/TxItem.vue'
import type { Transaction, TransactionQuery, TxType } from '../types/api'

/**
 * 流水页：筛选 + 分页 + 导出 + 改/删。
 * 分类下拉取自 layout（切账本时 layout 会重拉），表单弹窗也在 layout，「改」只是把这条流水丢过去。
 */

const shell = useShell()

const loading = ref(false)
const list = ref<Transaction[]>([])
const total = ref(0)
const page = ref(1)
const size = ref(10)
const exporting = ref(false)

const filterType = ref<TxType | ''>('')
const filterCategoryId = ref<number | null>(null)
const dateRange = ref<[string, string] | null>(null)
const keyword = ref('')

/** 筛选区只列当前收支方向下的分类，选完收入再切支出时旧分类会被清掉 */
const filterCategories = computed(() =>
  filterType.value
    ? shell.categories.value.filter((c) => c.type === filterType.value)
    : shell.categories.value,
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
  if (
    filterCategoryId.value &&
    !filterCategories.value.some((c) => c.id === filterCategoryId.value)
  ) {
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
    // 交给 version 触发重拉，顺带让统计页的数据也更新
    shell.notifyTxChanged()
  } catch {
    // 提示已由拦截器弹出
  }
}

watch(shell.txVersion, () => {
  void loadList()
})

onMounted(() => {
  void loadList()
})
</script>

<template>
  <div class="tx-page">
    <section class="filters">
      <el-select v-model="filterType" class="filter-type" @change="onTypeChange">
        <el-option label="全部收支" value="" />
        <el-option label="支出" value="expense" />
        <el-option label="收入" value="income" />
      </el-select>

      <el-select
        v-model="filterCategoryId"
        class="filter-category"
        clearable
        placeholder="全部分类"
        @change="onSearch"
      >
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

      <div class="filter-actions">
        <el-button @click="onReset">重置</el-button>
        <el-button type="primary" plain :loading="exporting" @click="onExport">
          {{ dateRange ? '导出所选区间' : '导出全部' }}
        </el-button>
      </div>
    </section>

    <section v-loading="loading" class="tx-list">
      <el-empty v-if="!loading && list.length === 0" description="还没有流水，点「记一笔」开始" />

      <TxItem
        v-for="tx in list"
        :key="tx.id"
        :tx="tx"
        actions
        @edit="shell.openEdit"
        @remove="onDelete"
      />
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
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
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
  width: 160px;
}

.filter-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.tx-list {
  min-height: 200px;
  display: grid;
  gap: 8px;
}

.pager {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}

@media (max-width: 767px) {
  .filter-type,
  .filter-category,
  .filter-keyword {
    flex: 1;
    width: auto;
  }

  .filter-date {
    width: 100%;
  }

  .filter-actions {
    width: 100%;
    margin-left: 0;
  }

  .filter-actions .el-button {
    flex: 1;
  }

  /* 窄屏放不下「总数 + 条数 + 页码 + 跳页」：先藏跳页，保留总数与条数选择 */
  .pager :deep(.el-pagination__jump) {
    display: none;
  }
}
</style>