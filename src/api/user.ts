import type { AccountDeleteReq, PasswordUpdateReq, User, UserUpdateReq } from '../types/api'
import { del, put } from './request'

/** 用户自助管理，对应后端 UserController（PLAN §5.3） */

/** PUT /api/users/me —— 改昵称 / 邮箱；空串等于清空 */
export function updateProfile(req: UserUpdateReq): Promise<User> {
  return put<User>('/users/me', req)
}

/** PUT /api/users/me/password —— 需要旧密码；成功后所有旧 token 立即失效，必须重新登录 */
export function updatePassword(req: PasswordUpdateReq): Promise<void> {
  return put<void>('/users/me/password', req)
}

/** DELETE /api/users/me —— 注销账户（密码二次确认），不可自助恢复 */
export function deleteAccount(req: AccountDeleteReq): Promise<void> {
  return del<void>('/users/me', req)
}