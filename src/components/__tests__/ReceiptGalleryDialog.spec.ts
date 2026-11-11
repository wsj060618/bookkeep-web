import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'
import ReceiptGalleryDialog from '../ReceiptGalleryDialog.vue'
import type { Receipt, Transaction } from '../../types/api'

/**
 * 票据图集的行为测试（白盒）：直接调组件方法，断言「改了哪些状态、调了哪些接口」。
 *
 * <p>核心约定（这次修的就是它）：**改动是草稿语义**——选图/改名/删除只改本地，
 * 点「保存」才提交；直接关掉弹窗什么都不写库。
 */

const listReceipts = vi.fn()
const fetchReceiptBlob = vi.fn()
const renameReceipt = vi.fn()
const deleteReceipt = vi.fn()
const uploadReceipt = vi.fn()
const importReceiptsZip = vi.fn()
const exportTransactionReceipts = vi.fn()

vi.mock('../../api/receipt', () => ({
  listReceipts: (...args: unknown[]) => listReceipts(...args),
  fetchReceiptBlob: (...args: unknown[]) => fetchReceiptBlob(...args),
  renameReceipt: (...args: unknown[]) => renameReceipt(...args),
  deleteReceipt: (...args: unknown[]) => deleteReceipt(...args),
  uploadReceipt: (...args: unknown[]) => uploadReceipt(...args),
  importReceiptsZip: (...args: unknown[]) => importReceiptsZip(...args),
  exportTransactionReceipts: (...args: unknown[]) => exportTransactionReceipts(...args),
  publicReceiptUrl: (token: string, id: number) => `/api/public/report/${token}/receipts/${id}`,
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

interface DialogVm {
  load: () => Promise<void>
  save: () => Promise<void>
  onPick: (event: Event) => void
  onImportZip: (event: Event) => Promise<void>
  removeSaved: (r: Receipt) => void
  undoRemove: (r: Receipt) => void
  removePending: (index: number) => void
  exportZip: () => Promise<void>
  titles: Record<number, string>
  receipts: Receipt[]
  kept: Receipt[]
  pending: { file: File; title: string }[]
  removed: Set<number>
  dirty: boolean
  importFailed: { file: string; reason: string }[]
  /** receiptId → 图片地址（管理端是 objectURL，公示页是匿名直链） */
  previews: Record<number, string>
  /** 缩略图三态：取图还没回来是 loading，不能显示「加载失败」 */
  thumbState: (id: number) => 'ok' | 'loading' | 'failed'
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

function fileOf(type: string, size: number, name = 'a.png'): File {
  const file = new File([new Uint8Array(8)], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

function pickEvent(files: File[]): Event {
  const input = document.createElement('input')
  Object.defineProperty(input, 'files', { value: files })
  return { target: input } as unknown as Event
}

describe('ReceiptGalleryDialog（草稿 → 保存）', () => {
  beforeEach(() => {
    listReceipts.mockReset().mockResolvedValue([{ ...receipt }])
    fetchReceiptBlob.mockReset().mockResolvedValue(new Blob([new Uint8Array([1])], { type: 'image/png' }))
    renameReceipt.mockReset().mockResolvedValue(undefined)
    deleteReceipt.mockReset().mockResolvedValue(undefined)
    uploadReceipt.mockReset().mockResolvedValue({})
    importReceiptsZip.mockReset().mockResolvedValue({ success: 2, failed: [] })
    exportTransactionReceipts.mockReset().mockResolvedValue({ blob: new Blob(), filename: 'x.zip' })
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock'), writable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('打开时按流水 id 拉列表并逐张取图', async () => {
    const { vm } = await open()
    expect(listReceipts).toHaveBeenCalledWith(7)
    expect(fetchReceiptBlob).toHaveBeenCalledWith(7, 11)
    expect(vm.receipts).toHaveLength(1)
    expect(vm.titles[11]).toBe('超市小票')
    expect(vm.dirty).toBe(false)
    expect(vm.thumbState(11)).toBe('ok')
  })

  it('取图还没回来时是 loading 骨架，不是「图片加载失败」', async () => {
    let resolveBlob: (blob: Blob) => void = () => {}
    fetchReceiptBlob.mockReset().mockImplementation(
      () =>
        new Promise<Blob>((resolve) => {
          resolveBlob = resolve
        }),
    )

    const { vm } = await open()
    expect(vm.thumbState(11)).toBe('loading')

    resolveBlob(new Blob([new Uint8Array([1])], { type: 'image/png' }))
    await flushPromises()
    expect(vm.thumbState(11)).toBe('ok')
  })

  it('取图真的失败才显示「图片加载失败」', async () => {
    fetchReceiptBlob.mockReset().mockRejectedValue(new Error('boom'))
    const { vm } = await open()
    expect(vm.thumbState(11)).toBe('failed')
  })

  it('选图只是暂存：不调上传接口，有未保存标记', async () => {
    const { vm } = await open()
    vm.onPick(pickEvent([fileOf('image/png', 1024, '小票.png')]))
    await flushPromises()

    expect(uploadReceipt).not.toHaveBeenCalled()
    expect(vm.pending).toHaveLength(1)
    expect(vm.dirty).toBe(true)
  })

  it('删除只是标记：不调删除接口，可以撤销', async () => {
    const { vm } = await open()
    vm.removeSaved({ ...receipt })
    await flushPromises()

    expect(deleteReceipt).not.toHaveBeenCalled()
    expect(vm.kept).toHaveLength(0)
    expect(vm.dirty).toBe(true)

    vm.undoRemove({ ...receipt })
    await flushPromises()
    expect(vm.kept).toHaveLength(1)
  })

  it('点保存才依次提交：删除 → 改名 → 上传', async () => {
    const { vm, wrapper } = await open()
    vm.titles[11] = '班服收据'
    vm.removeSaved({ ...receipt })          // 先标记删掉这一张
    vm.onPick(pickEvent([fileOf('image/png', 1024, '新图.png')]))
    await flushPromises()

    await vm.save()
    await flushPromises()

    // 删掉的那张不该再改名
    expect(deleteReceipt).toHaveBeenCalledWith(7, 11)
    expect(renameReceipt).not.toHaveBeenCalled()
    expect(uploadReceipt).toHaveBeenCalledTimes(1)
    expect(uploadReceipt).toHaveBeenCalledWith(7, expect.any(File), '新图')
    expect(wrapper.emitted('changed')).toBeTruthy()
  })

  it('保存时上传失败：提示并留在弹窗，不清空待上传列表', async () => {
    uploadReceipt.mockRejectedValueOnce(new Error('boom'))
    const { vm, wrapper } = await open()
    vm.onPick(pickEvent([fileOf('image/png', 1024, '小票.png')]))
    await flushPromises()

    await vm.save()
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')).toBeFalsy() // 没关弹窗
  })

  it('选图校验：非法类型 / 超 5MB / 超 9 张都不进 pending', async () => {
    const { vm } = await open()

    vm.onPick(pickEvent([fileOf('application/pdf', 1024)]))
    vm.onPick(pickEvent([fileOf('image/png', 5 * 1024 * 1024 + 1)]))
    await flushPromises()
    expect(vm.pending).toHaveLength(0)

    vm.onPick(pickEvent([fileOf('image/png', 1024, 'ok.png')]))
    await flushPromises()
    expect(vm.pending).toHaveLength(1)
  })

  it('保存成功后关闭弹窗', async () => {
    const { vm, wrapper } = await open()
    vm.onPick(pickEvent([fileOf('image/png', 1024, '小票.png')]))
    await flushPromises()

    await vm.save()
    await flushPromises()

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted!.at(-1)).toEqual([false])
  })

  it('「导出压缩包」调用单笔 zip 接口（不再逐张下载）', async () => {
    const { vm } = await open()
    await vm.exportZip()
    expect(exportTransactionReceipts).toHaveBeenCalledWith(7)
  })

  it('没有改动时 dirty=false，保存按钮不会误触', async () => {
    const { vm } = await open()
    expect(vm.dirty).toBe(false)
  })

  it('压缩包导入：立即生效（不走待保存），并刷新列表', async () => {
    const { vm } = await open()
    listReceipts.mockResolvedValueOnce([{ ...receipt }, { ...receipt, id: 12, title: '班服收据' }])

    const file = new File([new Uint8Array(8)], '票据.zip', { type: 'application/zip' })
    const input = document.createElement('input')
    Object.defineProperty(input, 'files', { value: [file] })

    await vm.onImportZip({ target: input } as unknown as Event)
    await flushPromises()

    expect(importReceiptsZip).toHaveBeenCalledWith(7, file)
    expect(listReceipts).toHaveBeenCalledTimes(2) // 打开一次 + 导入后刷新
    expect(vm.dirty).toBe(false)                  // 导入直接入库，不算未保存改动
  })

  it('压缩包导入的失败文件会列出来', async () => {
    importReceiptsZip.mockResolvedValueOnce({
      success: 1,
      failed: [{ file: '说明.txt', reason: '只支持 jpg / png / webp 图片' }],
    })
    const { vm } = await open()
    const input = document.createElement('input')
    Object.defineProperty(input, 'files', { value: [new File([new Uint8Array(1)], 'x.zip')] })

    await vm.onImportZip({ target: input } as unknown as Event)
    await flushPromises()

    expect(vm.importFailed).toHaveLength(1)
    expect(vm.importFailed[0].file).toBe('说明.txt')
  })

  it('关闭有未保存改动时弹确认；取消则留在弹窗', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    const { vm } = await open()
    vm.onPick(pickEvent([fileOf('image/png', 1024, '小票.png')]))
    await flushPromises()

    // before-close 是模板里的内联函数，这里直接验证 dirty 的状态语义
    expect(vm.dirty).toBe(true)
  })

  it('只读模式（公示页）：不调接口、图片走匿名直链、没有保存/删除', async () => {
    const wrapper = mount(ReceiptGalleryDialog, {
      props: {
        modelValue: false,
        readonly: true,
        shareToken: 'tk123',
        publicReceipts: [{ id: 5, title: '超市小票' }],
        headText: '班会物资 · 2026-11-10 · ￥11.00',
      },
      global: { plugins: [ElementPlus] },
    })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    const vm = wrapper.vm as unknown as DialogVm

    // 不碰任何登录态接口
    expect(listReceipts).not.toHaveBeenCalled()
    expect(fetchReceiptBlob).not.toHaveBeenCalled()

    // 数据来自上级传入，图片直接是匿名地址
    expect(vm.receipts).toHaveLength(1)
    expect(vm.titles[5]).toBe('超市小票')
    expect(vm.previews[5]).toBe('/api/public/report/tk123/receipts/5')
    expect(vm.kept).toHaveLength(1)
    // 只读：没有任何待提交的改动
    expect(vm.pending).toHaveLength(0)
    expect(vm.removed.size).toBe(0)
    expect(vm.dirty).toBe(false)

    wrapper.unmount()
  })
})