import { describe, expect, it } from 'vitest'
import { formatMoney } from '../money'

describe('formatMoney', () => {
  it('正数带 ￥、固定两位小数、千分位', () => {
    expect(formatMoney('13')).toBe('￥13.00')
    expect(formatMoney('1234.5')).toBe('￥1,234.50')
  })

  it('负号放 ￥ 前面（不是 ￥-13.00）', () => {
    expect(formatMoney('-13.00')).toBe('-￥13.00')
    expect(formatMoney(-1234.5)).toBe('-￥1,234.50')
    expect(formatMoney('-0.00')).toBe('￥0.00') // 负零不算负
  })

  it('空值按 0.00 处理（接口字段可能为 null）', () => {
    expect(formatMoney(undefined)).toBe('￥0.00')
    expect(formatMoney(null)).toBe('￥0.00')
  })
})
