import type { FormItemRule } from 'element-plus'

/**
 * 邮箱格式的唯一口径，必须和后端 `EmailRules.PATTERN` 保持一致。
 * 不用 el-form 的 `type: 'email'`：async-validator 那套正则太宽，
 * `张三@qq.com`（本地部分是中文）能过，用户看到的却是「邮箱格式正确」。
 */
export const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/

export function isEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim())
}

/** el-form 的邮箱格式规则；「不能为空」的文案各页面自己写 */
export const emailFormatRule: FormItemRule = {
  validator: (_rule, value: string, callback) => {
    const v = (value ?? '').trim()
    // 空值交给 required 规则，这里别抢答
    callback(!v || isEmail(v) ? undefined : new Error('邮箱格式不正确'))
  },
  trigger: 'blur',
}

/**
 * 密码的唯一口径，必须和后端 `PasswordRules.PATTERN` 保持一致：
 * 6–32 位，字母 / 数字 / 下划线**至少含两种**（纯数字、纯字母都算弱口令）。
 * 只用于**设置新密码**（注册 / 改密码 / 重置密码）；登录用的是旧密码，不受这条限制。
 */
export const PASSWORD_PATTERN = /^(?![A-Za-z]{6,32}$)(?![0-9]{6,32}$)(?![_]{6,32}$)[A-Za-z0-9_]{6,32}$/

export const PASSWORD_MESSAGE = '密码需 6–32 位，字母/数字/下划线至少含两种'

/** 新密码规则；空值交给 required 规则 */
export const passwordRule: FormItemRule = {
  validator: (_rule, value: string, callback) => {
    const v = value ?? ''
    callback(!v || PASSWORD_PATTERN.test(v) ? undefined : new Error(PASSWORD_MESSAGE))
  },
  trigger: 'blur',
}

/**
 * 金额的唯一口径，必须和后端 `MoneyRules` 保持一致：0.01 ~ 999,999.99，最多两位小数。
 * 上限不是业务限制而是防溢出——库里 `amount` / `balance_after` 是 DECIMAL(12,2)，
 * 以前前端放过 10 位整数，填大了累加结余会顶出列宽。
 */
export const AMOUNT_MAX = 999999.99

export const AMOUNT_MESSAGE = '金额需在 0.01 ~ 999,999.99 元之间，最多两位小数'

/** 金额输入规则；空值交给 required 规则 */
export const amountRule: FormItemRule = {
  validator: (_rule, value: string, callback) => {
    const v = (value ?? '').trim()
    if (!v) return callback()
    // 只认「数字 + 最多两位小数」，顺带挡住 1e5、+100、空格这类 BigDecimal 之外的写法
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(v)) {
      return callback(new Error(AMOUNT_MESSAGE))
    }
    const n = Number(v)
    callback(n >= 0.01 && n <= AMOUNT_MAX ? undefined : new Error(AMOUNT_MESSAGE))
  },
  trigger: 'blur',
}