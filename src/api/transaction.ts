import type { PageResult, Transaction, TransactionQuery, TransactionReq } from '../types/api'
import { del, get, getFile, post, put, type DownloadFile } from './request'

/** 流水接口，对应后端 TransactionController。按当前账本，不传 bookId */

/** GET /api/transactions —— page/size 从 1 开始，返回 {total, list} */
export function pageTransactions(query: TransactionQuery): Promise<PageResult<Transaction>> {
  return get<PageResult<Transaction>>('/transactions', { ...query })
}

/** GET /api/transactions/balance —— 当前账本结余，字符串金额 */
export function fetchBalance(): Promise<string> {
  return get<string>('/transactions/balance')
}

/** POST /api/transactions */
export function createTransaction(req: TransactionReq): Promise<Transaction> {
  return post<Transaction>('/transactions', req)
}

/** PUT /api/transactions/{id} */
export function updateTransaction(id: number, req: TransactionReq): Promise<Transaction> {
  return put<Transaction>(`/transactions/${id}`, req)
}

/** DELETE /api/transactions/{id} */
export function deleteTransaction(id: number): Promise<void> {
  return del<void>(`/transactions/${id}`)
}

/**
 * GET /api/transactions/export —— 成功是 CSV 文件流，失败仍是 200 + JSON 信封。
 * 调用方拿到的是 {blob, filename}，用 request.ts 的 saveBlob 落盘。
 */
export function exportTransactions(params: { startDate?: string; endDate?: string }): Promise<DownloadFile> {
  return getFile('/transactions/export', { ...params })
}