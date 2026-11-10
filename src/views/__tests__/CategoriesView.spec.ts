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

vi.mock('../../api/template', () => ({
  listTemplates: (...args: unknown[]) => listTemplates(...args),
  createTemplate: vi.fn(),
  createTemplateFromBook: vi.fn(),
  deleteTemplate: vi.fn(),
  updateTemplate: vi.fn(),
}))

vi.mock('../../api/book', () => ({
  listBooks: (...args: unknown[]) => listBooks(...args),
}))

const builtin: CategoryTemplate = {
  id: 0,
  name: '班级班费',
  builtin: true,
  items: [
    { name: '班会物资', type: 'expense', icon: 'supplies', color: 'orange', sortOrder: 1 },
    { name: '聚餐', type: 'expense', icon: 'dining', color: 'red', sortOrder: 2 },
    { name: '收取班费', type: 'income', icon: 'fee', color: 'green', sortOrder: 3 },
  ],
}

const mine: CategoryTemplate = {
  id: 7,
  name: '我的模板',
  builtin: false,
  items: [
    { name: '吃饭', type: 'expense', icon: 'dining', color: 'red', sortOrder: 1 },
    { name: '工资', type: 'income', icon: 'fee', color: 'green', sortOrder: 2 },
  ],
}

interface Vm {
  dirty: boolean
  templateId: number
  draftItems: { name: string; type: string }[]
  onTemplateChange: (next: number) => Promise<void>
  onSave: () => Promise<void>
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
  })

  it('刚打开、什么都没改 → dirty 必须是 false', async () => {
    const { vm } = await mountPage([builtin])
    expect(vm.templateId).toBe(0)
    expect(vm.draftItems).toHaveLength(3)
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
})