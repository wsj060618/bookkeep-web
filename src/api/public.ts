import type { PublicReport } from '../types/api'
import { get } from './request'

/**
 * 免登录公示页路径：SecurityConfig 里唯一匿名放行的接口，
 * 所以这个文件里**不要**顺手加别的调用（别的也都该走登录态的接口）。
 */

/** GET /api/public/report/{shareToken}?startDate=2026-10-01&endDate=2026-10-12（两端都可空） */
export function fetchPublicReport(
  shareToken: string,
  startDate?: string,
  endDate?: string,
): Promise<PublicReport> {
  const params: Record<string, unknown> = {}
  if (startDate) params.startDate = startDate
  if (endDate) params.endDate = endDate
  return get<PublicReport>(
    `/public/report/${encodeURIComponent(shareToken)}`,
    Object.keys(params).length ? params : undefined,
  )
}
