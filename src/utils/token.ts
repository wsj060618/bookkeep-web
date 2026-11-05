import type { Book } from '../types/api'

/**
 * token 的读写只走这一个文件，避免各处散落 `localStorage.getItem('token')` 这种字符串。
 * 为什么还要同步存 localStorage：刷新页面后 Pinia 里的内存状态全丢，token 必须能挺过一次刷新。
 * （更严谨的做法是 httpOnly Cookie，但那样后端要处理 CSRF；本项目是纯前后端分离 + Bearer token，先用这个方案。）
 * books 一起存：分享链接要靠 books[].shareToken，刷新后没有 books 就复制不了链接（/me 只返回 user）。
 */

const TOKEN_KEY = 'bookkeep_token'
const BOOKS_KEY = 'bookkeep_books'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(BOOKS_KEY)
}

export function getStoredBooks(): Book[] | null {
  const raw = localStorage.getItem(BOOKS_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    // 老版本/手改过的 localStorage 可能是对象或字符串：直接当空处理，
    // 否则 AppLayout 里 books.find(...) 会抛 TypeError，整页白屏
    return Array.isArray(parsed) ? (parsed as Book[]) : null
  } catch {
    return null
  }
}

export function setStoredBooks(books: Book[]): void {
  localStorage.setItem(BOOKS_KEY, JSON.stringify(books))
}