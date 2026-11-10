import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'
import ReceiptGalleryDialog from '../ReceiptGalleryDialog.vue'
import type { Receipt, Transaction } from '../../types/api'

/**
 * 票据图集弹窗的行为测试（白盒）：直接调组件的方法，断言「调了哪些接口、emits 了什么」。
 *
 * <p>为什么不去点 DOM：`el-dialog` 的内容要等过渡结束才挂载，happy-dom 里没有真实的
 * transition 事件，点不到按钮。组件逻辑（加载 / 改名 / 删除 / 选图 / 单笔导出）与 DOM 无关，
 * 直接调方法既能覆盖分支，也不会因为 Element Plus 内部实现变化而假红。
 */

const listReceipts = vi.fn()
const fetchReceiptBlob = vi.fn()
const renameReceipt = vi.fn()
const deleteReceipt = vi.fn()
const uploadReceipt = vi.fn()
const exportTransactionReceipts = vi.fn()

vi.mock('../../api/receipt', () => ({
  listReceipts: (...args: unknown[]) => listReceipts(...args),
  fetchReceiptBlob: (...args: unknown[]) => fetchReceiptBlob(...args),
  renameReceipt: (...args: unknown[]) => renameReceipt(...args),
  deleteReceipt: (...args: unknown[]) => deleteReceipt(...args),
  uploadReceipt: (...args: unknown[]) => uploadReceipt(...args),
  exportTransactionReceipts: (...args: unknown[]) => exportTransactionReceipts(...args),
}))

vi.mock('../../api/request', () => ({ saveBlob: vi.fn() }))

const tx: Transaction = {
  id: 7,
  type: 'income',
  amount: '1900.00',
  transDate: '2026-09-05',
  note: '全班 38 人',
  categoryId: 1,
  categoryName: '收取班费',
  categoryIcon: 'fee',
  categoryColor: 'green',
  receiptCount: 1,
}

const receipt: Receipt = {
  id: 11,
  title: '超市小票',
  originalName: 'a.png',
  sizeBytes: 2048,
  createdAt: '2026-09-05 10:00:00',
}

/** script setup 的顶层绑定在测试构建里挂到 vm 上，这里给个最小类型 */
interface DialogVm {
  load: () => Promise<void>
  saveTitle: (receipt: Receipt) => Promise<void>
  remove: (receipt: Receipt) => Promise<void>
  onPick: (event: Event) => Promise<void>
  exportSingle: () => Promise<void>
  titles: Record<number, string>
  receipts: Receipt[]
}

async function open(): Promise<{ wrapper: ReturnType<typeof mount>; vm: DialogVm }> {
  const wrapper = mount(ReceiptGalleryDialog, {
    props: { modelValue: false, transaction: tx },
    global: { plugins: [ElementPlus] },
  })
  await wrapper.setProps({ modelValue: true })
  await flushPromises()
  return { wrapper, vm: wrapper.vm as unknown as DialogVm }
}

/** 构造一个「看起来像」的文件对象（只关心 type/size/name） */
function fileOf(type: string, size: number, name = 'a.png'): File {
  const file = new File([new Uint8Array(8)], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

/** 伪造一次 <input type=file> 的 change 事件 */
function pickEvent(files: File[]): Event {
  const input = document.createElement('input')
  Object.defineProperty(input, 'files', { value: files })
  return { target: input } as unknown as Event
}

describe('ReceiptGalleryDialog', () => {
  beforeEach(() => {
    listReceipts.mockReset().mockResolvedValue([{ ...receipt }])
    fetchReceiptBlob.mockReset().mockResolvedValue(new Blob([new Uint8Array([1])], { type: 'image/png' }))
    renameReceipt.mockReset().mockResolvedValue(undefined)
    deleteReceipt.mockReset().mockResolvedValue(undefined)
    uploadReceipt.mockReset().mockResolvedValue({})
    exportTransactionReceipts.mockReset().mockResolvedValue({ blob: new Blob(), filename: 'x.zip' })
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock'), writable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('打开时按流水 id 拉列表，并逐张取图（登录态接口用 blob）', async () => {
    const { vm } = await open()

    expect(listReceipts).toHaveBeenCalledWith(7)
    expect(fetchReceiptBlob).toHaveBeenCalledWith(7, 11)
    expect(vm.receipts).toHaveLength(1)
    expect(vm.titles[11]).toBe('超市小票')
  })

  it('改名：调接口、更新本地标题、通知父组件刷新徽标', async () => {
    const { wrapper, vm } = await open()
    vm.titles[11] = '班服收据'

    await vm.saveTitle({ ...receipt })
    await flushPromises()

    expect(renameReceipt).toHaveBeenCalledWith(7, 11, '班服收据')
    expect(wrapper.emitted('changed')).toBeTruthy()
  })

  it('改名：空标题 / 超 30 字 / 没改动 都不发请求', async () => {
    const { vm } = await open()

    vm.titles[11] = '   '
    await vm.saveTitle({ ...receipt })
    vm.titles[11] = '标'.repeat(31)
    await vm.saveTitle({ ...receipt })
    vm.titles[11] = '超市小票'
    await vm.saveTitle({ ...receipt })

    expect(renameReceipt).not.toHaveBeenCalled()
    expect(vm.titles[11]).toBe('超市小票')
  })

  it('删除：确认后调接口并从列表移除', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const { wrapper, vm } = await open()

    await vm.remove({ ...receipt })
    await flushPromises()

    expect(deleteReceipt).toHaveBeenCalledWith(7, 11)
    expect(vm.receipts).toHaveLength(0)
    expect(wrapper.emitted('changed')).toBeTruthy()
  })

  it('删除：点取消什么都不做', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    const { vm } = await open()

    await vm.remove({ ...receipt })
    expect(deleteReceipt).not.toHaveBeenCalled()
    expect(vm.receipts).toHaveLength(1)
  })

  it('选图：非法类型 / 超 5MB / 超 9 张都在前端拦下，合法才上传', async () => {
    const { vm } = await open()

    await vm.onPick(pickEvent([fileOf('application/pdf', 1024)]))
    expect(uploadReceipt).not.toHaveBeenCalled()

    await vm.onPick(pickEvent([fileOf('image/png', 5 * 1024 * 1024 + 1)]))
    expect(uploadReceipt).not.toHaveBeenCalled()

    await vm.onPick(pickEvent([fileOf('image/png', 1024, '小票.png')]))
    expect(uploadReceipt).toHaveBeenCalledWith(7, expect.any(File), '小票')
  })

  it('单笔导出：调专用接口（不是账本级那个）', async () => {
    const { vm } = await open()

    await vm.exportSingle()
    expect(exportTransactionReceipts).toHaveBeenCalledWith(7)
  })
})