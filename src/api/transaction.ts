import type {
  ImportResult,
  PageResult,
  Transaction,
  TransactionQuery,
  TransactionReq,
  ZipImportResult,
} from '../types/api'
import { del, get, getFile, post, postForm, put, type DownloadFile } from './request'

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

/** POST /api/transactions/batch-delete —— 批量删除（流水页勾选），返回实际删除条数 */
export function deleteTransactions(ids: number[]): Promise<number> {
  return post<number>('/transactions/batch-delete', { ids })
}

/**
 * GET /api/transactions/export —— 成功是文件流（CSV / xlsx / zip），失败仍是 200 + JSON 信封。
 * `format=xlsx` 是带汇总与分类柱状图的真 Excel；`format=zip` 是**账本导出包**
 * （`流水.csv` + `manifest.csv` + 票据图片，可再导入）；默认 csv。
 * 调用方拿到的是 {blob, filename}，用 request.ts 的 saveBlob 落盘。
 */
export function exportTransactions(params: {
  startDate?: string
  endDate?: string
  format?: 'csv' | 'xlsx' | 'zip'
}): Promise<DownloadFile> {
  return getFile('/transactions/export', { ...params })
}

/**
 * POST /api/transactions/import（multipart）—— CSV / xlsx。
 * 行级失败不阻塞其它行，返回 `{success, failed:[{line, reason}]}`。
 */
export function importTransactions(file: File): Promise<ImportResult> {
  const form = new FormData()
  form.append('file', file)
  return postForm<ImportResult>('/transactions/import', form)
}

/**
 * POST /api/transactions/import/zip —— 本系统「账本导出」生成的包（manifest + 流水.csv + 图片）。
 * 流水与票据在同一份响应里分开报。
 */
export function importTransactionsZip(file: File): Promise<ZipImportResult> {
  const form = new FormData()
  form.append('file', file)
  return postForm<ZipImportResult>('/transactions/import/zip', form)
}