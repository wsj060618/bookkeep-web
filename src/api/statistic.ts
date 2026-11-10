import type { CategoryStat, Summary, TxType } from '../types/api'
import { get } from './request'

/**
 * 统计接口，对应后端 StatisticController。
 * 区间是「月份」，两端都可空：都不传 = 全部时间。
 */

/** GET /api/statistics/summary?startMonth=2026-09&endMonth=2026-11 */
export function fetchSummary(startMonth?: string, endMonth?: string): Promise<Summary> {
  const params: Record<string, unknown> = {}
  if (startMonth) params.startMonth = startMonth
  if (endMonth) params.endMonth = endMonth
  return get<Summary>('/statistics/summary', Object.keys(params).length ? params : undefined)
}

/** GET /api/statistics/category?startMonth=&endMonth=&type=expense（type 默认 expense） */
export function fetchCategoryStat(
  startMonth?: string,
  endMonth?: string,
  type?: TxType,
): Promise<CategoryStat[]> {
  const params: Record<string, unknown> = {}
  if (startMonth) params.startMonth = startMonth
  if (endMonth) params.endMonth = endMonth
  if (type) params.type = type
  return get<CategoryStat[]>('/statistics/category', Object.keys(params).length ? params : undefined)
}