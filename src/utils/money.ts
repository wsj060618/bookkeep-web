/**
 * 金额展示：负数一律写成 `-￥12.00`，负号在 `￥` 前面。
 * <p>与流水列表的「-￥」保持一致，避免同一个数在卡片里是 `￥-13.00`、在图上是 `-￥13.00`。
 */
export function formatMoney(value: string | number | null | undefined): string {
  const n = Number(value ?? 0)
  const text = Math.abs(n).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${n < 0 ? '-￥' : '￥'}${text}`
}
