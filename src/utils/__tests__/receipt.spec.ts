import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  RECEIPT_MAX_BYTES,
  RECEIPT_MAX_PER_TRANSACTION,
  compressReceiptImage,
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

/**
 * 压图是**有损**的（存下来的就是压后的版本），所以「什么时候不压」比「怎么压」更要紧：
 * 环境不支持、解码失败、小图、压完更大 —— 全都要原样放行，不能因为优化把上传搞挂。
 */
describe('compressReceiptImage', () => {
  const originalCreateImageBitmap = (globalThis as { createImageBitmap?: unknown }).createImageBitmap

  function stubBitmap(value: unknown): void {
    Object.defineProperty(globalThis, 'createImageBitmap', {
      value,
      configurable: true,
      writable: true,
    })
  }

  afterEach(() => {
    Object.defineProperty(globalThis, 'createImageBitmap', {
      value: originalCreateImageBitmap,
      configurable: true,
      writable: true,
    })
    vi.restoreAllMocks()
  })

  it('环境不支持 createImageBitmap（老浏览器/测试环境）就原样返回', async () => {
    stubBitmap(undefined)
    const file = fileOf('image/jpeg', 5 * 1024 * 1024)
    expect(await compressReceiptImage(file)).toBe(file)
  })

  it('解码失败（HEIC / 损坏文件）原样返回，让后端按魔数给友好提示', async () => {
    stubBitmap(vi.fn().mockRejectedValue(new Error('decode failed')))
    const file = fileOf('image/jpeg', 5 * 1024 * 1024)
    expect(await compressReceiptImage(file)).toBe(file)
  })

  it('小图不重编码：尺寸没超上限、体积也不大，直接返回原文件', async () => {
    const bitmap = { width: 800, height: 600, close: vi.fn() }
    stubBitmap(vi.fn().mockResolvedValue(bitmap))
    const file = fileOf('image/jpeg', 300 * 1024)

    expect(await compressReceiptImage(file)).toBe(file)
    expect(bitmap.close).toHaveBeenCalled()
  })

  it('canvas 拿不到 2d 上下文时也原样返回（不抛异常）', async () => {
    stubBitmap(vi.fn().mockResolvedValue({ width: 4000, height: 3000, close: vi.fn() }))
    vi.spyOn(document, 'createElement').mockReturnValue({
      width: 0,
      height: 0,
      getContext: () => null,
    } as unknown as HTMLElement)

    const file = fileOf('image/jpeg', 5 * 1024 * 1024)
    expect(await compressReceiptImage(file)).toBe(file)
  })

  /** 假 canvas：记录最终画布尺寸，toBlob 直接回调一个「压小了」的 blob */
  function stubCanvas(outputBytes: number): { width: number; height: number; quality?: number } {
    const record = { width: 0, height: 0 } as { width: number; height: number; quality?: number }
    vi.spyOn(document, 'createElement').mockImplementation(
      () =>
        ({
          get width() {
            return record.width
          },
          set width(value: number) {
            record.width = value
          },
          get height() {
            return record.height
          },
          set height(value: number) {
            record.height = value
          },
          getContext: () => ({ fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }),
          toBlob: (cb: (blob: Blob | null) => void, type: string, quality: number) => {
            record.quality = quality
            cb(new Blob([new Uint8Array(outputBytes)], { type }))
          },
        }) as unknown as HTMLElement,
    )
    return record
  }

  it('横图：按宽度缩到 2000', async () => {
    stubBitmap(vi.fn().mockResolvedValue({ width: 4000, height: 3000, close: vi.fn() }))
    const record = stubCanvas(800 * 1024)

    const result = await compressReceiptImage(fileOf('image/jpeg', 5 * 1024 * 1024))

    expect([record.width, record.height]).toEqual([2000, 1500])
    expect(record.quality).toBe(0.85)
    expect(result.type).toBe('image/jpeg')
    expect(result.size).toBeLessThan(5 * 1024 * 1024)
  })

  it('手机长截图（1084×17703）：只转码不缩尺寸，宽度必须保住', async () => {
    stubBitmap(vi.fn().mockResolvedValue({ width: 1084, height: 17703, close: vi.fn() }))
    const record = stubCanvas(1300 * 1024)

    const result = await compressReceiptImage(fileOf('image/png', 7064 * 1024))

    // 按长边算会变成 122×2000，字全糊；按宽度算就是原样尺寸
    expect([record.width, record.height]).toEqual([1084, 17703])
    expect(result.size).toBeLessThan(7064 * 1024)
  })
})