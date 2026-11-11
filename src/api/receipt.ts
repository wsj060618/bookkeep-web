import type { Receipt, ReceiptImportResult } from '../types/api'
import { del, get, getFile, postForm, put, type DownloadFile } from './request'

/** 流水票据（PLAN §10.9）。所有接口都要登录，bookId 由后端从 current_book_id 推导 */

/** 图片尺寸档：`thumb` = 480px 缩略图，`full` = 原图 */
export type ReceiptImageSize = 'thumb' | 'full'

/** GET /api/transactions/{transactionId}/receipts — 列表（不含文件内容） */
export function listReceipts(transactionId: number): Promise<Receipt[]> {
  return get<Receipt[]>(`/transactions/${transactionId}/receipts`)
}

/**
 * POST /api/transactions/{transactionId}/receipts（multipart）
 * 多选时前端逐张调用：一次一张，某张失败（超大/格式不对）不影响其他张。
 */
export function uploadReceipt(transactionId: number, file: File, title?: string): Promise<Receipt> {
  const form = new FormData()
  form.append('file', file)
  if (title) {
    form.append('title', title)
  }
  return postForm<Receipt>(`/transactions/${transactionId}/receipts`, form)
}

/** PUT —— 只改标题 */
export function renameReceipt(transactionId: number, receiptId: number, title: string): Promise<void> {
  return put<void>(`/transactions/${transactionId}/receipts/${receiptId}`, { title })
}

/** DELETE —— 库里记录和磁盘文件一起删 */
export function deleteReceipt(transactionId: number, receiptId: number): Promise<void> {
  return del<void>(`/transactions/${transactionId}/receipts/${receiptId}`)
}

/**
 * 取图片字节。
 * <p>登录态接口不能用 `<img src>` 直链（浏览器不会带 Authorization 头），
 * 所以这里取回 Blob，由调用方转成 objectURL 再喂给 img。
 * <p>`thumb` 是后端生成的 480px JPEG（约 45KB）：云服务器出网只有 2Mbps，
 * 画廊里拉原图一张要 10 秒，拉缩略图 0.2 秒。**网格/列表一律用 thumb，点开大图才要 full。**
 */
export async function fetchReceiptBlob(
  transactionId: number,
  receiptId: number,
  size: ReceiptImageSize = 'full',
): Promise<Blob> {
  const file = await getFile(
    `/transactions/${transactionId}/receipts/${receiptId}`,
    size === 'thumb' ? { size: 'thumb' } : undefined,
    // 原图可能有几 MB，30 秒默认超时在慢网下不够；缩略图 15 秒绰绰有余
    size === 'thumb' ? 15_000 : 90_000,
  )
  return file.blob
}

/** GET /api/transactions/receipts/export —— 整个账本（可带区间）的票据打成 zip，**只有图片** */
export function exportBookReceipts(params: {
  startDate?: string
  endDate?: string
}): Promise<DownloadFile> {
  return getFile('/transactions/receipts/export', { ...params })
}

/** GET /api/transactions/{id}/receipts/export —— 这一笔打成 zip（只有图片，全在「图片/」文件夹里） */
export function exportTransactionReceipts(transactionId: number): Promise<DownloadFile> {
  return getFile(`/transactions/${transactionId}/receipts/export`)
}

/** POST /api/transactions/{id}/receipts/import —— 单笔票据打包导入（zip 里放这一笔的多张图） */
export function importReceiptsZip(transactionId: number, file: File): Promise<ReceiptImportResult> {
  const form = new FormData()
  form.append('file', file)
  return postForm<ReceiptImportResult>(`/transactions/${transactionId}/receipts/import`, form)
}

/** 公示页图片是匿名只读路径，可以直接拼给 `<img src>`（不带 token） */
export function publicReceiptUrl(
  shareToken: string,
  receiptId: number,
  size: ReceiptImageSize = 'full',
): string {
  const base = `/api/public/report/${encodeURIComponent(shareToken)}/receipts/${receiptId}`
  return size === 'thumb' ? `${base}?size=thumb` : base
}