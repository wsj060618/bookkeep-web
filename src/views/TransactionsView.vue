<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  deleteTransaction,
  deleteTransactions,
  exportTransactions,
  importTransactions,
  pageTransactions,
} from '../api/transaction'
import { saveBlob } from '../api/request'
import { exportBookReceipts } from '../api/receipt'
import { useShell } from '../composables/shell'
import { useIsMobile } from '../composables/useIsMobile'
import { useAuthStore } from '../stores/auth'
import TxItem from '../components/TxItem.vue'
import ReceiptGalleryDialog from '../components/ReceiptGalleryDialog.vue'
import type { ImportResult, Transaction, TransactionQuery, TxType } from '../types/api'

/**
 * 流水页：筛选 + 分页 + 导出 + 改/删。
 * 分类下拉取自 layout（切账本时 layout 会重拉），表单弹窗也在 layout，「改」只是把这条流水丢过去。
 */

const shell = useShell()
const auth = useAuthStore()

/** 归档账本只读：流水行的「编辑 / 删除」一起收起来（后端也会拦） */
const archived = computed(() => (auth.books.find((b) => b.current) ?? null)?.archived === true)

/* ---------- 勾选与批量删除 ---------- */

const selected = ref<number[]>([])
const batchDeleting = ref(false)

const allSelected = computed(() => list.value.length > 0 && selected.value.length === list.value.length)
const someSelected = computed(
  () => selected.value.length > 0 && selected.value.length < list.value.length,
)

function toggleSelectAll(value: boolean | string | number): void {
  selected.value = value ? list.value.map((tx) => tx.id) : []
}

async function onBatchDelete(): Promise<void> {
  if (!selected.value.length || batchDeleting.value) return
  const count = selected.value.length
  const confirmed = await ElMessageBox.confirm(
    `确定删除选中的 ${count} 笔流水吗？删除后不可恢复。`,
    '批量删除流水',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
  )
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return

  batchDeleting.value = true
  try {
    const deleted = await deleteTransactions(selected.value)
    ElMessage.success(`已删除 ${deleted} 笔`)
    selected.value = []
    // 删完可能当前页空了：回退一页再重拉
    if (deleted >= list.value.length && page.value > 1) {
      page.value -= 1
    }
    shell.notifyTxChanged()
  } catch {
    // 提示已由拦截器弹出
  } finally {
    batchDeleting.value = false
  }
}

const loading = ref(false)
const list = ref<Transaction[]>([])
const total = ref(0)
const page = ref(1)
const size = ref(10)
const exporting = ref(false)

const filterType = ref<TxType | ''>('')
const filterCategoryId = ref<number | null>(null)
const dateRange = ref<[string, string] | null>(null)
/** 手机上的两个单日选择器：daterange 面板在窄屏放不下，所以拆开渲染（见模板注释） */
const isMobile = useIsMobile()
const startDate = ref('')
const endDate = ref('')

/** 桌面选完区间，手机那两个框要跟着回显；反过来由 onMobileDateChange 同步 */
watch(dateRange, (value) => {
  startDate.value = value?.[0] ?? ''
  endDate.value = value?.[1] ?? ''
})

function onMobileDateChange(): void {
  // 只填一头等于没筛（后端把 null 当不限），这里要求两个都填
  dateRange.value = startDate.value && endDate.value ? [startDate.value, endDate.value] : null
  onSearch()
}
const keyword = ref('')

/** 筛选区只列当前收支方向下的分类，选完收入再切支出时旧分类会被清掉 */
const filterCategories = computed(() =>
  filterType.value
    ? shell.categories.value.filter((c) => c.type === filterType.value)
    : shell.categories.value,
)

async function loadList(): Promise<void> {
  // 任何一次重拉都清空勾选：列表内容变了，旧 id 可能已经不在本页
  selected.value = []
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

/** 分类在别的页面被删掉后，筛选里那个 id 就不存在了，清掉再查，否则列表永远空白 */
watch(shell.categories, () => {
  if (filterCategoryId.value && !shell.categories.value.some((c) => c.id === filterCategoryId.value)) {
    filterCategoryId.value = null
    onSearch()
  }
})

function onPageChange(value: number): void {
  page.value = value
  void loadList()
}

/** 换每页条数必须回第 1 页：停在原来的页码上多半会越界 */
function onSizeChange(): void {
  page.value = 1
  void loadList()
}

async function onExport(format: 'csv' | 'xlsx' | 'receipts'): Promise<void> {
  if (exporting.value) return
  exporting.value = true
  try {
    if (format === 'receipts') {
      // 票据打包：和流水导出同一套日期区间；没有票据时后端回 400 文案
      const params = dateRange.value
        ? { startDate: dateRange.value[0], endDate: dateRange.value[1] }
        : {}
      const zip = await exportBookReceipts(params)
      saveBlob(zip.blob, zip.filename)
      ElMessage.success('已开始下载')
      return
    }
    // 有日期筛选就导这一段，没有就整本；区间由后端解释（含首尾）
    const params = dateRange.value
      ? { startDate: dateRange.value[0], endDate: dateRange.value[1], format }
      : { format }
    const file = await exportTransactions(params)
    saveBlob(file.blob, file.filename)
    ElMessage.success('已开始下载')
  } catch {
    // 参数错误（如区间颠倒）时后端回的是 JSON 信封，request.ts 已经弹过提示
  } finally {
    exporting.value = false
  }
}

/* ---------- 票据图集 ---------- */

const galleryVisible = ref(false)
const galleryTx = ref<Transaction | null>(null)

function openGallery(tx: Transaction): void {
  galleryTx.value = tx
  galleryVisible.value = true
}

/** 票据增删后徽标数字要变：只重新拉列表，不动筛选条件 */
function onReceiptsChanged(): void {
  void loadList()
}

/* ---------- 导入 ---------- */

const importVisible = ref(false)
const importing = ref(false)
const pickedFile = ref<File | null>(null)
const importResult = ref<ImportResult | null>(null)

function openImport(): void {
  pickedFile.value = null
  importResult.value = null
  importVisible.value = true
}

function onPickFile(uploadFile: { raw?: File }): void {
  pickedFile.value = uploadFile.raw ?? null
  importResult.value = null
}

/** 模板就是一行表头 + 一行示例，用户照着填最省事 */
function downloadTemplate(): void {
  const csv =
    '\uFEFF日期,类型,分类,金额,备注\r\n' +
    '2026-09-05,收入,收取班费,1900.00,全班 38 人 × 50\r\n' +
    '2026-09-20,支出,聚餐,620.00,中秋聚餐\r\n'
  saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), '流水导入模板.csv')
}

async function onImport(): Promise<void> {
  if (!pickedFile.value || importing.value) return
  importing.value = true
  try {
    importResult.value = await importTransactions(pickedFile.value)
    const result = importResult.value
    if (result.success > 0) {
      ElMessage.success(`已导入 ${result.success} 笔`)
      // 让列表与统计页都刷新（版本号 +1）
      shell.notifyTxChanged()
    } else {
      ElMessage.warning('没有可导入的行，请按失败原因修改后重传')
    }
    if (result.failed.length === 0) {
      importVisible.value = false
    }
  } catch {
    // 文件为空 / 格式不支持等 400 已由拦截器弹出
  } finally {
    importing.value = false
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

      <!-- 手机上 daterange 的面板宽 646px，右半边（含「确定」）会跑出屏幕：
           这里换成两个单日选择器，各 322px，装得下也好点 -->
      <template v-if="isMobile">
        <el-date-picker
          v-model="startDate"
          class="filter-date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="开始日期"
          @change="onMobileDateChange"
        />
        <el-date-picker
          v-model="endDate"
          class="filter-date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="结束日期"
          @change="onMobileDateChange"
        />
      </template>
      <el-date-picker
        v-else
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
        <el-button :disabled="archived" @click="openImport">导入</el-button>
        <el-dropdown trigger="click" @command="onExport">
          <el-button type="primary" plain :loading="exporting">
            {{ dateRange ? '导出所选区间 ▾' : '导出 ▾' }}
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="csv">CSV（通用）</el-dropdown-item>
              <el-dropdown-item command="xlsx">Excel（带统计图）</el-dropdown-item>
              <el-dropdown-item command="receipts" divided>票据（zip，按账本/月份）</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </section>

    <section class="batch-bar">
      <el-checkbox
        :model-value="allSelected"
        :indeterminate="someSelected"
        :disabled="archived || list.length === 0"
        @change="toggleSelectAll"
      >
        全选本页
      </el-checkbox>
      <span class="batch-count">已选 {{ selected.length }} / {{ list.length }} 笔</span>
      <el-button
        type="danger"
        plain
        size="small"
        :disabled="!selected.length || archived"
        :loading="batchDeleting"
        @click="onBatchDelete"
      >
        删除所选
      </el-button>
    </section>

    <section v-loading="loading" class="tx-list">
      <el-empty v-if="!loading && list.length === 0" description="还没有流水，点「记一笔」开始" />

      <div v-for="tx in list" :key="tx.id" class="tx-row">
        <el-checkbox v-model="selected" :value="tx.id" class="tx-check" :disabled="archived" />
        <TxItem
          class="tx-item"
          :tx="tx"
          :actions="!archived"
          @edit="shell.openEdit"
          @remove="onDelete"
          @receipts="openGallery"
        />
      </div>
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

    <el-dialog v-model="importVisible" title="导入流水" width="min(560px, 94vw)">
      <p class="import-tip">
        只支持 <b>CSV</b>（Excel 里「另存为 → CSV UTF-8（逗号分隔）」）。列固定为：
        日期 / 类型 / 分类 / 金额 / 备注。类型填「收入」「支出」（也认 income / expense）；
        金额需在 <b>0.01 ~ 999,999.99</b> 之间、最多两位小数；
        分类必须已经在当前账本里，<b>不会自动新建分类</b>。
      </p>

      <div class="import-row">
        <el-upload
          :auto-upload="false"
          :show-file-list="false"
          accept=".csv"
          :on-change="onPickFile"
        >
          <el-button>选择 CSV 文件</el-button>
        </el-upload>
        <el-button link type="primary" @click="downloadTemplate">下载模板</el-button>
        <span v-if="pickedFile" class="import-file">{{ pickedFile.name }}</span>
      </div>

      <div v-if="importResult" class="import-result">
        <p class="import-summary">
          成功导入 <b>{{ importResult.success }}</b> 笔<template v-if="importResult.failed.length">
            ，失败 <b>{{ importResult.failed.length }}</b> 行（改好再传一次即可）
          </template>
        </p>
        <el-table
          v-if="importResult.failed.length"
          :data="importResult.failed"
          size="small"
          max-height="240"
        >
          <el-table-column prop="line" label="行号" width="80" />
          <el-table-column prop="reason" label="原因" />
        </el-table>
      </div>

      <template #footer>
        <el-button @click="importVisible = false">关闭</el-button>
        <el-button
          type="primary"
          :disabled="!pickedFile"
          :loading="importing"
          @click="onImport"
        >
          开始导入
        </el-button>
      </template>
    </el-dialog>

    <!-- 票据图集：点流水右侧的 📎 打开 -->
    <ReceiptGalleryDialog
      v-model="galleryVisible"
      :transaction="galleryTx"
      @changed="onReceiptsChanged"
    />
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

.batch-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin: 4px 0 10px;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--el-fill-color-lighter);
}

.batch-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-right: auto;
}

.tx-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.tx-check {
  margin-top: 10px;
  flex: none;
}

.tx-item {
  flex: 1;
  min-width: 0;
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

.import-tip {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}

.import-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}

.import-file {
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.import-result {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.import-summary {
  margin: 0 0 8px;
  font-size: 13px;
}

@media (max-width: 767px) {
  .filter-type,
  .filter-category,
  .filter-keyword {
    flex: 1;
    width: auto;
  }

  /* 手机上日期是两个单日选择器，并排放一行（各占一半，日期字符串才不会被挤没） */
  .filter-date {
    flex: 1 1 calc(50% - 4px);
    width: auto;
    min-width: 0;
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