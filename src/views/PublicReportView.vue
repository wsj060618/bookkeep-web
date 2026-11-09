<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { fetchPublicReport } from '../api/public'
import type { CategoryStat, PublicReport } from '../types/api'
import { colorOf, iconOf } from '../utils/category'

/** 图表按需加载：ECharts 只在真正画图时才拉，不拖慢手机打开公示页 */
const CategoryChart = defineAsyncComponent(() => import('../components/CategoryChart.vue'))

/**
 * 只读公示页 /report/{token}：免登录、只有账本名与金额、没有任何个人信息。
 * 这个页面永远不能出现「登录」「记一笔」这类入口——它是要转发到班群的。
 * <p>分类占比给支出、收入两个方向（钱花哪了 / 钱从哪来），展示形式可切条形图 / 饼图 / 环形图。
 */

const route = useRoute()
const token = computed(() => String(route.params.token ?? ''))

const report = ref<PublicReport | null>(null)
const loading = ref(false)
const failed = ref(false)
const month = ref('')

type ChartType = 'bar' | 'pie' | 'donut'
const chartType = ref<ChartType>('bar')

/** 合计按「分」累加，避免两位小数直接相加出现浮点误差 */
function totalOf(list: CategoryStat[]): string {
  const cents = list.reduce((sum, c) => sum + Math.round(Number(c.amount) * 100), 0)
  return (cents / 100).toFixed(2)
}

const incomeCategories = computed<CategoryStat[]>(() => report.value?.incomeCategories ?? [])
const expenseCategories = computed<CategoryStat[]>(() => report.value?.expenseCategories ?? [])
const incomeTotal = computed(() => totalOf(incomeCategories.value))
const expenseTotal = computed(() => totalOf(expenseCategories.value))

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
    month.value = resp.month
  } catch {
    // token 不存在/账本已注销 → 后端 code=404，拦截器已弹提示，这里只切到错误态
    failed.value = true
    report.value = null
  } finally {
    loading.value = false
  }
}

// 同一个人可能改地址栏里的 token 直接换一本账看
watch(token, () => {
  month.value = ''
  void load()
})

onMounted(load)
</script>

<template>
  <div class="page">
    <header class="header">
      <h1 class="title">{{ report?.bookName ?? '班级账本' }}</h1>
      <span class="badge">只读公示</span>
    </header>

    <el-result v-if="failed" icon="warning" title="公示页不存在或已失效" sub-title="请向分享链接的同学确认地址是否完整">
    </el-result>

    <template v-else>
      <section v-loading="loading" class="card">
        <div class="card-head">
          <span class="month-label">{{ report?.month ?? '' }} 收支</span>
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
            <span class="value income">+￥{{ report?.income ?? '0.00' }}</span>
          </div>
          <div class="number">
            <span class="label">支出</span>
            <span class="value expense">-￥{{ report?.expense ?? '0.00' }}</span>
          </div>
          <div class="number">
            <span class="label">本月结余</span>
            <span class="value">￥{{ report?.balance ?? '0.00' }}</span>
          </div>
          <div class="number">
            <span class="label">累计结余</span>
            <span class="value strong">￥{{ report?.totalBalance ?? '0.00' }}</span>
          </div>
        </div>

        <div class="breakdown">
          <div class="breakdown-head">
            <span class="breakdown-title">分类占比</span>

            <el-radio-group v-model="chartType" size="small">
              <el-radio-button value="bar">柱状图</el-radio-button>
              <el-radio-button value="pie">饼图</el-radio-button>
              <el-radio-button value="donut">环形图</el-radio-button>
            </el-radio-group>
          </div>

          <div class="charts-row">
            <div class="chart-block">
              <header class="chart-head">
                <span class="chart-title income">收入</span>
                <span class="chart-total">合计 ￥{{ incomeTotal }}</span>
              </header>
              <CategoryChart v-if="incomeCategories.length" :items="incomeCategories" :type="chartType" />
              <p v-else class="chart-empty">本月还没有收入</p>
            </div>

            <div class="chart-block">
              <header class="chart-head">
                <span class="chart-title expense">支出</span>
                <span class="chart-total">合计 ￥{{ expenseTotal }}</span>
              </header>
              <CategoryChart v-if="expenseCategories.length" :items="expenseCategories" :type="chartType" />
              <p v-else class="chart-empty">本月还没有支出</p>
            </div>
          </div>
        </div>
      </section>

      <section v-loading="loading" class="card">
        <h2 class="card-title">明细（按日期升序，结余为逐行累计）</h2>

        <p v-if="!loading && !report?.transactions.length" class="empty">本月还没有流水</p>

        <ul class="tx-list">
          <li v-for="(tx, index) in report?.transactions" :key="index" class="tx-item">
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
                <span class="tx-date">{{ tx.transDate }} · 结余 ￥{{ tx.balanceAfter }}</span>
              </div>
            </div>
          </li>
        </ul>
      </section>

      <footer class="footer">
        本页为只读公示，数据来自班级账本，不含任何个人信息。如需更正请联系生活委员。
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
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
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

.breakdown {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.breakdown-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.breakdown-title {
  font-size: 13px;
  font-weight: 600;
}

.charts-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.chart-block {
  min-width: 0;
}

.chart-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 4px;
}

.chart-title {
  font-size: 13px;
  font-weight: 600;
}

.chart-title.income {
  color: #10b981;
}

.chart-title.expense {
  color: #ef4444;
}

.chart-total {
  margin-left: auto;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-secondary);
}

.chart-empty {
  margin: 0;
  padding: 120px 0;
  text-align: center;
  font-size: 12px;
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

.footer {
  margin-top: 20px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
  text-align: center;
}

@media (max-width: 900px) {
  .charts-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .numbers {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>