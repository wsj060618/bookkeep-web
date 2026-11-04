import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { fetchMe, login as loginApi } from '../api/auth'
import type { Book, LoginResp, User } from '../types/api'
import { clearToken, getStoredBooks, getToken, setStoredBooks, setToken } from '../utils/token'

/**
 * 登录状态。
 *
 * 为什么用「setup 写法」（返回 ref / function 的那种）而不是选项式：
 * 它和平时写 <script setup> 完全一样，TS 的类型推断最直接，不用记 state/mutations/actions 三套。
 *
 * token 放两处：Pinia 内存（响应式，页面用它控制显示）+ localStorage（扛刷新）。
 * user 放内存就够了，刷新后调 /api/auth/me 拿回来——这也是第 0 步的验收点。
 */
export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(getToken())
  const user = ref<User | null>(null)
  // /me 不返回 books，所以 books 靠登录响应 + localStorage（分享链接需要 shareToken）
  const books = ref<Book[]>(getStoredBooks() ?? [])

  const isLoggedIn = computed(() => token.value !== null)

  /** 登录成功后立刻拿到 user/books，不用再请求一次 /me */
  async function login(username: string, password: string): Promise<LoginResp> {
    const resp = await loginApi(username, password)
    token.value = resp.token
    setToken(resp.token)
    user.value = resp.user
    books.value = resp.books
    setStoredBooks(resp.books)
    return resp
  }

  /** 刷新页面后恢复用户资料（token 已在 localStorage 里） */
  async function loadMe(): Promise<User> {
    const me = await fetchMe()
    user.value = me
    return me
  }

  function logout(): void {
    token.value = null
    user.value = null
    books.value = []
    clearToken()
  }

  /** 改名等操作返回新的 Book 后同步内存 + localStorage，避免与后端不一致 */
  function applyBook(book: Book): void {
    books.value = books.value.map((b) => (b.id === book.id ? { ...b, ...book } : b))
    setStoredBooks(books.value)
  }

  return { token, user, books, isLoggedIn, login, loadMe, logout, applyBook }
})