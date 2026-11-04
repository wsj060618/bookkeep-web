import type { Book, BookUpdateReq } from '../types/api'
import { put } from './request'

/** 账本接口（只有一个：重命名，见后端 PLAN §5.2） */

/** PUT /api/books/{id} —— 返回更新后的 Book（带 shareToken 与 current） */
export function renameBook(id: number, req: BookUpdateReq): Promise<Book> {
  return put<Book>(`/books/${id}`, req)
}