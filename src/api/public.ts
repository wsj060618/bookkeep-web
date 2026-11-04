import type { PublicReport } from '../types/api'
import { get } from './request'

/**
 * 免登录公示页。路径在 SecurityConfig 里是唯一匿名放行的接口，
 * 所以这个文件里**不要**顺手加其它「看起来也该公开」的接口。
 */

/** GET /api/public/report/{shareToken}?month=2026-11 */
export function fetchPublicReport(shareToken: string, month?: string): Promise<PublicReport> {
  return get<PublicReport>(`/public/report/${encodeURIComponent(shareToken)}`, month ? { month } : undefined)
}