import type { LoginResp, RegisterReq, User } from '../types/api'
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