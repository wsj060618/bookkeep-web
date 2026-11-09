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
  email: string
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
  /** 当前公示链接的 token；从未分享过为 null。链接 3 天有效，点「分享」会重新生成 */
  shareToken: string | null
  /** 链接到期时间（yyyy-MM-dd HH:mm:ss）；null 或已过期表示没有可用链接 */
  shareTokenExpiresAt: string | null
  /**
   * 当前分类来自哪套自定义模板；**null = 内置「班级班费」模板**（后端 id=0，不入库）。
   * 语义是「基于哪套模板」，用户手工增删改分类后不会清空。
   */
  categoryTemplateId: number | null
  /** 学期截止日期（yyyy-MM-dd）；null = 没填。只用于展示，不参与统计 */
  semesterEnd: string | null
  /** 学期归档：true = 只读（不能记流水/改分类，但仍可改名、改截止日期、取消归档、导出、公示） */
  archived: boolean
  current: boolean
}

/** 分类模板条目，字段与分类一一对应（新建账本时按此逐条预置） */
export interface CategoryTemplateItem {
  name: string
  type: TxType
  icon: string | null
  color: string | null
  sortOrder: number
}

/**
 * 分类模板，对应后端 CategoryTemplateResp。
 * **跟账号走**（不按账本隔离）：新建账本时选一套来预置分类。
 * `id === 0` 是内置「班级班费」：不能改名/删除。
 */
export interface CategoryTemplate {
  id: number
  name: string
  builtin: boolean
  items: CategoryTemplateItem[]
}

/** 提交模板条目时不用带 sortOrder：后端按传入顺序（先支出后收入）自己编号 */
export type TemplateItemInput = Pick<CategoryTemplateItem, 'name' | 'type' | 'icon' | 'color'>

/** POST /api/books/{id}/share 的响应：只给 token 与到期时间，URL 由前端用 origin 拼 */
export interface ShareLink {
  token: string
  /** yyyy-MM-dd HH:mm:ss，分享时刻 + 3 天 */
  expiresAt: string
}

/** POST /api/auth/forgot-password —— 只填邮箱（邮箱是登录凭据且唯一）；返回永远成功 */
export interface ForgotPasswordReq {
  email: string
}

/** POST /api/auth/reset-password —— 邮件里的一次性 token，15 分钟有效 */
export interface ResetPasswordReq {
  token: string
  /** 6–32 位 */
  newPassword: string
}

/** PUT /api/users/me —— 改用户名 / 登录邮箱；**改邮箱时必须带当前密码** */
export interface UserUpdateReq {
  username: string
  email: string
  /** 仅当 email 与当前值不同时必填 */
  password?: string
}

/** PUT /api/users/me/password —— 必须带旧密码；成功后所有旧 token 失效 */
export interface PasswordUpdateReq {
  oldPassword: string
  /** 6–32 位 */
  newPassword: string
}

/** DELETE /api/users/me —— 密码二次确认 */
export interface AccountDeleteReq {
  password: string
}

/** 修改账本（改名 + 可选改学期截止日期），对应后端 BookUpdateReq */
export interface BookUpdateReq {
  /** ≤50 字，不能全空格 */
  name: string
  /** 学期截止日期 yyyy-MM-dd；**省略/null = 不改**（不是清空） */
  semesterEnd?: string | null
}

/**
 * 新建账本的请求体，对应后端 BookCreateReq。
 * `templateId` 决定新账本预置哪套分类：**省略 / 0 / null 都是内置「班级班费」**。
 */
export interface BookCreateReq {
  /** ≤50 字，不能全空格 */
  name: string
  templateId?: number | null
  /** 学期截止日期 yyyy-MM-dd，可空 */
  semesterEnd?: string | null
}

/** 回收站里的账本，对应后端 BookTrashResp */
export interface BookTrash {
  id: number
  name: string
  /** yyyy-MM-dd HH:mm:ss */
  deletedAt: string
  /** 彻底删除时刻 = deletedAt + 15 天 */
  expireAt: string
}

/**
 * 注册请求体，对应后端 RegisterReq。没有 bookType——项目只有班级账本一种，
 * 注册成功即建账本 + 预置 13 条分类（后端事务内完成）。
 */
export interface RegisterReq {
  /** 显示名（不是登录凭据）：4–20 位字母/数字/下划线，区分大小写 */
  username: string
  /** 6–32 位明文，后端 BCrypt 加密后落库 */
  password: string
  /** 登录凭据：必填且唯一 */
  email: string
  /** 可空，后端默认「班级账本」 */
  bookName?: string | null
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

/** 收支方向。后端用 String 存，只有这两个值 */
export type TxType = 'income' | 'expense'

/** 分类。icon / color 是语义 key，由前端映射成图标组件与颜色（后端不管长什么样） */
export interface Category {
  id: number
  name: string
  type: TxType
  icon: string | null
  color: string | null
  sortOrder: number
}

/** 新增 / 修改分类的请求体，对应后端 CategoryReq */
export interface CategoryReq {
  name: string
  type: TxType
  icon?: string | null
  color?: string | null
}

/**
 * 流水。列表直接带 categoryName/Icon/Color，前端不做二次查询（PLAN §5.0 第 5 条）。
 * amount 是**字符串**（后端 BigDecimal 全局按字符串序列化）：不要 parseFloat 后累加，
 * 要算就交给后端，或者至少用整数分。
 */
export interface Transaction {
  id: number
  type: TxType
  amount: string
  /** yyyy-MM-dd */
  transDate: string
  note: string | null
  categoryId: number
  categoryName: string
  categoryIcon: string | null
  categoryColor: string | null
}

/** 新增 / 修改流水的请求体，对应后端 TransactionReq */
export interface TransactionReq {
  categoryId: number
  type: TxType
  /** 字符串传也行（如 '12.50'），后端按 BigDecimal 解析 */
  amount: string
  /** yyyy-MM-dd */
  transDate: string
  note?: string | null
}

/** 流水列表查询条件，字段名与后端 TransactionQuery 逐字一致（page 从 1 开始） */
export interface TransactionQuery {
  page?: number
  size?: number
  type?: TxType
  categoryId?: number
  startDate?: string
  endDate?: string
  keyword?: string
}

/** 月度统计，对应后端 SummaryResp。month 是后端回显的实际统计月份（不传时是当月） */
export interface Summary {
  /** yyyy-MM */
  month: string
  income: string
  expense: string
  /** 本月收支差，不是累计余额 */
  balance: string
  /** 全账本累计余额 */
  totalBalance: string
}

/** 分类占比。percent 是两位小数字符串，各项相加可能不等于 100.00，只做展示 */
export interface CategoryStat {
  categoryId: number
  categoryName: string
  categoryIcon: string | null
  categoryColor: string | null
  amount: string
  percent: string
}

/** 公示页的流水行：比普通列表多一个 balanceAfter（全账本范围内的逐行结余），且没有 id */
export interface ReportTransaction {
  transDate: string
  type: TxType
  amount: string
  note: string | null
  categoryName: string
  categoryIcon: string | null
  categoryColor: string | null
  balanceAfter: string
}

/** 免登录公示页 GET /api/public/report/{shareToken}，不含任何个人信息 */
export interface PublicReport {
  bookName: string
  /** yyyy-MM */
  month: string
  income: string
  expense: string
  balance: string
  totalBalance: string
  /** 支出分类占比（金额降序） */
  expenseCategories: CategoryStat[]
  /** 收入分类占比（金额降序）——公示页也要能看「钱从哪来」 */
  incomeCategories: CategoryStat[]
  /** 按日期升序，逐行结余从上往下读 */
  transactions: ReportTransaction[]
}