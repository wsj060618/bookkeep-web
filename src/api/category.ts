import type { Category, CategoryReq, TxType } from '../types/api'
import { del, get, post, put } from './request'

/** 分类接口，对应后端 CategoryController。按当前账本，不传 bookId */

/** GET /api/categories?type=income|expense（type 不传 = 全部） */
export function listCategories(type?: TxType): Promise<Category[]> {
  return get<Category[]>('/categories', type ? { type } : undefined)
}

/** POST /api/categories */
export function createCategory(req: CategoryReq): Promise<Category> {
  return post<Category>('/categories', req)
}

/** PUT /api/categories/{id}。注意 type 不可变更，改了后端会 400 */
export function updateCategory(id: number, req: CategoryReq): Promise<Category> {
  return put<Category>(`/categories/${id}`, req)
}

/** DELETE /api/categories/{id}。分类下有流水时后端 400 并给出笔数 */
export function deleteCategory(id: number): Promise<void> {
  return del<void>(`/categories/${id}`)
}