import type { CategoryTemplate, TemplateItemInput } from '../types/api'
import { del, get, post, put } from './request'

/**
 * 分类模板接口，对应后端 CategoryTemplateController。
 * 模板**跟账号走**（不按账本隔离），新建账本时选它来预置分类。
 * 内置「班级班费」模板 id 固定为 0，只能选，不能改名/删除。
 */

/** GET /api/category-templates：内置模板排第一，之后是自建模板（条目一并返回） */
export function listTemplates(): Promise<CategoryTemplate[]> {
  return get<CategoryTemplate[]>('/category-templates')
}

/** POST /api/category-templates：从零新建一套模板（条目必填） */
export function createTemplate(name: string, items: TemplateItemInput[]): Promise<CategoryTemplate> {
  return post<CategoryTemplate>('/category-templates', { name, items })
}

/** POST /api/category-templates/from-book：把**当前账本**的分类快照成一个新模板 */
export function createTemplateFromBook(name: string): Promise<CategoryTemplate> {
  return post<CategoryTemplate>('/category-templates/from-book', { name })
}

/** PUT /api/category-templates/{id}：改名；带 items 时**整体替换**条目 */
export function updateTemplate(
  id: number,
  name: string,
  items?: TemplateItemInput[],
): Promise<CategoryTemplate> {
  return put<CategoryTemplate>(`/category-templates/${id}`, items ? { name, items } : { name })
}

/** DELETE /api/category-templates/{id}：物理删除；引用它的账本自动指回内置模板 */
export function deleteTemplate(id: number): Promise<void> {
  return del<void>(`/category-templates/${id}`)
}