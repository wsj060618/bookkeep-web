import type { CategoryStat, Summary, TxType } from '../types/api'
import { get } from './request'

/**
 * 统计接口，对应后端 StatisticController。
 * 区间精确到天（yyyy-MM-dd），两端都可空：都不传 = 全部时间。
 */

/** GET /api/statistics/summary?startDate=2026-09-01&endDate=2026-11-11 */
export function fetchSummary(startDate?: string, endDate?: string): Promise<Summary> {
  const params: Record<string, unknown> = {}
  if (startDate) params.startDate = startDate
  if (endDate) params.endDate = endDate
  return get<Summary>('/statistics/summary', Object.keys(params).length ? params : undefined)
}

/** GET /api/statistics/category?startDate=&endDate=&type=expense（type 默认 expense） */
export function fetchCategoryStat(
  startDate?: string,
  endDate?: string,
  type?: TxType,
): Promise<CategoryStat[]> {
  const params: Record<string, unknown> = {}
  if (startDate) params.startDate = startDate
  if (endDate) params.endDate = endDate
  if (type) params.type = type
  return get<CategoryStat[]>('/statistics/category', Object.keys(params).length ? params : undefined)
}
