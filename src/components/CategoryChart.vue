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

/** 柱状图分类名挤不挤：并排两栏又要放 6+ 个名字，超过 5 个就斜着写 */
const rotateLabels = computed(() => props.items.length > 5)

function barOption(): EChartsCoreOption {
  const count = props.items.length
  return {
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
  if (donut) {
    // 环形图参照官方示例：图例在顶部居中，默认不显示标签，hover 时在圆心放大显示名字
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
        top: '5%',
        left: 'center',
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
          radius: ['40%', '70%'],
          center: ['50%', '56%'],
          avoidLabelOverlap: false,
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          label: { show: false, position: 'center' },
          // 官方示例的圆心放大效果；字号按卡片尺寸收小，否则四个汉字会顶出圆心
          emphasis: {
            label: { show: true, fontSize: 18, fontWeight: 'bold', formatter: '{b}', color: '#303133' },
          },
          labelLine: { show: false },
          data: props.items.map((item, index) => ({
            name: item.categoryName,
            value: Number(item.amount),
            itemStyle: { color: palette.value[index] },
          })),
        },
      ],
    }
  }

  // 饼图参照官方示例：图例竖排在左侧，圆饼半径 50%，hover 时扇区带阴影
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
      orient: 'vertical',
      left: 'left',
      top: 'middle',
      icon: 'circle',
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 10,
      textStyle: { fontSize: 12, color: '#606266' },
      pageIconSize: 10,
      pageTextStyle: { color: '#909399', fontSize: 11 },
    },
    series: [
      {
        type: 'pie',
        // 左侧留给图例，圆饼右移；半径按官方示例取 50%
        radius: '50%',
        center: ['62%', '50%'],
        itemStyle: { borderColor: '#fff', borderWidth: 1 },
        label: { show: true, formatter: '{b}', fontSize: 11, color: '#606266' },
        labelLine: { length: 8, length2: 6, lineStyle: { color: '#dcdfe6' } },
        // 名字多了自动隐藏重叠的那几个，不让两个名字贴在一起
        labelLayout: { hideOverlap: true },
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' },
        },
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
  // 侧栏折叠、窗口缩放：容器一变就 resize，否则图会挤变形
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
  <div ref="el" class="category-chart" :style="{ height: `${HEIGHT}px` }" />
</template>

<style scoped>
.category-chart {
  width: 100%;
}
</style>