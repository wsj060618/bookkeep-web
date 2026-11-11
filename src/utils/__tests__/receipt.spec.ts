import { describe, expect, it } from 'vitest'
import {
  RECEIPT_MAX_BYTES,
  RECEIPT_MAX_PER_TRANSACTION,
  defaultReceiptTitle,
  formatSize,
  validateReceiptFile,
} from '../receipt'

/** 造一个「看起来像」的文件：只关心 type/size，内容不参与校验 */
function fileOf(type: string, size: number, name = 'a.png'): File {
  const bytes = new Uint8Array(Math.min(size, 16))
  const file = new File([bytes], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('validateReceiptFile', () => {
  it('jpg / png / webp 都放行', () => {
    expect(validateReceiptFile(fileOf('image/jpeg', 1024), 0)).toBeNull()
    expect(validateReceiptFile(fileOf('image/png', 1024), 0)).toBeNull()
    expect(validateReceiptFile(fileOf('image/webp', 1024), 0)).toBeNull()
  })

  it('HEIC 给出可执行的提示（iPhone 默认格式）', () => {
    const message = validateReceiptFile(fileOf('image/heic', 1024), 0)
    expect(message).toContain('HEIC')
    expect(message).toContain('兼容性最佳')
  })

  it('其他类型一律拒绝（包括 SVG）', () => {
    expect(validateReceiptFile(fileOf('image/svg+xml', 1024), 0)).toBe('只支持 jpg / png / webp 图片')
    expect(validateReceiptFile(fileOf('application/pdf', 1024), 0)).toBe('只支持 jpg / png / webp 图片')
  })

  it('边界：正好 10MB 放行，多 1 字节拒绝，提示里带实际大小', () => {
    expect(validateReceiptFile(fileOf('image/png', RECEIPT_MAX_BYTES), 0)).toBeNull()
    const message = validateReceiptFile(fileOf('image/png', RECEIPT_MAX_BYTES + 1), 0)
    expect(message).toContain('10MB')
    expect(message).toContain('10.0MB')
  })

  it('单笔已有 9 张就不能再加', () => {
    expect(validateReceiptFile(fileOf('image/png', 1024), RECEIPT_MAX_PER_TRANSACTION)).toContain('最多 9 张')
    expect(validateReceiptFile(fileOf('image/png', 1024), RECEIPT_MAX_PER_TRANSACTION - 1)).toBeNull()
  })
})

describe('defaultReceiptTitle', () => {
  it('去扩展名，保留中文与空格', () => {
    expect(defaultReceiptTitle('超市小票.jpg')).toBe('超市小票')
    expect(defaultReceiptTitle('2026-11-05 班服收据.png')).toBe('2026-11-05 班服收据')
  })

  it('非法字符换成空格（和后端同规则）', () => {
    expect(defaultReceiptTitle('a/b:c*?.png')).toBe('a b c')
  })

  it('只有扩展名 / 空名字 → 票据', () => {
    expect(defaultReceiptTitle('.jpg')).toBe('票据')
    expect(defaultReceiptTitle('')).toBe('票据')
    expect(defaultReceiptTitle('///.png')).toBe('票据')
  })

  it('超 30 字截断', () => {
    expect(defaultReceiptTitle('字'.repeat(50) + '.png')).toHaveLength(30)
  })
})

describe('formatSize', () => {
  it('B / KB / MB 三档', () => {
    expect(formatSize(512)).toBe('512B')
    expect(formatSize(2048)).toBe('2KB')
    expect(formatSize(3 * 1024 * 1024)).toBe('3.0MB')
    expect(formatSize(1.5 * 1024 * 1024)).toBe('1.5MB')
  })

  it('脏数据兜底', () => {
    expect(formatSize(-1)).toBe('0KB')
    expect(formatSize(Number.NaN)).toBe('0KB')
  })
})