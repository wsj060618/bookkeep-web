import type { CategoryStat, Summary, TxType } from '../types/api'
import { get } from './request'

/** 统计接口，对应后端 StatisticController。口径由后端 StatisticCalculator 统一，前端不做二次计算 */

/** GET /api/statistics/summary?month=2026-11（不传 = 当月，时区由后端按 Asia/Shanghai 决定） */
export function fetchSummary(month?: string): Promise<Summary> {
  return get<Summary>('/statistics/summary', month ? { month } : undefined)
}

/** GET /api/statistics/category?month=2026-11&type=expense（type 默认 expense） */
export function fetchCategoryStat(month?: string, type?: TxType): Promise<CategoryStat[]> {
  return get<CategoryStat[]>('/statistics/category', {
    month: month || undefined,
    type: type || undefined,
  })
}