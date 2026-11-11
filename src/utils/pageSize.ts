/**
 * 每页条数：预设 + 手输，流水页和公示页共用一套。
 *
 * 存同一个 localStorage key：公示页是只读快照，但「我习惯每页 30 条」这个偏好没必要分两处。
 * 上限 100 和后端 TransactionQuery.size 一致。
 */
export const PAGE_SIZES = [5, 10, 15, 20, 25, 30]
export const MAX_PAGE_SIZE = 100

const SIZE_KEY = 'bookkeep_page_size'

export function readPageSize(fallback = 10): number {
  const saved = Number(localStorage.getItem(SIZE_KEY))
  return Number.isInteger(saved) && saved >= 1 && saved <= MAX_PAGE_SIZE ? saved : fallback
}

export function savePageSize(size: number): void {
  localStorage.setItem(SIZE_KEY, String(size))
}

/** allow-create 会把用户输入原样（字符串）传进来；非法值返回 null，调用方保持原值不动 */
export function normalizePageSize(value: unknown): number | null {
  const next = Math.floor(Number(value))
  return Number.isFinite(next) && next >= 1 && next <= MAX_PAGE_SIZE ? next : null
}

/** 手输的值也要留在选项里，否则选完下拉只显示一个裸数字 */
export function pageSizeOptions(size: number): number[] {
  return PAGE_SIZES.includes(size) ? PAGE_SIZES : [...PAGE_SIZES, size].sort((a, b) => a - b)
}
