/**
 * token 的读写只走这一个文件，避免各处散落 `localStorage.getItem('token')` 这种字符串。
 * 为什么还要同步存 localStorage：刷新页面后 Pinia 里的内存状态全丢，token 必须能挺过一次刷新。
 * （更严谨的做法是 httpOnly Cookie，但那样后端要处理 CSRF；本项目是纯前后端分离 + Bearer token，先用这个方案。）
 */

const TOKEN_KEY = 'bookkeep_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}