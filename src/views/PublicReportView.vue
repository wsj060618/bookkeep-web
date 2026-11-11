<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { fetchPublicReport } from '../api/public'
import CategoryChartCard from '../components/CategoryChartCard.vue'
import ReceiptGalleryDialog from '../components/ReceiptGalleryDialog.vue'
import TextPeekDialog from '../components/TextPeekDialog.vue'
import { useIsMobile } from '../composables/useIsMobile'

/** 收支对比图按需加载（ECharts 只在真要画图时才拉） */
const CompareChart = defineAsyncComponent(() => import('../components/CompareChart.vue'))
import type { PublicBookReport, PublicReport, ReportTransaction } from '../types/api'
import { colorOf, iconOf } from '../utils/category'
import { isTruncated } from '../utils/ellipsis'
import { formatMoney } from '../utils/money'

/**
 * 只读公示页 /report/{token}：免登录、只有账本名与金额、没有任何个人信息。
 * 这个页面永远不能出现「登录」「记一笔」这类入口——它是要转发到班群的。
 * <p>分类占比是**收入、支出两张卡片**（收入在左、支出在右），每张卡自己切柱状图 / 饼图 / 环形图。
 */

const route = useRoute()
const token = computed(() => String(route.params.token ?? ''))
const isMobile = useIsMobile()

const report = ref<PublicReport | null>(null)
const loading = ref(false)
const failed = ref(false)
/** 空 = 全部时间；有值 = [开始月, 结束月]，都是 yyyy-MM */
const monthRange = ref<[string, string] | null>(null)
/** 当前查看的账本：一条链接可以带多本，用标签页切换 */
const activeBookId = ref<number | null>(null)

const startMonth = computed(() => monthRange.value?.[0])
const endMonth = computed(() => monthRange.value?.[1])

const rangeText = computed(() => {
  if (!startMonth.value && !endMonth.value) return '全部时间'
  return `${startMonth.value || '最早'} ~ ${endMonth.value || '至今'}`
})

const books = computed(() => report.value?.books ?? [])
const current = computed<PublicBookReport | null>(() => {
  if (!books.value.length) return null
  return books.value.find((b) => b.bookId === activeBookId.value) ?? books.value[0]
})

/**
 * 图里的「结余」柱是区间收支差，和卡片上的「结余」（区间末账户余额）不是一个东西：
 * 余额通常大得多，混在一根坐标轴上另外两根柱会被压扁。
 */
const chartBalance = computed(
  () => (Number(current.value?.income ?? 0) - Number(current.value?.expense ?? 0)).toFixed(2),
)

const incomeCategories = computed(() => current.value?.incomeCategories ?? [])
const expenseCategories = computed(() => current.value?.expenseCategories ?? [])

/* ---------- 明细分页：数据一次性拉回来，翻页只在本地切片（只读页，没有写操作要跟服务端同步） ---------- */

const PAGE_SIZES = [10, 20, 50]
const page = ref(1)
const size = ref(10)

const total = computed(() => current.value?.transactions.length ?? 0)

const pagedTransactions = computed(() => {
  const list = current.value?.transactions ?? []
  const start = (page.value - 1) * size.value
  return list.slice(start, start + size.value)
})

const maxPage = computed(() => Math.max(1, Math.ceil(total.value / size.value)))

// 换账本 / 换区间 / 换每页条数后回到第一页，否则会停在一个不存在的页码上
watch([activeBookId, monthRange, size], () => {
  page.value = 1
})

watch(maxPage, (max) => {
  if (page.value > max) page.value = max
})

/* 票据图集：点徽标打开，只读 */
const galleryVisible = ref(false)
const galleryTx = ref<ReportTransaction | null>(null)

function openGallery(tx: ReportTransaction): void {
  galleryTx.value = tx
  galleryVisible.value = true
}

const galleryHead = computed(() => {
  const tx = galleryTx.value
  return tx ? `${tx.categoryName} · ${tx.transDate} · ￥${tx.amount}` : ''
})

/* 被省略号截断的文字：点一下看全文 */
const peekVisible = ref(false)
const peekTitle = ref('')
const peekText = ref('')

function onPeek(event: MouseEvent, text: string | null, title: string): void {
  if (!text || !isTruncated(event.currentTarget)) return
  peekTitle.value = title
  peekText.value = text
  peekVisible.value = true
}

async function load(): Promise<void> {
  if (!token.value) {
    failed.value = true
    return
  }
  loading.value = true
  failed.value = false
  try {
    const resp = await fetchPublicReport(token.value, startMonth.value, endMonth.value)
    report.value = resp
    // 保持当前选中的账本；它不在这次结果里（比如被彻底删了）就回到第一本
    if (!resp.books.some((b) => b.bookId === activeBookId.value)) {
      activeBookId.value = resp.books[0]?.bookId ?? null
    }
  } catch {
    // token 不存在/账本已注销 → 后端 code=404，拦截器已弹提示，这里只切到错误态
    failed.value = true
    report.value = null
  } finally {
    loading.value = false
  }
}

/** 重置：清空区间，回到「全部时间」 */
function onReset(): void {
  monthRange.value = null
  void load()
}

// 同一个人可能改地址栏里的 token 直接换一条链接看
watch(token, () => {
  monthRange.value = null
  activeBookId.value = null
  void load()
})

onMounted(load)
</script>

<template>
  <div class="page">
    <header class="header">
      <!-- 多本账本时标题改成通用名，账本本身交给右侧下拉（避免标题与下拉重复） -->
      <h1 class="title">{{ books.length > 1 ? '班费公示' : (current?.bookName ?? '班级账本') }}</h1>
      <span class="badge">只读公示</span>

      <el-select
        v-if="books.length > 1"
        v-model="activeBookId"
        size="small"
        class="book-select"
      >
        <el-option v-for="b in books" :key="b.bookId" :value="b.bookId" :label="b.bookName" />
      </el-select>
    </header>

    <el-result v-if="failed" icon="warning" title="公示页不存在或已失效" sub-title="请向分享链接的同学确认地址是否完整">
    </el-result>

    <template v-else>
      <section v-loading="loading" class="card">
        <div class="card-head">
          <span class="month-label">{{ rangeText }}</span>

          <div class="range-actions">
            <el-date-picker
              v-model="monthRange"
              class="month-picker"
              type="monthrange"
              value-format="YYYY-MM"
              range-separator="至"
              start-placeholder="开始月份"
              end-placeholder="结束月份"
              @change="load"
            />
            <el-button :disabled="!monthRange" @click="onReset">重置</el-button>
          </div>
        </div>

        <div class="numbers">
          <div class="number">
            <span class="label">收入</span>
            <span class="value income">+￥{{ current?.income ?? '0.00' }}</span>
          </div>
          <div class="number">
            <span class="label">支出</span>
            <span class="value expense">-￥{{ current?.expense ?? '0.00' }}</span>
          </div>
          <div class="number">
            <span class="label">结余</span>
            <span class="value strong">{{ formatMoney(current?.balance) }}</span>
          </div>
        </div>
      </section>

      <!-- 收支对比：和统计页同一套图（柱状：收入/支出/结余；环形：收支占比） -->
      <section v-loading="loading" class="card">
        <h2 class="card-title">收支对比</h2>
        <div class="compare-row">
          <div class="compare-block">
            <header class="compare-head">金额对比（柱状）</header>
            <CompareChart
              type="bar"
              :income="current?.income ?? '0.00'"
              :expense="current?.expense ?? '0.00'"
              :balance="chartBalance"
            />
          </div>
          <div class="compare-block">
            <header class="compare-head">收支占比（环形）</header>
            <CompareChart
              type="donut"
              :income="current?.income ?? '0.00'"
              :expense="current?.expense ?? '0.00'"
              :balance="chartBalance"
            />
          </div>
        </div>
      </section>

      <div class="charts-row">
        <CategoryChartCard
          v-loading="loading"
          title="收入"
          tone="income"
          :items="incomeCategories"
        />
        <CategoryChartCard
          v-loading="loading"
          title="支出"
          tone="expense"
          :items="expenseCategories"
        />
      </div>

      <section v-loading="loading" class="card">
        <h2 class="card-title">明细（按日期升序，结余为逐行累计）</h2>

        <p v-if="!loading && !current?.transactions.length" class="empty">这段时间还没有流水</p>

        <ul class="tx-list">
          <li v-for="(tx, index) in pagedTransactions" :key="`${page}-${index}`" class="tx-item">
            <span class="tx-icon" :style="{ background: colorOf(tx.categoryColor) + '22' }">
              {{ iconOf(tx.categoryIcon) }}
            </span>
            <div class="tx-main">
              <div class="tx-line">
                <span class="tx-category" @click="onPeek($event, tx.categoryName, '分类')">{{
                  tx.categoryName
                }}</span>
                <span class="tx-amount" :class="tx.type">
                  {{ tx.type === 'income' ? '+' : '-' }}￥{{ tx.amount }}
                </span>
              </div>
              <div class="tx-line">
                <span class="tx-note" @click="onPeek($event, tx.note, '备注')">{{
                  tx.note || '—'
                }}</span>
                <span class="tx-tail">
                  <!-- 和管理端同一个徽标：点开看票据图集（只读） -->
                  <button
                    v-if="tx.receiptCount > 0"
                    type="button"
                    class="tx-receipt"
                    :title="`${tx.receiptCount} 张票据`"
                    @click="openGallery(tx)"
                  >
                    📎 {{ tx.receiptCount }}
                  </button>
                  <span class="tx-date">{{ tx.transDate }} · 结余 {{ formatMoney(tx.balanceAfter) }}</span>
                </span>
              </div>
            </div>
          </li>
        </ul>

        <div v-if="total > 0" class="pager">
          <el-select v-model="size" class="size-select" size="small">
            <el-option v-for="n in PAGE_SIZES" :key="n" :label="`${n} 条/页`" :value="n" />
          </el-select>
          <el-pagination
            v-model:current-page="page"
            :page-size="size"
            :total="total"
            :layout="isMobile ? 'prev, pager, next' : 'total, prev, pager, next'"
            size="small"
            background
          />
        </div>
      </section>

      <footer class="footer">
        本页为只读公示，数据来自班级账本，不含任何个人信息。如需更正请联系生活委员。
        <template v-if="report?.expiresAt">（本链接有效期至 {{ report.expiresAt }}）</template>
      </footer>
    </template>

    <ReceiptGalleryDialog
      v-model="galleryVisible"
      readonly
      :share-token="token"
      :public-receipts="galleryTx?.receipts ?? []"
      :head-text="galleryHead"
    />

    <TextPeekDialog v-model="peekVisible" :title="peekTitle" :text="peekText" />
  </div>
</template>

<style scoped>
.page {
  max-width: 720px;
  margin: 0 auto;
  padding: 16px;
}

.header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.title {
  margin: 0;
  font-size: 20px;
}

.badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  color: #3b82f6;
  background: rgb(59 130 246 / 12%);
}

.card {
  margin-bottom: 12px;
  padding: 16px;
  border-radius: 12px;
  background: var(--el-bg-color);
  box-shadow: 0 1px 3px rgb(0 0 0 / 8%);
  min-height: 60px;
}

.card-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

/* 账本切换：放在标题行右侧，一行放得下，账本多少都不挤 */
.book-select {
  margin-left: auto;
  width: 200px;
  max-width: 45%;
}

.month-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.range-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.month-picker {
  width: 260px;
}

.numbers {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.number {
  display: grid;
  gap: 2px;
}

.label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.value {
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* 三个数同样字号，只靠颜色区分：结余用主色（与统计页一致） */
.value.strong {
  color: var(--el-color-primary);
}

.value.income {
  color: #10b981;
}

.value.expense {
  color: #ef4444;
}

.charts-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  margin-bottom: 12px;
}

.compare-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.compare-block {
  min-width: 0;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--el-fill-color-lighter);
}

.compare-head {
  margin-bottom: 2px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.card-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
}

.empty {
  margin: 8px 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.tx-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  /* 同流水页：隐式列默认 auto，长备注会把列撑得比卡片宽 */
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}

.tx-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tx-icon {
  flex: none;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-size: 16px;
}

.tx-main {
  flex: 1;
  min-width: 0;
  display: grid;
  /* 同流水页：隐式列按 max-content 取宽，长备注会撑破整行 */
  grid-template-columns: minmax(0, 1fr);
  gap: 2px;
}

.tx-line {
  display: flex;
  min-width: 0;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.tx-category {
  min-width: 0;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-amount {
  flex: none;
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
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.tx-note {
  /* 同流水页：没有 min-width:0 时 flex 子项按整段 nowrap 文本取宽，永远不省略 */
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 票据徽标：和管理端同一个样式 */
.tx-tail {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.tx-receipt {
  border: none;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--el-fill-color);
  color: var(--el-text-color-regular);
  font-size: 11px;
  line-height: 18px;
  cursor: pointer;
}

.tx-receipt:hover {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.footer {
  margin-top: 20px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
  text-align: center;
}

/* 明细分页：和管理页同一套（每页条数 + 页码） */
.pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 12px;
}

.size-select {
  width: 104px;
}

@media (max-width: 900px) {
  .charts-row,
  .compare-row {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 520px) {
  .numbers {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  /* 三列挤在一起，金额降一档防止长数字被截断 */
  .value {
    font-size: 14px;
  }

  /* 区间选择器独占一行：260px + 重置按钮在窄屏放不下 */
  .card-head {
    align-items: stretch;
  }

  .range-actions {
    width: 100%;
  }

  .month-picker {
    flex: 1;
    width: auto;
    min-width: 0;
  }

  /* 极窄屏：备注独占一行，避免日期/徽标被挤掉 */
  .tx-line {
    flex-wrap: wrap;
    row-gap: 2px;
  }

  .tx-note {
    flex: 1 1 100%;
  }
}
</style>