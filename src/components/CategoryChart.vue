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
 * 分类占比图：柱状图 / 饼图 / 环形图，三者**同一套 ECharts 渲染**，
 * 切换只换 series，标尺、留白、配色才不会各写一套、切起来跳来跳去。
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

/** 柱状图与饼图统一 300px：两张图并排时高度要一样，不然一行里会错位 */
const HEIGHT = 300

const palette = computed(() => props.items.map((item) => colorOf(item.categoryColor)))

/** 钱一律两位小数 + 千分位 */
function money(value: number): string {
  return `￥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function percentOf(index: number): string {
  return props.items[index] ? `${props.items[index].percent}%` : ''
}

/** 分类太多时（>8）不在扇区外挂名字，交给图例 + tooltip —— 否则标签会挤成一团 */
const showSliceLabels = computed(() => props.type !== 'bar' && props.items.length <= 8)

/** 柱状图分类名挤不挤：并排两栏又要放 6+ 个名字，超过 5 个就斜着写 */
const rotateLabels = computed(() => props.items.length > 5)

function barOption(): EChartsCoreOption {
  const count = props.items.length
  return {
    // 动画一律走 ECharts 默认（1s / cubicInOut）；这里只保证 setOption 之后不再 resize
    grid: { left: 8, right: 8, top: 28, bottom: 0, containLabel: true },
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
      type: 'category',
      data: props.items.map((item) => item.categoryName),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#e4e7ed' } },
      axisLabel: {
        interval: 0,
        fontSize: 11,
        color: '#606266',
        rotate: rotateLabels.value ? 32 : 0,
      },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        fontSize: 11,
        color: '#909399',
        formatter: (value: number) => (value >= 10000 ? `${value / 10000}万` : String(value)),
      },
      splitLine: { lineStyle: { color: '#f2f3f5' } },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 26,
        data: props.items.map((item, index) => ({
          value: Number(item.amount),
          itemStyle: { color: palette.value[index], borderRadius: [6, 6, 0, 0] },
        })),
        // 条数多时柱顶标金额会撞在一起，只在不超过 6 条时显示；金额与占比在 tooltip 里始终都有
        label: {
          show: count <= 6,
          position: 'top',
          fontSize: 11,
          color: '#606266',
          formatter: (params: unknown) => money((params as { value: number }).value),
        },
        labelLayout: { hideOverlap: true },
        emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0, 0, 0, 0.12)' } },
      },
    ],
  }
}

function pieOption(): EChartsCoreOption {
  const donut = props.type === 'donut'
  return {
    // 动画一律走 ECharts 默认（1s / cubicInOut）；这里只保证 setOption 之后不再 resize
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
        // 同样给扇区外标签留位置：半径拉太满时顶部两行标签会被画布裁掉
        radius: donut ? ['40%', '60%'] : '56%',
        center: ['50%', '46%'],
        minAngle: 2,
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        label: {
          show: showSliceLabels.value,
          formatter: '{b}\n{d}%',
          fontSize: 11,
          lineHeight: 14,
          color: '#606266',
        },
        labelLine: {
          show: showSliceLabels.value,
          length: 8,
          length2: 6,
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

/** 上次画的图形：柱↔饼↔环切换才整体替换选项，其余情况合并，数值变化才有补间动画 */
let lastType: string | null = null

function render(): void {
  if (!el.value) return
  if (!chart) chart = echarts.init(el.value)
  // notMerge 只在换图形时用：切换 bar / pie / donut 必须把旧 series 整个换掉，
  // 否则半径、坐标轴会残留；同一图形的数据变化要合并，ECharts 才会把柱子「长」过去
  // 这里**不能**紧跟 chart.resize()：它会立刻做一次无动画的布局更新，把动画顶掉
  chart.setOption(buildOption(), lastType !== null && lastType !== props.type)
  lastType = props.type
}

/** 上一次的容器尺寸：ResizeObserver 观察开始时就会立刻回调一次，那次必须跳过 */
let lastSize = ''

function sizeOf(target: HTMLElement): string {
  return `${Math.round(target.clientWidth)}x${Math.round(target.clientHeight)}`
}

onMounted(() => {
  render()
  // 侧栏折叠、窗口缩放：容器一变就 resize，否则图会挤变形
  observer = new ResizeObserver(() => {
    if (!el.value) return
    const size = sizeOf(el.value)
    // 首次回调尺寸没变（resize 内部是关掉动画的更新，会顶掉入场动画）
    if (size === lastSize) return
    lastSize = size
    chart?.resize()
  })
  if (el.value) {
    lastSize = sizeOf(el.value)
    observer.observe(el.value)
  }
})

watch(() => [props.items, props.type], () => render(), { deep: true })

onBeforeUnmount(() => {
  observer?.disconnect()
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div ref="el" class="category-chart" :style="{ height: `${HEIGHT}px` }" />
</template>

<style scoped>
.category-chart {
  width: 100%;
}
</style>