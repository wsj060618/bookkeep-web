<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import type { ECharts, EChartsCoreOption } from 'echarts/core'
import { BarChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { formatMoney } from '../utils/money'

/**
 * 「收支对比」图：柱状图（收入 / 支出 / 结余）与环形图（收支占比）。
 * <p>和分类占比图分开写：分类图的颜色取分类语义色、维度是「分类」；
 * 这张图固定三段（收入/支出/结余），颜色跟流水列表/统计卡片一致：收入绿、支出红、结余蓝。
 * <p>结余为负时柱子朝下（ECharts 原生表现），负号与方向一起表达「这段时间净流出」。
 */

echarts.use([BarChart, PieChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

const props = defineProps<{
  type: 'bar' | 'donut'
  income: string
  expense: string
  balance: string
}>()

/** 与流水列表、统计卡片同一套语义色：收入绿、支出红；结余是差额，用蓝色区分开 */
const INCOME_COLOR = '#10b981'
const EXPENSE_COLOR = '#ef4444'
const BALANCE_COLOR = '#409eff'

const el = ref<HTMLDivElement | null>(null)
let chart: ECharts | null = null
let observer: ResizeObserver | null = null

/** 结余可能是负数：柱子照实朝下，tooltip 与标签也给带符号的值 */
const items = computed(() => [
  { name: '收入', value: Number(props.income), color: INCOME_COLOR },
  { name: '支出', value: Number(props.expense), color: EXPENSE_COLOR },
  { name: '结余', value: Number(props.balance), color: BALANCE_COLOR },
])

function buildOption(): EChartsCoreOption {
  if (props.type === 'donut') {
    return {
      // 动画一律走 ECharts 默认（1s / cubicInOut，见 globalDefault.js），这里只修「别在 setOption 后 resize」
      tooltip: {
        trigger: 'item',
        formatter: (params: unknown) => {
          const p = params as { name: string; value: number; percent: number; marker: string }
          return `${p.marker} ${p.name}<br/>${formatMoney(p.value)}（${p.percent}%）`
        },
      },
      legend: { bottom: 0, icon: 'circle', itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 12 } },
      series: [
        {
          type: 'pie',
          // 只比收入和支出：结余是差额，放进占比会重复计算
          // 半径/圆心要给扇区外标签留位置：两行标签（名称 + 百分比）大约 30px，
          // 半径给到 70% 时顶部标签会被画布裁掉（统计页实测「支出 7.46%」只剩半截）
          radius: ['38%', '58%'],
          center: ['50%', '48%'],
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          label: { show: true, formatter: '{b}\n{d}%', fontSize: 11, lineHeight: 14 },
          labelLine: { length: 8, length2: 6 },
          labelLayout: { hideOverlap: true },
          data: items.value
            .filter((item) => item.name !== '结余')
            .map((item) => ({
              name: item.name,
              value: item.value,
              itemStyle: { color: item.color },
            })),
        },
      ],
    }
  }

  return {
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const list = params as { name: string; value: number }[]
        return list.length ? `${list[0].name}<br/>${formatMoney(list[0].value)}` : ''
      },
    },
    xAxis: {
      type: 'category',
      data: items.value.map((item) => item.name),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#e4e7ed' } },
      axisLabel: { fontSize: 12, color: '#606266' },
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 11, color: '#909399' },
      splitLine: { lineStyle: { color: '#f2f3f5' } },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 42,
        data: items.value.map((item) => ({
          value: item.value,
          itemStyle: {
            color: item.color,
            // 圆角永远在柱子「离 0 轴远」的那一端：向上的柱圆顶，向下的柱圆底
            borderRadius: item.value < 0 ? [0, 0, 6, 6] : [6, 6, 0, 0],
          },
        })),
        label: {
          show: true,
          position: 'top',
          fontSize: 11,
          color: '#606266',
          formatter: (params: unknown) => formatMoney((params as { value: number }).value),
        },
      },
    ],
  }
}

/** 上次画的图形：只有柱↔环切换时才整体替换选项，其余情况合并，数值变化才有补间动画 */
let lastType: string | null = null

function render(): void {
  if (!el.value) return
  if (!chart) chart = echarts.init(el.value)
  // 这里**不能**紧跟 chart.resize()：它会让 ECharts 立刻做一次无动画的布局更新，
  // 首屏/切月那次柱子长出来的动画就被顶掉了（容器尺寸交给 ResizeObserver）
  chart.setOption(buildOption(), lastType !== null && lastType !== props.type)
  lastType = props.type
}

/** 上一次的容器尺寸：ResizeObserver 观察开始时就会立刻回调一次，那次必须跳过（见下） */
let lastSize = ''

function sizeOf(el: HTMLElement): string {
  return `${Math.round(el.clientWidth)}x${Math.round(el.clientHeight)}`
}

onMounted(() => {
  render()
  observer = new ResizeObserver(() => {
    if (!el.value) return
    const size = sizeOf(el.value)
    // 首次回调尺寸没变，直接 return：resize() 内部是**关掉动画**的一次布局更新，
    // 紧跟 setOption 调用会把柱子长出来的入场动画顶掉
    if (size === lastSize) return
    lastSize = size
    chart?.resize()
  })
  if (el.value) {
    lastSize = sizeOf(el.value)
    observer.observe(el.value)
  }
})

watch(() => [props.income, props.expense, props.balance, props.type], render)

onBeforeUnmount(() => {
  observer?.disconnect()
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div ref="el" class="compare-chart" />
</template>

<style scoped>
.compare-chart {
  width: 100%;
  height: 260px;
}
</style>