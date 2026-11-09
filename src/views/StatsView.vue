<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { fetchCategoryStat, fetchSummary } from '../api/statistic'
import { useShell } from '../composables/shell'
import type { CategoryStat, Summary, TxType } from '../types/api'

/** 图表按需加载：默认是柱状图，但图表库（ECharts）仍只在真正要画图时才拉 */
const CategoryChart = defineAsyncComponent(() => import('../components/CategoryChart.vue'))

/**
 * 统计页：按月看收支与分类占比。
 * 占比**收入在左、支出在右并排一行**（一次看全，不用来回切方向），
 * 展示形式可切柱状图 / 饼图 / 环形图（三种都走 ECharts）。
 * 改过流水（txVersion 变化）后要重拉，否则从流水页回来数字是旧的。
 */

const shell = useShell()

const loading = ref(false)
/** 空字符串 = 当月，由后端按 Asia/Shanghai 决定；回显后用后端返回的 month */
const month = ref('')
const summary = ref<Summary | null>(null)
/** 两个方向一次都拉回来：并排展示，不需要再等第二次请求 */
const stats = ref<Record<TxType, CategoryStat[]>>({ expense: [], income: [] })

type ChartType = 'bar' | 'pie' | 'donut'
const chartType = ref<ChartType>('bar')

/** 合计用「分」累加，避免两位小数直接相加出现浮点误差 */
function totalOf(list: CategoryStat[]): string {
  const cents = list.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0)
  return (cents / 100).toFixed(2)
}

const incomeTotal = computed(() => totalOf(stats.value.income))
const expenseTotal = computed(() => totalOf(stats.value.expense))

async function load(): Promise<void> {
  loading.value = true
  try {
    const m = month.value || undefined
    const [resp, expense, income] = await Promise.all([
      fetchSummary(m),
      fetchCategoryStat(m, 'expense'),
      fetchCategoryStat(m, 'income'),
    ])
    summary.value = resp
    stats.value = { expense, income }
    month.value = resp.month
  } catch {
    summary.value = null
    stats.value = { expense: [], income: [] }
  } finally {
    loading.value = false
  }
}

watch(shell.txVersion, () => {
  void load()
})

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="stats-page">
    <div class="page-head">
      <div>
        <h2 class="page-title">收支统计</h2>
        <p class="page-desc">按月汇总当前账本；左边看钱从哪来，右边看钱花哪了。</p>
      </div>
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

    <section v-loading="loading" class="numbers">
      <div class="num">
        <span class="num-label">本月收入</span>
        <span class="num-value income">+￥{{ summary?.income ?? '0.00' }}</span>
      </div>
      <div class="num">
        <span class="num-label">本月支出</span>
        <span class="num-value expense">-￥{{ summary?.expense ?? '0.00' }}</span>
      </div>
      <div class="num">
        <span class="num-label">本月结余</span>
        <span class="num-value">￥{{ summary?.balance ?? '0.00' }}</span>
      </div>
      <div class="num">
        <span class="num-label">累计结余</span>
        <span class="num-value strong">￥{{ summary?.totalBalance ?? '0.00' }}</span>
      </div>
    </section>

    <section v-loading="loading" class="panel">
      <div class="panel-head">
        <h3 class="panel-title">分类占比</h3>
        <div class="panel-switches">
          <el-radio-group v-model="chartType" size="small">
            <el-radio-button value="bar">柱状图</el-radio-button>
            <el-radio-button value="pie">饼图</el-radio-button>
            <el-radio-button value="donut">环形图</el-radio-button>
          </el-radio-group>
          <span class="panel-month">{{ summary?.month ?? '' }}</span>
        </div>
      </div>

      <div class="charts-row">
        <div class="chart-block">
          <header class="chart-head">
            <span class="chart-title income">收入</span>
            <span class="chart-total">合计 ￥{{ incomeTotal }}</span>
          </header>
          <CategoryChart v-if="stats.income.length" :items="stats.income" :type="chartType" />
          <p v-else class="chart-empty">本月还没有收入</p>
        </div>

        <div class="chart-block">
          <header class="chart-head">
            <span class="chart-title expense">支出</span>
            <span class="chart-total">合计 ￥{{ expenseTotal }}</span>
          </header>
          <CategoryChart v-if="stats.expense.length" :items="stats.expense" :type="chartType" />
          <p v-else class="chart-empty">本月还没有支出</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.stats-page {
  display: grid;
  gap: 16px;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
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

.month-picker {
  width: 140px;
  flex: none;
}

.numbers {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  min-height: 90px;
}

.num {
  display: grid;
  gap: 6px;
  padding: 16px;
  border-radius: 12px;
  background: var(--el-bg-color);
  box-shadow: 0 1px 2px rgb(0 0 0 / 6%);
}

.num-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.num-value {
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.num-value.income {
  color: #10b981;
}

.num-value.expense {
  color: #ef4444;
}

.num-value.strong {
  color: var(--el-color-primary);
}

.panel {
  padding: 16px;
  border-radius: 12px;
  background: var(--el-bg-color);
  box-shadow: 0 1px 2px rgb(0 0 0 / 6%);
  min-height: 160px;
}

.panel-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  margin-bottom: 8px;
}

.panel-title {
  margin: 0;
  font-size: 14px;
}

.panel-switches {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.panel-month {
  font-size: 12px;
  color: var(--el-text-color-secondary);
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

@media (max-width: 900px) {
  .charts-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .numbers {
    grid-template-columns: repeat(2, 1fr);
  }

  .num-value {
    font-size: 18px;
  }
}
</style>