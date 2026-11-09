<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import type { ECharts } from 'echarts/core'
import { PieChart } from 'echarts/charts'
import { LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { colorOf } from '../utils/category'
import type { CategoryStat } from '../types/api'

/**
 * 分类占比的饼图 / 环形图（ECharts 按需引入，只带 pie + tooltip + legend + canvas）。
 * 颜色直接取分类的语义 key 映射，和上面的条形图、流水页保持一致。
 */

// 只注册用得到的模块，别整包引入 echarts（体积差好几倍）
echarts.use([PieChart, TooltipComponent, LegendComponent, CanvasRenderer])

const props = defineProps<{
  items: CategoryStat[]
  /** true = 环形图（中间留空），false = 实心饼图 */
  donut: boolean
}>()

const el = ref<HTMLDivElement | null>(null)
let chart: ECharts | null = null
let observer: ResizeObserver | null = null

function buildOption(): echarts.EChartsCoreOption {
  return {
    tooltip: {
      trigger: 'item',
      formatter: (params: unknown) => {
        const p = params as { name: string; value: number; percent: number }
        return `${p.name}<br/>￥${p.value.toFixed(2)}（${p.percent}%）`
      },
    },
    legend: {
      type: 'scroll',
      bottom: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { fontSize: 12 },
    },
    series: [
      {
        type: 'pie',
        // 环形图留出中间的空洞，实心饼图用整圆
        radius: props.donut ? ['42%', '64%'] : '62%',
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#fff', borderWidth: 1 },
        label: { fontSize: 11, formatter: '{b}\n{d}%' },
        labelLine: { length: 8, length2: 6 },
        data: props.items.map((item) => ({
          name: item.categoryName,
          value: Number(item.amount),
          itemStyle: { color: colorOf(item.categoryColor) },
        })),
      },
    ],
  }
}

function render(): void {
  if (!el.value) return
  if (!chart) chart = echarts.init(el.value)
  // notMerge = true：切换饼图/环形图时把旧 series 换掉，否则半径会叠加残留
  chart.setOption(buildOption(), true)
}

onMounted(() => {
  render()
  // 侧栏折叠、窗口缩放都会改变容器宽度，图表必须跟着 resize，否则会挤成一条
  observer = new ResizeObserver(() => chart?.resize())
  if (el.value) observer.observe(el.value)
})

watch(() => [props.items, props.donut], render)

onBeforeUnmount(() => {
  observer?.disconnect()
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div ref="el" class="pie-chart" />
</template>

<style scoped>
.pie-chart {
  width: 100%;
  height: 340px;
}
</style>