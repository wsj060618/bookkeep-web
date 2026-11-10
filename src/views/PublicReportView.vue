<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { fetchPublicReport } from '../api/public'
import { publicReceiptUrl } from '../api/receipt'
import CategoryChartCard from '../components/CategoryChartCard.vue'

/** 收支对比图按需加载（ECharts 只在真要画图时才拉） */
const CompareChart = defineAsyncComponent(() => import('../components/CompareChart.vue'))
import type { PublicBookReport, PublicReport } from '../types/api'
import { colorOf, iconOf } from '../utils/category'

/**
 * 只读公示页 /report/{token}：免登录、只有账本名与金额、没有任何个人信息。
 * 这个页面永远不能出现「登录」「记一笔」这类入口——它是要转发到班群的。
 * <p>分类占比是**收入、支出两张卡片**（收入在左、支出在右），每张卡自己切柱状图 / 饼图 / 环形图。
 */

const route = useRoute()
const token = computed(() => String(route.params.token ?? ''))

const report = ref<PublicReport | null>(null)
const loading = ref(false)
const failed = ref(false)
const month = ref('')
/** 当前查看的账本：一条链接可以带多本，用标签页切换 */
const activeBookId = ref<number | null>(null)

const books = computed(() => report.value?.books ?? [])
const current = computed<PublicBookReport | null>(() => {
  if (!books.value.length) return null
  return books.value.find((b) => b.bookId === activeBookId.value) ?? books.value[0]
})

const incomeCategories = computed(() => current.value?.incomeCategories ?? [])
const expenseCategories = computed(() => current.value?.expenseCategories ?? [])

async function load(): Promise<void> {
  if (!token.value) {
    failed.value = true
    return
  }
  loading.value = true
  failed.value = false
  try {
    const resp = await fetchPublicReport(token.value, month.value || undefined)
    report.value = resp
    // 回显后端实际统计的月份（不传时是当月）
    month.value = resp.books[0]?.month ?? ''
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

// 同一个人可能改地址栏里的 token 直接换一条链接看
watch(token, () => {
  month.value = ''
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
          <span class="month-label">{{ current?.month ?? '' }} 收支</span>

          <el-date-picker
            v-model="month"
            class="month-picker"
            type="month"
            value-format="YYYY-MM"
            placeholder="选择月份"
            :clearable="false"
            @change="load"
          />
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
            <span class="label">本月结余</span>
            <span class="value">￥{{ current?.balance ?? '0.00' }}</span>
          </div>
          <div class="number">
            <span class="label">累计结余</span>
            <span class="value strong">￥{{ current?.totalBalance ?? '0.00' }}</span>
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
              :balance="current?.balance ?? '0.00'"
            />
          </div>
          <div class="compare-block">
            <header class="compare-head">收支占比（环形）</header>
            <CompareChart
              type="donut"
              :income="current?.income ?? '0.00'"
              :expense="current?.expense ?? '0.00'"
              :balance="current?.balance ?? '0.00'"
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

        <p v-if="!loading && !current?.transactions.length" class="empty">本月还没有流水</p>

        <ul class="tx-list">
          <li v-for="(tx, index) in current?.transactions" :key="index" class="tx-item">
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
                <span class="tx-tail">
                  <!-- 票据徽标：和管理端一样，点开列出票据链接（有 10 张也不会撑开行高） -->
                  <el-popover
                    v-if="tx.receiptCount > 0"
                    placement="top"
                    trigger="click"
                    :width="200"
                    popper-class="receipt-pop"
                  >
                    <template #reference>
                      <button type="button" class="tx-receipt" :title="`${tx.receiptCount} 张票据`">
                        📎 {{ tx.receiptCount }}
                      </button>
                    </template>
                    <div class="receipt-links">
                      <a
                        v-for="receipt in tx.receipts"
                        :key="receipt.id"
                        class="receipt-link"
                        :href="publicReceiptUrl(token, receipt.id)"
                        target="_blank"
                        rel="noopener noreferrer"
                      >{{ receipt.title }}</a>
                    </div>
                  </el-popover>
                  <span class="tx-date">{{ tx.transDate }} · 结余 ￥{{ tx.balanceAfter }}</span>
                </span>
              </div>
            </div>
          </li>
        </ul>
      </section>

      <footer class="footer">
        本页为只读公示，数据来自班级账本，不含任何个人信息。如需更正请联系生活委员。
        <template v-if="report?.expiresAt">（本链接有效期至 {{ report.expiresAt }}）</template>
      </footer>
    </template>
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

.month-picker {
  width: 130px;
}

.numbers {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
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
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.value.strong {
  font-size: 16px;
}

.value.income {
  color: #10b981;
}

.value.expense {
  color: #ef4444;
}

.charts-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
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
  gap: 2px;
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
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.tx-note {
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

/* 弹层里的票据链接（popper 挂在 body 上，样式不能 scoped） */
:global(.receipt-links) {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

:global(.receipt-link) {
  font-size: 12px;
  color: var(--el-color-primary);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.receipt-link:hover) {
  text-decoration: underline;
}

.footer {
  margin-top: 20px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
  text-align: center;
}

@media (max-width: 900px) {
  .charts-row,
  .compare-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .numbers {
    grid-template-columns: repeat(2, 1fr);
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