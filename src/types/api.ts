/**
 * 后端接口的数据形状。字段名必须和 Java DTO 一致，类型对不上 build 就会报错。
 */

/** 统一信封，T 是 data 的类型 */
export interface ApiResult<T> {
  code: number
  message: string
  data: T
}

/** 分页：字段固定 total / list，入参 page / size */
export interface PageResult<T> {
  total: number
  list: T[]
}

export interface User {
  id: number
  username: string
  email: string
  avatar: string | null
  currentBookId: number | null
}

export type BookType = 'class'

export interface Book {
  id: number
  name: string
  type: BookType
  /** 分类来自哪套模板；null = 老数据 */
  categoryTemplateId: number | null
  /** 学期截止日期，只做展示 */
  semesterEnd: string | null
  /** 归档 = 只读 */
  archived: boolean
  current: boolean
}

/** 模板条目；id 是 category_template_item.id，内置投影为 null */
export interface CategoryTemplateItem {
  id: number | null
  name: string
  type: TxType
  icon: string | null
  color: string | null
  sortOrder: number
}

/** 分类模板：账号级，新建账本时选一套预置；id=0 是「一套都没有」时的只读兜底 */
export interface CategoryTemplate {
  id: number
  name: string
  builtin: boolean
  items: CategoryTemplateItem[]
}

/** 提交条目时不带 sortOrder（后端按顺序编号）；已存在的条目必须带 id，否则会被当成删旧建新 */
export type TemplateItemInput = Pick<CategoryTemplateItem, 'name' | 'type' | 'icon' | 'color'> & {
  id?: number | null
}

/** 模板条目的 JSON 表示（导出文件里的一条；没有 id，跨账号导入时 id 没有意义） */
export interface TemplateDocItem {
  name: string
  type: TxType
  icon: string | null
  color: string | null
  sortOrder: number | null
}

/** 分类模板的 JSON 文档：模板导出/导入的文件格式，也是账本包里的「分类模板.json」 */
export interface TemplateDoc {
  version: number
  name: string
  items: TemplateDocItem[]
}

/** 单本分享的响应 */
export interface ShareLink {
  token: string
  /** 分享时刻 + 3 天 */
  expiresAt: string
}

/** 一条链接可包含多本账本；每次分享都换新 token */
export interface ShareLinkCreated {
  token: string
  expiresAt: string
  books: { id: number; name: string }[]
}

/** 找回密码总是返回成功（不暴露邮箱是否注册过） */
export interface ForgotPasswordReq {
  email: string
}

/** 邮件里的一次性 token，15 分钟有效 */
export interface ResetPasswordReq {
  token: string
  /** 6–32 位 */
  newPassword: string
}

/** 改用户名 / 登录邮箱；改邮箱时必须带当前密码 */
export interface UserUpdateReq {
  username: string
  email: string
  /** 仅当 email 变化时必填 */
  password?: string
}

/** 改密码；成功后旧 token 全部失效 */
export interface PasswordUpdateReq {
  oldPassword: string
  /** 6–32 位 */
  newPassword: string
}

export interface AccountDeleteReq {
  password: string
}

/** 改名 + 可选改学期截止日期 */
export interface BookUpdateReq {
  name: string
  /** 省略 = 不改（不是清空） */
  semesterEnd?: string | null
}

/** 新建账本；templateId 为空时用内置预设 */
export interface BookCreateReq {
  name: string
  templateId?: number | null
  semesterEnd?: string | null
}

/** 回收站里的账本，保留 15 天 */
export interface BookTrash {
  id: number
  name: string
  deletedAt: string
  /** deletedAt + 15 天 */
  expireAt: string
}

/** 注册即建账本；只有班级账本一种，所以没有 bookType */
export interface RegisterReq {
  /** 显示名（不是登录凭据），≤20 字 */
  username: string
  /** 6–32 位，后端 BCrypt 加密 */
  password: string
  /** 登录凭据，必填且唯一 */
  email: string
  /** 可空，默认「班级账本」 */
  bookName?: string | null
}

/** books 和 user 平级，不是 user.books */
export interface LoginResp {
  token: string
  user: User
  books: Book[]
}

export type TxType = 'income' | 'expense'

/** 分类；icon / color 是语义 key，由前端映射 */
export interface Category {
  id: number
  name: string
  type: TxType
  icon: string | null
  color: string | null
  sortOrder: number
}

export interface CategoryReq {
  name: string
  type: TxType
  icon?: string | null
  color?: string | null
}

/** 流水；列表自带分类名，amount 是字符串（别 parseFloat 累加） */
export interface Transaction {
  id: number
  type: TxType
  amount: string
  transDate: string
  note: string | null
  categoryId: number
  categoryName: string
  categoryIcon: string | null
  categoryColor: string | null
  /** 票据张数（徽标） */
  receiptCount: number
}

export interface Receipt {
  id: number
  title: string
  originalName: string | null
  sizeBytes: number
  createdAt: string
}

/** 公示页的票据只有 id 和标题 */
export interface PublicReceipt {
  id: number
  title: string
}

export interface TransactionReq {
  categoryId: number
  type: TxType
  /** 字符串金额，如 '12.50' */
  amount: string
  transDate: string
  note?: string | null
}

/** 查询条件，字段名与后端 TransactionQuery 一致（page 从 1 开始） */
export interface TransactionQuery {
  page?: number
  size?: number
  type?: TxType
  categoryId?: number
  startDate?: string
  endDate?: string
  keyword?: string
}

/** 区间统计；startDate / endDate 为 null 表示该端不限（都不传 = 全部时间） */
export interface Summary {
  /** yyyy-MM-dd */
  startDate: string | null
  /** yyyy-MM-dd */
  endDate: string | null
  income: string
  expense: string
  /** 区间末（结束日当天）的账户余额；结束日不限时 = 当前余额 */
  balance: string
}

/** percent 是两位小数字符串，相加不一定 100.00 */
export interface CategoryStat {
  categoryId: number
  categoryName: string
  categoryIcon: string | null
  categoryColor: string | null
  amount: string
  percent: string
}

/** 公示页的流水行：多一个 balanceAfter，没有 id */
export interface ReportTransaction {
  transDate: string
  type: TxType
  amount: string
  note: string | null
  categoryName: string
  categoryIcon: string | null
  categoryColor: string | null
  balanceAfter: string
  receiptCount: number
  receipts: PublicReceipt[]
}

/** 行级失败带行号（1 基，含表头）与原因 */
export interface ImportFailedRow {
  line: number
  reason: string
}

/** 文件里用到、账本还没有的分类；非空时后端一行都没导 */
export interface MissingCategory {
  name: string
  /** income / expense */
  type: 'income' | 'expense'
}

export interface ImportResult {
  success: number
  failed: ImportFailedRow[]
  missingCategories: MissingCategory[]
}

export interface ReceiptImportFailed {
  file: string
  reason: string
}

export interface ReceiptImportResult {
  success: number
  failed: ReceiptImportFailed[]
}

/** 账本包导入：流水与票据分开报 */
export interface ZipImportResult {
  success: number
  failed: ImportFailedRow[]
  receipts: ReceiptImportResult
  missingCategories: MissingCategory[]
}

/** 公示页里的一本账本 */
export interface PublicBookReport {
  bookId: number
  bookName: string
  /** yyyy-MM-dd；null = 该端不限（都不传 = 全部时间） */
  startDate: string | null
  /** yyyy-MM-dd；null = 该端不限 */
  endDate: string | null
  income: string
  expense: string
  /** 区间末（结束日当天）的账户余额；结束日不限时 = 当前余额 */
  balance: string
  expenseCategories: CategoryStat[]
  incomeCategories: CategoryStat[]
  /** 按日期升序 */
  transactions: ReportTransaction[]
}

/** 免登录公示页；一条链接可带多本账本 */
export interface PublicReport {
  /** yyyy-MM-dd HH:mm:ss */
  expiresAt: string
  books: PublicBookReport[]
}