import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

/** 捕获 setOption 的入参：图表的约定（负数柱朝下）用断言钉住，别只靠肉眼 */
const setOption = vi.fn()

vi.mock('echarts/core', () => ({
  init: () => ({ setOption, resize: vi.fn(), dispose: vi.fn() }),
  use: vi.fn(),
}))
vi.mock('echarts/charts', () => ({ BarChart: {}, PieChart: {} }))
vi.mock('echarts/components', () => ({ GridComponent: {}, LegendComponent: {}, TooltipComponent: {} }))
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }))

import CompareChart from '../CompareChart.vue'

type BarDatum = { value: number }

function lastBarOption(): {
  yAxis: { min?: number }
  series: {
    data: BarDatum[]
    label: { formatter: (params: unknown) => string }
  }[]
  tooltip: { formatter: (params: unknown) => string }
} {
  expect(setOption).toHaveBeenCalled()
  return setOption.mock.calls.at(-1)?.[0]
}

describe('CompareChart 柱状图', () => {
  it('结余为负时柱子朝下：值保持带符号，Y 轴不钉死 0', () => {
    mount(CompareChart, {
      props: { type: 'bar', income: '0.00', expense: '12.00', balance: '-12.00' },
    })

    const option = lastBarOption()
    const data = option.series[0].data

    // 带符号的值原样交给 ECharts：负值就是向下的柱子
    expect(data.map((d) => d.value)).toEqual([0, 12, -12])
    // 不设 min，Y 轴才会同时容纳正负柱
    expect(option.yAxis.min).toBeUndefined()

    // 标签写「-￥12.00」而不是「￥-12.00」，和流水列表一致
    expect(option.series[0].label.formatter({ value: -12 })).toBe('-￥12.00')
    expect(option.series[0].label.formatter({ value: 12 })).toBe('￥12.00')
    expect(option.tooltip.formatter([{ name: '结余', value: -12 }])).toBe('结余<br/>-￥12.00')
  })

  it('正数结余照常显示为正', () => {
    setOption.mockClear()
    mount(CompareChart, {
      props: { type: 'bar', income: '1900.00', expense: '706.50', balance: '1193.50' },
    })

    const data = lastBarOption().series[0].data
    expect(data.map((d) => d.value)).toEqual([1900, 706.5, 1193.5])
  })

  it('环形图只放收入与支出两项（结余是差额，会计重复）', () => {
    setOption.mockClear()
    mount(CompareChart, {
      props: { type: 'donut', income: '1900.00', expense: '706.50', balance: '1193.50' },
    })

    const option = setOption.mock.calls.at(-1)?.[0] as {
      series: { type: string; data: { name: string }[] }[]
    }
    expect(option.series[0].type).toBe('pie')
    expect(option.series[0].data.map((d) => d.name)).toEqual(['收入', '支出'])
  })
})
