import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

/** 捕获 setOption 的入参：图表的约定（柱子一律朝上）用断言钉住，别只靠肉眼 */
const setOption = vi.fn()

vi.mock('echarts/core', () => ({
  init: () => ({ setOption, resize: vi.fn(), dispose: vi.fn() }),
  use: vi.fn(),
}))
vi.mock('echarts/charts', () => ({ BarChart: {}, PieChart: {} }))
vi.mock('echarts/components', () => ({ GridComponent: {}, LegendComponent: {}, TooltipComponent: {} }))
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }))

import CompareChart from '../CompareChart.vue'

type BarDatum = { name: string; value: number; signed: number }

function lastBarOption(): {
  yAxis: { min: number }
  series: {
    data: BarDatum[]
    label: { formatter: (params: unknown) => string }
    tooltip?: unknown
  }[]
  tooltip: { formatter: (params: unknown) => string }
} {
  expect(setOption).toHaveBeenCalled()
  return setOption.mock.calls.at(-1)?.[0]
}

describe('CompareChart 柱状图', () => {
  it('结余为负时柱子仍朝上：高度取绝对值，负号只出现在标签里', () => {
    mount(CompareChart, {
      props: { type: 'bar', income: '0.00', expense: '12.00', balance: '-12.00' },
    })

    const option = lastBarOption()
    const data = option.series[0].data

    // 高度全为非负（不会出现向下的柱子），Y 轴从 0 起
    expect(data.map((d) => d.value)).toEqual([0, 12, 12])
    expect(option.yAxis.min).toBe(0)
    // 真实值（含符号）单独留在 signed 里给标签用
    expect(data.map((d) => d.signed)).toEqual([0, 12, -12])

    expect(option.series[0].label.formatter({ data: { signed: -12 } })).toBe('-￥12.00')
    expect(option.series[0].label.formatter({ data: { signed: 12 } })).toBe('￥12.00')
    // tooltip 也显示带符号的真实值，不能显示柱高
    expect(option.tooltip.formatter([{ name: '结余', data: { signed: -12 } }])).toBe('结余<br/>-￥12.00')
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
