/**
 * 票据的前端规则，与后端 `ReceiptStorage` 保持一致：
 * 只收 jpg / png / webp，单张 ≤10MB，单笔 ≤9 张。
 *
 * <p>为什么前端也要判：文件类型/大小能在**选完就提示**，不用等上传失败；
 * 但真正的安全判断仍在后端（魔数识别），前端只看 MIME 与大小。
 */

/** 与后端 `ReceiptStorage.MAX_FILE_BYTES` 一致 */
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024

/** 与后端 `ReceiptStorage.MAX_PER_TRANSACTION` 一致 */
export const RECEIPT_MAX_PER_TRANSACTION = 9

/** 浏览器给的 MIME 只当提示，后端还会按魔数再判一次 */
export const RECEIPT_ACCEPT = 'image/jpeg,image/png,image/webp'

/**
 * 上传前压图的上限（长边像素）。
 * <p>为什么压：云服务器出网只有 2Mbps，一张 5MB 的手机原图点开要 20 秒。
 * 2000px 折算约 250DPI（A4 宽度的收据），够看清金额/日期/明细；
 * 只有「一张长图拍整条购物小票」这种极端情况末端小字会发糊。
 * <p>要更清晰就把它调到 2560（体积翻倍、加载慢一倍），要更省流量就调到 1600。
 */
export const RECEIPT_MAX_EDGE = 2000

/** 小图不重编码：JPEG 二次压缩只会掉画质，省不下多少 */
export const RECEIPT_RECOMPRESS_ABOVE = 1.5 * 1024 * 1024

const RECEIPT_JPEG_QUALITY = 0.85

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** 校验一个文件，返回错误文案；合法返回 null */
export function validateReceiptFile(file: File, existingCount: number): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    // iPhone 默认拍 HEIC，浏览器里 MIME 是 image/heic，这里会被拦下——提示要具体
    if (file.type === 'image/heic' || file.type === 'image/heif') {
      return '暂不支持 iPhone 的 HEIC 格式：请在「设置 → 相机 → 格式」里选「兼容性最佳」，或另存为 JPG'
    }
    return '只支持 jpg / png / webp 图片'
  }
  if (file.size > RECEIPT_MAX_BYTES) {
    return `单张票据不能超过 10MB（当前 ${formatSize(file.size)}）`
  }
  if (existingCount >= RECEIPT_MAX_PER_TRANSACTION) {
    return `单笔最多 ${RECEIPT_MAX_PER_TRANSACTION} 张票据，删掉几张再传`
  }
  return null
}

/** 默认标题 = 文件名去扩展名（与后端 `ReceiptStorage.defaultTitle` 同规则） */
export function defaultReceiptTitle(filename: string): string {
  const name = (filename || '').trim()
  if (!name || name.startsWith('.')) {
    return '票据'
  }
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const cleaned = stem.replace(/[\\/:*?"<>|\r\n\t]/g, ' ').trim()
  if (!cleaned) {
    return '票据'
  }
  return cleaned.length > 30 ? cleaned.slice(0, 30) : cleaned
}

/** 字节数转「1.2MB」/「640KB」 */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '0KB'
  }
  if (bytes < 1024) {
    return `${bytes}B`
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)}KB`
  }
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

/**
 * 上传前把大图压到 `RECEIPT_MAX_EDGE` 内、JPEG q0.85。
 * <p>**这一层是有损的**：存下来的、导出的 zip 里都是压缩后的版本。换来的是
 * 「点开大图」从 20 秒变 3 秒。缩略图那一层才是无损的（另存一个派生文件，原图不动）。
 * <p>四条兜底：环境不支持 `createImageBitmap`（测试/老浏览器）、解码失败（HEIC/损坏）、
 * canvas 不可用、压完反而更大 —— 一律原样返回原文件；压缩永远不是上传失败的理由。
 */
export async function compressReceiptImage(file: File): Promise<File> {
  if (typeof createImageBitmap !== 'function') {
    return file
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }

  try {
    const longEdge = Math.max(bitmap.width, bitmap.height)
    const scale = Math.min(1, RECEIPT_MAX_EDGE / longEdge)
    if (scale === 1 && file.size <= RECEIPT_RECOMPRESS_ABOVE) {
      return file
    }

    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return file
    }
    // 透明区铺白：PNG 截图带 alpha，直接压成 JPEG 会变黑块
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', RECEIPT_JPEG_QUALITY),
    )
    if (!blob || blob.size >= file.size) {
      return file
    }
    // 文件名保持不变：后端按魔数识别类型，标题默认取的就是这个文件名
    return new File([blob], file.name, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return file
  } finally {
    bitmap.close?.()
  }
}
