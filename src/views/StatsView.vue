<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { fetchCategoryStat, fetchSummary } from '../api/statistic'
import CategoryChartCard from '../components/CategoryChartCard.vue'
import { useShell } from '../composables/shell'
import type { CategoryStat, Summary, TxType } from '../types/api'

/** 收支对比图按需加载（ECharts 只在真要画图时才拉） */
const CompareChart = defineAsyncComponent(() => import('../components/CompareChart.vue'))

/**
 * 统计页：默认看全部时间，可按月份区间筛选。
 * 卡片：收入 / 支出 / 结余（结余是区间末那天的余额，不是区间内的收支差）。
 * 改过流水（txVersion 变化）后要重拉，否则从流水页回来数字是旧的。
 */

const shell = useShell()

const loading = ref(false)
/** 空 = 全部时间；有值 = [开始月, 结束月]，都是 yyyy-MM */
const monthRange = ref<[string, string] | null>(null)
const summary = ref<Summary | null>(null)
/** 两个方向一次都拉回来：并排展示，不需要再等第二次请求 */
const stats = ref<Record<TxType, CategoryStat[]>>({ expense: [], income: [] })

const startMonth = computed(() => monthRange.value?.[0])
const endMonth = computed(() => monthRange.value?.[1])

/** 页面上显示的区间文字 */
const rangeText = computed(() => {
  if (!startMonth.value && !endMonth.value) return '全部时间'
  return `${startMonth.value || '最早'} ~ ${endMonth.value || '至今'}`
})

async function load(): Promise<void> {
  loading.value = true
  try {
    const [resp, expense, income] = await Promise.all([
      fetchSummary(startMonth.value, endMonth.value),
      fetchCategoryStat(startMonth.value, endMonth.value, 'expense'),
      fetchCategoryStat(startMonth.value, endMonth.value, 'income'),
    ])
    summary.value = resp
    stats.value = { expense, income }
  } catch {
    summary.value = null
    stats.value = { expense: [], income: [] }
  } finally {
    loading.value = false
  }
}

/** 重置：清空区间，回到「全部时间」 */
function onReset(): void {
  monthRange.value = null
  void load()
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
      </div>
      <div class="head-actions">
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

    <section v-loading="loading" class="numbers">
      <div class="num">
        <span class="num-label">收入</span>
        <span class="num-value income">+￥{{ summary?.income ?? '0.00' }}</span>
      </div>
      <div class="num">
        <span class="num-label">支出</span>
        <span class="num-value expense">-￥{{ summary?.expense ?? '0.00' }}</span>
      </div>
      <div class="num">
        <span class="num-label">结余</span>
        <span class="num-value strong">￥{{ summary?.balance ?? '0.00' }}</span>
      </div>
    </section>

    <section v-loading="loading" class="panel">
      <div class="panel-head">
        <h3 class="panel-title">收支对比</h3>
        <span class="panel-month">{{ rangeText }}</span>
      </div>

      <div class="charts-row">
        <div class="compare-card">
          <header class="compare-head">金额对比（柱状）</header>
          <CompareChart
            type="bar"
            :income="summary?.income ?? '0.00'"
            :expense="summary?.expense ?? '0.00'"
            :balance="summary?.balance ?? '0.00'"
          />
        </div>
        <div class="compare-card">
          <header class="compare-head">收支占比（环形）</header>
          <CompareChart
            type="donut"
            :income="summary?.income ?? '0.00'"
            :expense="summary?.expense ?? '0.00'"
            :balance="summary?.balance ?? '0.00'"
          />
        </div>
      </div>
    </section>

    <section v-loading="loading" class="panel">
      <div class="panel-head">
        <h3 class="panel-title">分类占比</h3>
        <span class="panel-month">{{ rangeText }}</span>
      </div>

      <div class="charts-row">
        <CategoryChartCard title="收入" tone="income" :items="stats.income" />
        <CategoryChartCard title="支出" tone="expense" :items="stats.expense" />
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
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.page-title {
  margin: 0;
  font-size: 18px;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.month-picker {
  width: 260px;
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
  min-height: 160px;
}

.panel-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px 12px;
  margin-bottom: 8px;
}

.panel-title {
  margin: 0;
  font-size: 14px;
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

.compare-card {
  min-width: 0;
  padding: 12px;
  border-radius: 10px;
  background: var(--el-fill-color-lighter);
}

.compare-head {
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
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

  .head-actions {
    width: 100%;
  }

  .month-picker {
    flex: 1;
    width: auto;
  }
}
</style>