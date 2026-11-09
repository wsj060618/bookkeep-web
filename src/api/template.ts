import type { CategoryTemplate } from '../types/api'
import { del, get, post, put } from './request'

/**
 * 分类模板接口，对应后端 CategoryTemplateController。
 * 模板**跟账号走**（不按账本隔离），应用时才落到当前账本。
 * 内置「班级班费」模板 id 固定为 0，只能应用，不能改名/删除。
 */

/** GET /api/category-templates：内置模板排第一，之后是自建模板（条目一并返回） */
export function listTemplates(): Promise<CategoryTemplate[]> {
  return get<CategoryTemplate[]>('/category-templates')
}

/** POST /api/category-templates：把**当前账本**的分类快照成一个新模板 */
export function createTemplateFromBook(name: string): Promise<CategoryTemplate> {
  return post<CategoryTemplate>('/category-templates', { name })
}

/** PUT /api/category-templates/{id}：模板名在同一账号内唯一 */
export function renameTemplate(id: number, name: string): Promise<CategoryTemplate> {
  return put<CategoryTemplate>(`/category-templates/${id}`, { name })
}

/** DELETE /api/category-templates/{id}：物理删除；引用它的账本自动指回内置模板 */
export function deleteTemplate(id: number): Promise<void> {
  return del<void>(`/category-templates/${id}`)
}

/** POST /api/category-templates/{id}/apply：应用到当前账本；账本已有流水时后端 400 */
export function applyTemplate(id: number): Promise<void> {
  return post<void>(`/category-templates/${id}/apply`, {})
}
