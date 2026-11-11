<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'
import type { CategoryStat } from '../types/api'

/** 图表按需加载：ECharts 只在真正画图时才拉 */
const CategoryChart = defineAsyncComponent(() => import('./CategoryChart.vue'))

/**
 * 一张「分类占比」卡片：收入、支出各一张，**各自独立切换**图形（柱状/饼图/环形），
 * 互不影响 —— 两张卡并排时也能一张看柱状、一张看饼图。
 */

const props = defineProps<{
  /** 收入 / 支出 */
  title: string
  tone: 'income' | 'expense'
  items: CategoryStat[]
}>()

type ChartType = 'bar' | 'pie' | 'donut'
const chartType = ref<ChartType>('bar')

/** 合计按「分」累加，避免两位小数直接相加出现浮点误差 */
const total = computed(() => {
  const cents = props.items.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0)
  return (cents / 100).toFixed(2)
})
</script>

<template>
  <section class="chart-card">
    <header class="chart-head">
      <span class="chart-title" :class="tone">{{ title }}</span>
      <span class="chart-total">合计 ￥{{ total }}</span>
      <el-radio-group v-model="chartType" size="small" class="chart-switch">
        <el-radio-button value="bar">柱状图</el-radio-button>
        <el-radio-button value="pie">饼图</el-radio-button>
        <el-radio-button value="donut">环形图</el-radio-button>
      </el-radio-group>
    </header>

    <!-- 没有数据也照常画空图表（和「收支对比」一致），不写「本月还没有收入」这类文案 -->
    <CategoryChart :items="items" :type="chartType" />
  </section>
</template>

<style scoped>
.chart-card {
  min-width: 0;
  padding: 16px;
  border-radius: 12px;
  background: var(--el-bg-color);
  box-shadow: 0 1px 3px rgb(0 0 0 / 8%);
}

.chart-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
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
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-secondary);
}

.chart-switch {
  margin-left: auto;
}
</style>