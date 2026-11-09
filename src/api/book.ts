import type { Book, BookCreateReq, BookTrash, BookUpdateReq, ShareLink } from '../types/api'
import { del, get, post, put } from './request'

/** 账本接口，对应后端 BookController（增删改查 + 回收站，PLAN §5.2） */

/** GET /api/books —— 我的账本（不含回收站），按创建顺序，带 current 标记 */
export function listBooks(): Promise<Book[]> {
  return get<Book[]>('/books')
}

/** POST /api/books —— 新建并自动切为当前；按 templateId 预置分类（省略 = 内置 13 条） */
export function createBook(req: BookCreateReq): Promise<Book> {
  return post<Book>('/books', req)
}

/** PUT /api/books/{id} —— 改名，shareToken 不变 */
export function renameBook(id: number, req: BookUpdateReq): Promise<Book> {
  return put<Book>(`/books/${id}`, req)
}

/** PUT /api/books/{id}/current —— 切换当前账本，返回切换后的完整列表 */
export function switchBook(id: number): Promise<Book[]> {
  return put<Book[]>(`/books/${id}/current`)
}

/** DELETE /api/books/{id} —— 进回收站（15 天内可恢复） */
export function deleteBook(id: number): Promise<void> {
  return del<void>(`/books/${id}`)
}

/** GET /api/books/trash —— 回收站，带 expireAt（彻底删除时刻） */
export function listTrash(): Promise<BookTrash[]> {
  return get<BookTrash[]>('/books/trash')
}

/** PUT /api/books/{id}/restore —— 从回收站恢复（不自动切为当前） */
export function restoreBook(id: number): Promise<Book> {
  return put<Book>(`/books/${id}/restore`)
}

/** DELETE /api/books/{id}/permanent —— 立即彻底删除（只能删回收站里的，不可恢复） */
export function purgeBook(id: number): Promise<void> {
  return del<void>(`/books/${id}/permanent`)
}

/** POST /api/books/{id}/share —— 每次调用都换新 token（3 天有效），旧链接立即失效 */
export function createShareLink(id: number): Promise<ShareLink> {
  return post<ShareLink>(`/books/${id}/share`)
}