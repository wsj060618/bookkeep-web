import { describe, expect, it } from 'vitest'
import type { FormItemRule } from 'element-plus'
import { AMOUNT_MESSAGE, amountRule, isEmail, PASSWORD_PATTERN } from '../validate'

/**
 * 金额 / 邮箱 / 密码规则的字段级白盒测试。
 * <p>这些规则是前后端**同一口径**的一半（另一半是 Java 的 MoneyRules / EmailRules / PasswordRules），
 * 改动任何一边都必须让两边同时绿。
 */

/** element-plus 的 validator 是回调式，这里包一层同步断言 */
function check(rule: FormItemRule, value: string): string | null {
  let result: string | null = null
  const callback = (error?: Error) => {
    result = error ? error.message : null
  }
  ;(rule.validator as (r: unknown, v: string, cb: (e?: Error) => void) => void)(rule, value, callback)
  return result
}

describe('amountRule（与后端 MoneyRules 对齐）', () => {
  const rule: FormItemRule = amountRule

  it('空值交给 required 规则，这里不报错', () => {
    expect(check(rule, '')).toBeNull()
    expect(check(rule, '   ')).toBeNull()
  })

  it('正常金额通过', () => {
    for (const value of ['0.01', '1', '12.5', '999999.99', '1000.00']) {
      expect(check(rule, value)).toBeNull()
    }
  })

  it('上限边界：1000000 被拒，提示里带范围', () => {
    const message = check(rule, '1000000')
    expect(message).toBe(AMOUNT_MESSAGE)
    expect(message).toContain('999,999.99')
  })

  it('0 与负数、三位小数、科学计数法都被拒', () => {
    for (const value of ['0', '0.00', '-1', '1.234', '1e5', '+100']) {
      expect(check(rule, value)).toBe(AMOUNT_MESSAGE)
    }
  })
})

describe('email / password 规则', () => {
  it('邮箱：正常通过，宽松格式被拒（不允许 123@qq、中文本地部分）', () => {
    expect(isEmail('a.b-c@example.com')).toBe(true)
    expect(isEmail('123@qq')).toBe(false)
    expect(isEmail('张三@qq.com')).toBe(false)
    expect(isEmail('a@b.c')).toBe(false)
  })

  it('密码：至少含两种字符、6–32 位', () => {
    expect(PASSWORD_PATTERN.test('abc123')).toBe(true)
    expect(PASSWORD_PATTERN.test('abc_123')).toBe(true)
    expect(PASSWORD_PATTERN.test('abcdef')).toBe(false)
    expect(PASSWORD_PATTERN.test('123456')).toBe(false)
    expect(PASSWORD_PATTERN.test('abc12')).toBe(false)
    expect(PASSWORD_PATTERN.test('a1'.repeat(20))).toBe(false)
  })
})