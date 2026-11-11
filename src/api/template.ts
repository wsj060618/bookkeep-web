import type { CategoryTemplate, TemplateDoc, TemplateItemInput } from '../types/api'
import { del, get, post, put } from './request'

/**
 * 分类模板接口，对应后端 CategoryTemplateController。
 * 模板**跟账号走**（不按账本隔离），新建账本时选它来预置分类。
 * 注册时会自动建一套「班级班费」，它是普通模板（可改名/删条目/删除）；
 * `id = 0` 只在账号一套模板都没有时作为只读兜底出现。
 */

/** GET /api/category-templates：账号下的真实模板（条目一并返回）；一套都没有时返回 id=0 的只读投影 */
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

/**
 * PUT /api/category-templates/{id}：改名；带 items 时按 id 增量替换条目
 * （带 id 的是改名/改图标，不带 id 的是新增，这次没出现的会被删掉）。
 * **保存会同步到用过这套模板的账本**；删掉已被流水引用的分类会返回 400。
 */
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

/**
 * GET /api/category-templates/{id}/export：拿模板 JSON（图标/颜色/排序都在里面）。
 * 返回的是普通信封而不是文件流，前端自己 `JSON.stringify` + `saveBlob` 存成 .json。
 */
export function exportTemplate(id: number): Promise<TemplateDoc> {
  return get<TemplateDoc>(`/category-templates/${id}/export`)
}

/** POST /api/category-templates/import：JSON → 新模板（重名后端自动加「（导入）」后缀） */
export function importTemplate(doc: TemplateDoc): Promise<CategoryTemplate> {
  return post<CategoryTemplate>('/category-templates/import', doc)
}