<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { fetchCategoryStat, fetchSummary } from '../api/statistic'
import CategoryChartCard from '../components/CategoryChartCard.vue'
import { useShell } from '../composables/shell'
import type { CategoryStat, Summary, TxType } from '../types/api'

/**
 * 统计页：按月看收支与分类占比。
 * 占比拆成**收入、支出两张卡片并排**（收入在左、支出在右），
 * **每张卡自己带柱状图 / 饼图 / 环形图切换**，互不影响。
 * 改过流水（txVersion 变化）后要重拉，否则从流水页回来数字是旧的。
 */

const shell = useShell()

const loading = ref(false)
/** 空字符串 = 当月，由后端按 Asia/Shanghai 决定；回显后用后端返回的 month */
const month = ref('')
const summary = ref<Summary | null>(null)
/** 两个方向一次都拉回来：并排展示，不需要再等第二次请求 */
const stats = ref<Record<TxType, CategoryStat[]>>({ expense: [], income: [] })

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
        <span class="panel-month">{{ summary?.month ?? '' }}</span>
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