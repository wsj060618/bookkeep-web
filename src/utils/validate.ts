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
 * 密码的唯一口径，必须和后端 `PasswordRules.PATTERN` 保持一致。
 * 只用于**设置新密码**（注册 / 改密码 / 重置密码）；登录用的是旧密码，不受这条限制。
 */
export const PASSWORD_PATTERN = /^[A-Za-z0-9_]{6,32}$/

export const PASSWORD_MESSAGE = '密码需 6–32 位字母、数字或下划线'

/** 新密码规则；空值交给 required 规则 */
export const passwordRule: FormItemRule = {
  validator: (_rule, value: string, callback) => {
    const v = value ?? ''
    callback(!v || PASSWORD_PATTERN.test(v) ? undefined : new Error(PASSWORD_MESSAGE))
  },
  trigger: 'blur',
}