/**
 * 票据的前端规则，与后端 `ReceiptStorage` 保持一致：
 * 只收 jpg / png / webp，单张 ≤5MB，单笔 ≤9 张。
 *
 * <p>为什么前端也要判：文件类型/大小能在**选完就提示**，不用等上传失败；
 * 但真正的安全判断仍在后端（魔数识别），前端只看 MIME 与大小。
 */

/** 与后端 `ReceiptStorage.MAX_FILE_BYTES` 一致 */
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024

/** 与后端 `ReceiptStorage.MAX_PER_TRANSACTION` 一致 */
export const RECEIPT_MAX_PER_TRANSACTION = 9

/** 浏览器给的 MIME 只当提示，后端还会按魔数再判一次 */
export const RECEIPT_ACCEPT = 'image/jpeg,image/png,image/webp'

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
    return `单张票据不能超过 5MB（当前 ${formatSize(file.size)}）`
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