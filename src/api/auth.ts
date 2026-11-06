import type { ForgotPasswordReq, LoginResp, RegisterReq, ResetPasswordReq, User } from '../types/api'
import { get, post } from './request'

/**
 * 认证相关接口，对应后端 AuthController。
 * 每加一个接口就在这里加一个函数，视图层不写 URL 字符串。
 */

/** POST /api/auth/login → {token, user, books}（books 与 user 平级） */
export function login(username: string, password: string): Promise<LoginResp> {
  return post<LoginResp>('/auth/login', { username, password })
}

/** GET /api/auth/me → UserResp（不带 token 会得到真实 HTTP 401） */
export function fetchMe(): Promise<User> {
  return get<User>('/auth/me')
}

/**
 * POST /api/auth/register → UserResp（**不含 token**）。
 * 注册成功还要再调一次 /auth/login 才拿到 token，见 RegisterView 的提交流程。
 */
export function register(req: RegisterReq): Promise<User> {
  return post<User>('/auth/register', req)
}

/** POST /api/auth/forgot-password —— 用户名+邮箱同时匹配才发信；响应永远是同一句成功提示 */
export function forgotPassword(req: ForgotPasswordReq): Promise<void> {
  return post<void>('/auth/forgot-password', req)
}

/** POST /api/auth/reset-password —— 用邮件里的一次性 token 换新密码（成功后旧会话全部失效） */
export function resetPassword(req: ResetPasswordReq): Promise<void> {
  return post<void>('/auth/reset-password', req)
}