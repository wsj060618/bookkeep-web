# bookkeep-web

记账本前端。Vue 3 + TypeScript + Vite + Element Plus + Pinia + vue-router + axios。

当前进度：**第 0 步**——只有登录页和一个「验证 token 通不通」的首页。
按 `D:\coding\bookkeep-server\PLAN.md` §6.1 的节奏，页面随后端模块一起长出来：

| 阶段 | 后端 | 前端 |
|---|---|---|
| 第 0 步 | P1 认证（已完成） | 登录页 ← 现在在这 |
| 1 | P2 分类 + 流水 | 流水列表 + 记一笔 |
| 2 | P3 统计 | 统计图表 |
| 3 | P4 账本 + 预算 | 账本切换 + 预算页 |
| 4 | P5 AI 分析 | 分析页 |

## 启动

前置：后端跑在 `http://localhost:8080`（`D:\coding\bookkeep-server`，需要 `DB_USER` / `DB_PWD` 环境变量）。

```powershell
cd D:\coding\bookkeep-web
npm install          # 第一次，或 package.json 变了
npm run dev          # http://localhost:5173
```

其它命令：

```powershell
npm run build        # vue-tsc 类型检查 + 打包（类型错误会在这里失败，不是运行时）
npm run preview      # 预览 dist 产物
```

数据库里还没有账号时，用后端仓库的 `http/auth.http` 第 1 个请求注册一个，再回来登录。

## 第 0 步验收（按可观察行为验收，不看「页面能打开」）

1. 打开 `http://localhost:5173/` → 未登录被重定向到 `/login`
2. 输错密码 → 提示「用户名或密码错误」，按钮从 loading 恢复，页面不跳转
3. 正确登录 → 提示「欢迎回来，xxx」→ 跳到首页，显示昵称 / 用户名 / currentBookId
4. **刷新首页（F5）** → 昵称还在（说明 token 存在 localStorage，`/api/auth/me` 带上了 `Authorization: Bearer`）
5. 浏览器 DevTools → Application → Local Storage 删掉 `bookkeep_token`，再刷新 → 回到登录页
6. 手动把 `bookkeep_token` 改成乱码再刷新 → 后端 401 → 提示后回到登录页（`/me` 返回真实 HTTP 401）
7. Network 面板确认：登录只发**一次** `/api/auth/login`；连点登录按钮不会发第二次（按钮单飞）

## 一个请求是怎么走的

```
LoginView.vue      表单校验 + 单飞标志 submitting
  → stores/auth.ts   login()：调接口、存 token、存 user
    → api/auth.ts    login()：只负责 URL 和类型
      → api/request.ts  axios 实例：请求头加 Bearer；响应统一判 code / status
        → /api/auth/login  （Vite 代理到 http://localhost:8080）
```

加新接口时只动 `src/api/*.ts`（+ `src/types/api.ts` 补字段），视图层不出现 URL 字符串。

## 约定（来自后端 PLAN §5.0，改前端时必须遵守）

1. 信封 `{code, message, data}`；分页 `data = {total, list}`，入参 `page`（从 1 开始）/ `size`
2. 金额一律**字符串**（后端 `BigDecimal` 按字符串序列化），前端不要 `parseFloat` 后累加，展示直接用字符串
3. 日期 `yyyy-MM-dd`，月份 `yyyy-MM`，不传时间戳
4. 错误只看 `code`：`code !== 200` 提示 `message`；`code === 401` 清 token 跳登录；真实 HTTP 401/403 同理
   （后端策略：业务错误 HTTP 200 + body.code，只有认证/授权失败用真实 401/403）
5. 列表必须自带展示用名称（`categoryName` 等），前端不做二次查询

## TypeScript 速查（零基础看这一节就够用）

TS = JS + **类型标注**。类型只在写代码/编译时存在，`npm run build` 时被擦掉，产物还是普通 JS。
它的唯一价值：把「字段名写错、类型对不上、少判 null」从**运行时**提前到**编译时**。

| 概念 | 本项目里的例子 | 说明 |
|---|---|---|
| 类型标注 | `const submitting = ref(false)` / `function login(username: string, password: string): Promise<LoginResp>` | 冒号后面是类型；`Promise<T>` 表示异步返回 `T` |
| interface | `src/types/api.ts` 的 `User` / `LoginResp` | 描述对象有哪些字段、什么类型，对应后端 DTO |
| 泛型 | `ApiResult<T>`、`get<T>(url)` | `T` 是占位符：`get<User>('/auth/me')` 得到的类型就是 `User` |
| 联合类型 | `string \| null`（`User.nickname`）、`'personal' \| 'merchant'`（`BookType`） | 「要么是 A 要么是 B」；只有 `'personal'`/`'merchant'` 两个合法值 |
| 类型收窄 | `HomeView.vue` 里 `v-if="auth.user"` | 判断过后 TS 才知道 `auth.user` 不是 null，才能 `.nickname` |
| `!` 断言 | `formRef.value!`（本仓库没用，改用 `if (!formRef.value) return`） | 「我保证不是 null」，滥用会掩盖 bug，优先用 if 判断 |
| `?` 可选 | `error.response?.status` | 可能不存在，不存在就返回 `undefined`，而不是抛异常 |
| `type` vs `interface` | `type BookType = ...`，`interface User { ... }` | 项目里：给对象定型用 `interface`，给别名/联合用 `type` |
| 声明合并 | `router/index.ts` 的 `declare module 'vue-router'` | 给第三方库的类型补字段，运行时没有对应代码 |
| 严格模式带来的约束 | `noUnusedLocals` / `erasableSyntaxOnly` | 未使用的变量会让 build 失败；不能用 `enum`（请用字面量联合 `type`） |

几条习惯：

- **不要 `any`**。写不出类型时先 `console.log` 看真实返回，再补到 `src/types/api.ts` 里
- `ref<T>(初始值)` 的 `T` 尽量写全，比如 `ref<FormInstance>()`；不写 TS 会猜成 `null` 就再也赋不了值
- 后端改了 DTO，**先改 `src/types/api.ts`**，让编译错误告诉你哪些页面要跟着改
- 遇到 `Property 'xxx' does not exist on type 'Yyy'`：八成是后端字段名和 `types/api.ts` 不一致

## 已知取舍

- Element Plus 全量引入（`main.ts`），首屏 JS ≈ 1 MB（gzip 330 KB）。项目演示阶段不值得为按需引入增加配置；
  真要优化再加 `unplugin-vue-components` 或 `unplugin-element-plus`
- token 存 localStorage：能扛刷新，但 XSS 可窃取。生产环境若要更稳，可换 httpOnly Cookie + CSRF
- 401 时用 `window.location.assign('/login')` 整页跳转（避免 `router → views → api → request` 的循环依赖），
  代价是丢掉「登录后回到原页面」的体验，等页面多了再改成事件订阅