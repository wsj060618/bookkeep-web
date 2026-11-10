import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * 票据 API 的白盒测试：只关心「请求是怎么拼的」，网络层整体 mock。
 * <p>重点两件事：multipart 里 file/title 都进得去（后端靠 @RequestParam 取），
 * 以及公示页 URL 的 token 必须 encodeURIComponent（token 是 UUID，但别赌它永远安全）。
 */

const postForm = vi.fn()
const put = vi.fn()
const del = vi.fn()
const get = vi.fn()
const getFile = vi.fn()

vi.mock('../request', () => ({
  postForm: (...args: unknown[]) => postForm(...args),
  put: (...args: unknown[]) => put(...args),
  del: (...args: unknown[]) => del(...args),
  get: (...args: unknown[]) => get(...args),
  getFile: (...args: unknown[]) => getFile(...args),
}))

const api = await import('../receipt')

describe('receipt api', () => {
  beforeEach(() => {
    postForm.mockReset().mockResolvedValue({ id: 1 })
    put.mockReset().mockResolvedValue(undefined)
    del.mockReset().mockResolvedValue(undefined)
    get.mockReset().mockResolvedValue([])
    getFile.mockReset().mockResolvedValue({ blob: new Blob(), filename: 'x.png' })
  })

  it('uploadReceipt 拼 multipart：file 必填，title 为空时不传', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], '小票.png', { type: 'image/png' })

    await api.uploadReceipt(7, file)
    const [url, form] = postForm.mock.calls[0] as [string, FormData]
    expect(url).toBe('/transactions/7/receipts')
    expect((form.get('file') as File).name).toBe('小票.png')
    expect(form.get('title')).toBeNull()

    await api.uploadReceipt(7, file, '班服收据')
    const [, withTitle] = postForm.mock.calls[1] as [string, FormData]
    expect(withTitle.get('title')).toBe('班服收据')
  })

  it('改名与删除走正确的路径', async () => {
    await api.renameReceipt(7, 3, '新标题')
    expect(put).toHaveBeenCalledWith('/transactions/7/receipts/3', { title: '新标题' })

    await api.deleteReceipt(7, 3)
    expect(del).toHaveBeenCalledWith('/transactions/7/receipts/3')
  })

  it('列表与图片：图片走 blob（登录态接口不能当 img src 直链）', async () => {
    await api.listReceipts(7)
    expect(get).toHaveBeenCalledWith('/transactions/7/receipts')

    const blob = new Blob(['x'])
    getFile.mockResolvedValueOnce({ blob, filename: 'a.png' })
    const result = await api.fetchReceiptBlob(7, 3)
    expect(result).toBe(blob)
    expect(getFile).toHaveBeenCalledWith('/transactions/7/receipts/3')
  })

  it('导出：账本级带区间（单笔改成逐张下载图片，不再有 zip 接口）', async () => {
    await api.exportBookReceipts({ startDate: '2026-09-01', endDate: '2026-09-30' })
    expect(getFile).toHaveBeenCalledWith('/transactions/receipts/export', {
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    })
  })

  it('公示页图片 URL：拼在公开路径下并编码 token', () => {
    expect(api.publicReceiptUrl('abc123', 9)).toBe('/api/public/report/abc123/receipts/9')
    expect(api.publicReceiptUrl('a/b c', 9)).toBe('/api/public/report/a%2Fb%20c/receipts/9')
  })
})