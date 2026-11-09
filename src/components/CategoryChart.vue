<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import type { ECharts, EChartsCoreOption } from 'echarts/core'
import { BarChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { colorOf } from '../utils/category'
import type { CategoryStat } from '../types/api'

/**
 * 分类占比图：条形图 / 饼图 / 环形图**同一套 ECharts 渲染**，
 * 切换只是换 series，标尺、留白、颜色、tooltip 才不会各写一套、切起来跳来跳去。
 * <p>按需引入，只带 bar + pie + grid + tooltip + legend + canvas。
 */

type ChartType = 'bar' | 'pie' | 'donut'

// 只注册用得到的模块，别整包引入 echarts（体积差好几倍）
echarts.use([BarChart, PieChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

const props = defineProps<{
  items: CategoryStat[]
  type: ChartType
}>()

const el = ref<HTMLDivElement | null>(null)
let chart: ECharts | null = null
let observer: ResizeObserver | null = null

/** 条形图按条数长高，条数多也不会把每根压成一条线 */
const height = computed(() => {
  if (props.type !== 'bar') return 360
  return Math.min(460, Math.max(220, props.items.length * 36 + 40))
})

const palette = computed(() => props.items.map((item) => colorOf(item.categoryColor)))

/** 钱一律两位小数 + 千分位；饼图里显示的也是同一个格式 */
function money(value: number): string {
  return `￥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function percentOf(index: number): string {
  const item = props.items[index]
  return item ? `${item.percent}%` : ''
}

/** 分类太多时（>8）不在扇区外挂名字，交给图例 + tooltip —— 否则标签会挤成一团 */
const showSliceLabels = computed(() => props.type !== 'bar' && props.items.length <= 8)

function barOption(): EChartsCoreOption {
  return {
    grid: { left: 4, right: 88, top: 12, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const list = params as { dataIndex: number; name: string; value: number }[]
        if (!list.length) return ''
        const first = list[0]
        return `${first.name}<br/>${money(first.value)}（${percentOf(first.dataIndex)}）`
      },
    },
    xAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#909399', fontSize: 11 },
      splitLine: { lineStyle: { color: '#f2f3f5' } },
    },
    yAxis: {
      type: 'category',
      inverse: true, // 金额最大的排最上面，和后端给的降序一致
      data: props.items.map((item) => item.categoryName),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#606266', fontSize: 12, width: 96, overflow: 'truncate' },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 18,
        data: props.items.map((item, index) => ({
          value: Number(item.amount),
          itemStyle: { color: palette.value[index], borderRadius: [0, 6, 6, 0] },
        })),
        label: {
          show: true,
          position: 'right',
          color: '#606266',
          fontSize: 11,
          formatter: (params: unknown) => {
            const p = params as { dataIndex: number; value: number }
            return `${money(p.value)}（${percentOf(p.dataIndex)}）`
          },
        },
        emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0, 0, 0, 0.12)' } },
      },
    ],
  }
}

function pieOption(): EChartsCoreOption {
  const donut = props.type === 'donut'
  return {
    tooltip: {
      trigger: 'item',
      formatter: (params: unknown) => {
        const p = params as { name: string; value: number; percent: number; marker: string }
        return `${p.marker} ${p.name}<br/>${money(p.value)}（${p.percent}%）`
      },
    },
    legend: {
      type: 'scroll',
      bottom: 0,
      icon: 'circle',
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 12,
      textStyle: { fontSize: 12, color: '#606266' },
      pageIconSize: 10,
      pageTextStyle: { color: '#909399', fontSize: 11 },
    },
    series: [
      {
        type: 'pie',
        radius: donut ? ['46%', '68%'] : '64%',
        center: ['50%', '43%'],
        minAngle: 2,
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        label: {
          show: showSliceLabels.value,
          formatter: '{b}\n{d}%',
          fontSize: 12,
          lineHeight: 17,
          color: '#606266',
        },
        labelLine: {
          show: showSliceLabels.value,
          length: 10,
          length2: 8,
          smooth: true,
          lineStyle: { color: '#dcdfe6' },
        },
        // 少量重叠时直接隐藏，不让两个名字贴在一起（官方示例的常规做法）
        labelLayout: { hideOverlap: true },
        emphasis: { scaleSize: 6 },
        data: props.items.map((item, index) => ({
          name: item.categoryName,
          value: Number(item.amount),
          itemStyle: { color: palette.value[index] },
        })),
      },
    ],
  }
}

function buildOption(): EChartsCoreOption {
  return props.type === 'bar' ? barOption() : pieOption()
}

function render(): void {
  if (!el.value) return
  if (!chart) chart = echarts.init(el.value)
  // notMerge：切换图形时把旧 series 整个换掉，否则半径/坐标轴会残留
  chart.setOption(buildOption(), true)
  chart.resize()
}

onMounted(() => {
  render()
  // 侧栏折叠、窗口缩放、条形图按条数变高：容器一变就要 resize，否则图会挤变形
  observer = new ResizeObserver(() => chart?.resize())
  if (el.value) observer.observe(el.value)
})

watch(() => [props.items, props.type], () => render(), { deep: true })

onBeforeUnmount(() => {
  observer?.disconnect()
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div ref="el" class="category-chart" :style="{ height: `${height}px` }" />
</template>

<style scoped>
.category-chart {
  width: 100%;
}
</style>