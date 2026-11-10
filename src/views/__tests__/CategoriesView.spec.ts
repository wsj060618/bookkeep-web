import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import CategoriesView from '../CategoriesView.vue'
import type { CategoryTemplate } from '../../types/api'

/**
 * 分类模板页的回归测试：**实时保存**（没有草稿、没有「保存模板」按钮）。
 *
 * <p>每条都盯住一个曾经踩过的坑：术语残留（draft/dirty）、切换模板时列表串台、
 * 条目 id 丢失（改名退化成删旧建新）、保存失败后界面和后端不一致。
 */

const listTemplates = vi.fn()
const listBooks = vi.fn()
const updateTemplate = vi.fn()
const createTemplate = vi.fn()

vi.mock('../../api/template', () => ({
  listTemplates: (...args: unknown[]) => listTemplates(...args),
  createTemplate: (...args: unknown[]) => createTemplate(...args),
  createTemplateFromBook: vi.fn(),
  deleteTemplate: vi.fn(),
  updateTemplate: (...args: unknown[]) => updateTemplate(...args),
}))

vi.mock('../../api/book', () => ({
  listBooks: (...args: unknown[]) => listBooks(...args),
}))

const builtin: CategoryTemplate = {
  id: 0,
  name: '班级班费',
  builtin: true,
  items: [
    { id: null, name: '班会物资', type: 'expense', icon: 'supplies', color: 'orange', sortOrder: 1 },
    { id: null, name: '聚餐', type: 'expense', icon: 'dining', color: 'red', sortOrder: 2 },
    { id: null, name: '收取班费', type: 'income', icon: 'fee', color: 'green', sortOrder: 3 },
  ],
}

const mine: CategoryTemplate = {
  id: 7,
  name: '我的模板',
  builtin: false,
  items: [
    { id: 11, name: '吃饭', type: 'expense', icon: 'dining', color: 'red', sortOrder: 1 },
    { id: 12, name: '工资', type: 'income', icon: 'fee', color: 'green', sortOrder: 2 },
  ],
}

interface DraftLike {
  id?: number | null
  name: string
  type: string
}

interface Vm {
  templateId: number
  items: DraftLike[]
  onTemplateChange: (next: number) => void
  onItemSubmit: (payload: { name: string; type: string; icon: string; color: string }) => Promise<void>
  onDelete: (item: DraftLike) => Promise<void>
  openEdit: (item: DraftLike) => Promise<void>
  ensureEditableTemplate: () => Promise<boolean>
}

async function mountPage(templates: CategoryTemplate[], bookTemplateId: number | null = null) {
  listTemplates.mockResolvedValue(templates)
  listBooks.mockResolvedValue([
    {
      id: 1,
      name: '班级账本',
      type: 'class',
      categoryTemplateId: bookTemplateId,
      current: true,
      archived: false,
    },
  ])
  const wrapper = mount(CategoriesView, { global: { plugins: [ElementPlus] } })
  await flushPromises()
  return { wrapper, vm: wrapper.vm as unknown as Vm }
}

describe('CategoriesView（模板页 · 实时保存）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    listTemplates.mockReset()
    listBooks.mockReset()
    updateTemplate.mockReset()
    createTemplate.mockReset()
  })

  it('打开就把所选模板的条目对齐到本地，并带上条目 id', async () => {
    const { vm } = await mountPage([mine])
    expect(vm.templateId).toBe(7)
    expect(vm.items.map((i) => i.name)).toEqual(['吃饭', '工资'])
    expect(vm.items.map((i) => i.id)).toEqual([11, 12])
  })

  it('老账本 categoryTemplateId 为 NULL → 回落到列表第一套，绝不停在 id=0', async () => {
    // 这条是「下拉显示裸 0」的看门人：模板列表里没有 id=0，选中值就绝不能是 0
    const { vm } = await mountPage([mine], null)
    expect(vm.templateId).toBe(7)
    expect(vm.items.map((i) => i.name)).toEqual(['吃饭', '工资'])
  })

  it('账本指向的模板已被删掉 → 也回落到第一套', async () => {
    const { vm } = await mountPage([mine], 999)
    expect(vm.templateId).toBe(7)
    expect(vm.items).toHaveLength(2)
  })

  it('切到另一套模板 → 列表跟着换，不会串台', async () => {
    const { vm } = await mountPage([builtin, mine])
    expect(vm.templateId).toBe(0)

    vm.onTemplateChange(7)
    await flushPromises()

    expect(vm.templateId).toBe(7)
    expect(vm.items.map((i) => i.name)).toEqual(['吃饭', '工资'])
  })

  it('新增一条 → 立刻 PUT：老条目带 id，新条目不带 id', async () => {
    updateTemplate.mockResolvedValue({ ...mine })
    const { vm } = await mountPage([mine])

    await vm.onItemSubmit({ name: '打印费', type: 'expense', icon: 'print', color: 'cyan' })
    await flushPromises()

    expect(updateTemplate).toHaveBeenCalledTimes(1)
    const [id, name, sent] = updateTemplate.mock.calls[0] as [number, string, DraftLike[]]
    expect(id).toBe(7)
    expect(name).toBe('我的模板')
    expect(sent.map((i) => i.name)).toEqual(['吃饭', '工资', '打印费'])
    expect(sent.map((i) => i.id)).toEqual([11, 12, undefined])
  })

  it('改名 → 立刻 PUT，并保留该条的 id（否则后端会当成删旧建新）', async () => {
    updateTemplate.mockResolvedValue({ ...mine })
    const { vm } = await mountPage([mine])

    await vm.openEdit(vm.items[0])
    await vm.onItemSubmit({ name: '吃饭（改）', type: 'expense', icon: 'dining', color: 'red' })
    await flushPromises()

    const [, , sent] = updateTemplate.mock.calls[0] as [number, string, DraftLike[]]
    expect(sent[0].name).toBe('吃饭（改）')
    expect(sent[0].id).toBe(11)
    expect(sent).toHaveLength(2)
  })

  it('删除一条 → 确认后立刻 PUT，且列表里不再包含它', async () => {
    const { ElMessageBox } = await import('element-plus')
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    updateTemplate.mockResolvedValue({ ...mine, items: [mine.items[1]] })
    const { vm } = await mountPage([mine])

    await vm.onDelete(vm.items[0])
    await flushPromises()

    const [, , sent] = updateTemplate.mock.calls[0] as [number, string, DraftLike[]]
    expect(sent.map((i) => i.name)).toEqual(['工资'])
  })

  it('后端拒绝（比如分类还有流水）→ 本地列表回滚成后端状态，不做假装成功的更新', async () => {
    const { ElMessageBox } = await import('element-plus')
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    updateTemplate.mockRejectedValue(new Error('400'))
    const { vm } = await mountPage([mine])

    await vm.onDelete(vm.items[0])
    await flushPromises()

    // 保存失败后重新拉了一次列表 → 仍是两条
    expect(vm.items.map((i) => i.name)).toEqual(['吃饭', '工资'])
  })

  it('内置模板（id=0）编辑前先复制一份，且复制时不能带条目 id', async () => {
    const { ElMessageBox } = await import('element-plus')
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    createTemplate.mockResolvedValue({ id: 99, name: '班级班费（副本）', builtin: false, items: [] })

    const { vm } = await mountPage([builtin])
    expect(vm.templateId).toBe(0)

    await vm.ensureEditableTemplate()
    await flushPromises()

    expect(createTemplate).toHaveBeenCalledTimes(1)
    const sent = createTemplate.mock.calls[0][1] as { id?: number | null }[]
    expect(sent.every((item) => item.id === undefined)).toBe(true)
  })
})