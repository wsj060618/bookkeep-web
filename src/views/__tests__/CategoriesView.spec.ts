import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import CategoriesView from '../CategoriesView.vue'
import type { CategoryTemplate } from '../../types/api'

/**
 * 分类模板页的回归测试：**「没改也提示有改动」与「切换模板没切换」这两个 bug 的看门人**。
 *
 * <p>不点 DOM，直接看组件状态：草稿是否跟着选中模板、dirty 是否为 false、
 * 选择另一套模板后内容有没有真的换。
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

interface Vm {
  dirty: boolean
  templateId: number
  draftItems: { id?: number | null; name: string; type: string }[]
  onTemplateChange: (next: number) => Promise<void>
  onSave: () => Promise<void>
  onItemSubmit: (payload: { name: string; type: string; icon: string; color: string }) => void
  ensureEditableTemplate: () => Promise<boolean>
}

async function mountPage(templates: CategoryTemplate[], bookTemplateId: number | null = null) {
  listTemplates.mockResolvedValue(templates)
  listBooks.mockResolvedValue([
    { id: 1, name: '班级账本', type: 'class', categoryTemplateId: bookTemplateId, current: true },
  ])
  const wrapper = mount(CategoriesView, { global: { plugins: [ElementPlus] } })
  await flushPromises()
  return { wrapper, vm: wrapper.vm as unknown as Vm }
}

describe('CategoriesView（模板页）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    listTemplates.mockReset()
    listBooks.mockReset()
    updateTemplate.mockReset()
    createTemplate.mockReset()
  })

  it('刚打开、什么都没改 → dirty 必须是 false', async () => {
    const { vm } = await mountPage([builtin])
    expect(vm.templateId).toBe(0)
    expect(vm.draftItems).toHaveLength(3)
    expect(vm.dirty).toBe(false)
  })

  it('老账本 categoryTemplateId 为 NULL → 回落到列表第一套，绝不停在 id=0', async () => {
    // 这条是「下拉显示裸 0」的看门人：模板列表里没有 id=0，选中值就绝不能是 0
    const { vm } = await mountPage([mine], null)
    expect(vm.templateId).toBe(7)
    expect(vm.draftItems.map((i) => i.name)).toEqual(['吃饭', '工资'])
    expect(vm.dirty).toBe(false)
  })

  it('账本指向的模板已被删掉 → 也回落到第一套', async () => {
    const { vm } = await mountPage([mine], 999)
    expect(vm.templateId).toBe(7)
    expect(vm.dirty).toBe(false)
  })

  it('切到另一套模板 → 草稿跟着换，且仍然 dirty=false', async () => {
    const { vm } = await mountPage([builtin, mine])

    await vm.onTemplateChange(7)
    await flushPromises()

    expect(vm.templateId).toBe(7)
    expect(vm.draftItems.map((i) => i.name)).toEqual(['吃饭', '工资'])
    expect(vm.dirty).toBe(false)
  })

  it('切回来也一致（不会因为顺序/字段差异误判）', async () => {
    const { vm } = await mountPage([builtin, mine], 7)
    expect(vm.dirty).toBe(false)

    await vm.onTemplateChange(0)
    await flushPromises()
    expect(vm.draftItems.map((i) => i.name)).toEqual(['班会物资', '聚餐', '收取班费'])
    expect(vm.dirty).toBe(false)
  })

  it('模板列表刷新（同 id 新对象）后 dirty 仍是 false', async () => {
    const { vm } = await mountPage([builtin])
    listTemplates.mockResolvedValue([{ ...builtin, items: [...builtin.items] }])
    // 触发一次 loadTemplates：等价于页面里别处刷新模板列表
    await (vm as unknown as { loadTemplates: () => Promise<void> }).loadTemplates()
    await flushPromises()
    expect(vm.dirty).toBe(false)
  })

  it('有未保存改动时选「继续编辑」→ 真的不切换', async () => {
    const { ElMessageBox } = await import('element-plus')
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    const { vm } = await mountPage([builtin, mine])

    // 制造一个改动
    vm.draftItems[0].name = '班会物资（改）'
    expect(vm.dirty).toBe(true)

    await vm.onTemplateChange(7)
    await flushPromises()

    expect(vm.templateId).toBe(0)
    expect(vm.draftItems[0].name).toBe('班会物资（改）')
  })

  it('有未保存改动时选「放弃并切换」→ 切换并丢弃改动', async () => {
    const { ElMessageBox } = await import('element-plus')
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const { vm } = await mountPage([builtin, mine])

    vm.draftItems[0].name = '班会物资（改）'
    await vm.onTemplateChange(7)
    await flushPromises()

    expect(vm.templateId).toBe(7)
    expect(vm.draftItems.map((i) => i.name)).toEqual(['吃饭', '工资'])
    expect(vm.dirty).toBe(false)
  })

  it('草稿带着条目 id，保存时原样回传（后端靠它判断「改名」而不是「删旧建新」）', async () => {
    updateTemplate.mockResolvedValue({ ...mine, items: [...mine.items] })
    const { vm } = await mountPage([mine])

    expect(vm.draftItems.map((i) => i.id)).toEqual([11, 12])

    vm.draftItems[0].name = '吃饭（改）'
    await vm.onSave()
    await flushPromises()

    expect(updateTemplate).toHaveBeenCalledTimes(1)
    const sentItems = updateTemplate.mock.calls[0][2] as { id?: number | null; name: string }[]
    expect(sentItems.map((i) => i.id)).toEqual([11, 12])
    expect(sentItems[0].name).toBe('吃饭（改）')
  })

  it('新增的条目不带 id（后端据此判为新增）', async () => {
    const { vm } = await mountPage([mine])

    vm.onItemSubmit({ name: '打印费', type: 'expense', icon: 'print', color: 'cyan' })

    const added = vm.draftItems.find((i) => i.name === '打印费')
    expect(added).toBeTruthy()
    expect(added?.id).toBeUndefined()
  })

  it('复制内置模板时把条目 id 去掉（不能拿别人的条目 id 去改原模板）', async () => {
    const { ElMessageBox } = await import('element-plus')
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    createTemplate.mockResolvedValue({ id: 99, name: '班级班费（副本）', builtin: false, items: [] })

    const { vm } = await mountPage([builtin])
    expect(vm.templateId).toBe(0)

    await vm.ensureEditableTemplate()
    await flushPromises()

    expect(createTemplate).toHaveBeenCalledTimes(1)
    const sentItems = createTemplate.mock.calls[0][1] as { id?: number | null }[]
    // 内置投影本身 id 是 null，复制时也必须清空（换成真实模板时这条护栏才真正生效）
    expect(sentItems.every((item) => item.id === undefined)).toBe(true)
  })
})