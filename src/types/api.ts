/**
 * 后端 API 的「形状」定义（TypeScript 术语：interface / 接口）。
 *
 * 这些接口不是运行时代码，编译后会被完全擦除，唯一作用是：
 * 写 `resp.user.nickName` 时 TS 立刻报错说「User 上没有 nickName」。
 * 也就是说，字段名写错、类型对不上，在 `npm run build` 就暴露，
 * 不用等浏览器跑到那一行才发现（这正是选 TS 的理由）。
 *
 * 注意：这里的字段名必须和 Java 侧的 DTO **逐字一致**（大小写敏感）。
 * 对照表：
 *   User       ← com.bookkeep.model.dto.resp.UserResp
 *   Book       ← com.bookkeep.model.dto.resp.BookResp
 *   LoginResp  ← com.bookkeep.model.dto.resp.LoginResp
 *   ApiResult  ← com.bookkeep.common.result.Result
 *   PageResult ← com.bookkeep.common.result.PageResult
 */

/** 统一信封 {code, message, data}，`T` 是 data 的类型（泛型） */
export interface ApiResult<T> {
  code: number
  message: string
  data: T
}

/** 分页信封。PLAN §5.0 第 1 条定死：字段就是 total / list，入参就是 page / size */
export interface PageResult<T> {
  total: number
  list: T[]
}

/** 用户信息。后端 UserResp 不含 password / deleted，这里也不写 */
export interface User {
  id: number
  username: string
  nickname: string | null
  email: string | null
  avatar: string | null
  currentBookId: number | null
}

/** 账本类型：项目只有班级账本，固定 'class'（后端 book.type 同值） */
export type BookType = 'class'

/** 账本。current 由后端算好（是不是 user.current_book_id），前端不用自己比 */
export interface Book {
  id: number
  name: string
  type: BookType
  current: boolean
}

/**
 * 登录响应。
 * 注意 books 和 user 是**平级**的（后端 PLAN §5.1 特意这么定），不是 user.books。
 */
export interface LoginResp {
  token: string
  user: User
  books: Book[]
}