# bookkeep-web
![Vue 3](https://img.shields.io/badge/Vue-3-42B883?logo=vuedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Element Plus](https://img.shields.io/badge/Element_Plus-2-409EFF)
![Pinia](https://img.shields.io/badge/Pinia-4-FFD859)
![vue-router](https://img.shields.io/badge/vue--router-4-209A55)
![Axios](https://img.shields.io/badge/Axios-1-5A29E4?logo=axios&logoColor=white)
![ECharts](https://img.shields.io/badge/ECharts-6-AA344D)
![Vitest](https://img.shields.io/badge/Vitest-5-6E9F18?logo=vitest&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

后端仓库: https://github.com/wsj060618/bookkeep-server.git

## 页面

| 路由 | 页面 | 说明 |
|---|---|---|
| `/login` `/register` | 登录 / 注册 | 注册两步：账号 → 账本名，成功后自动登录 |
| `/forgot-password` `/reset-password` | 找回 / 重置密码 | 邮件里的一次性 token |
| `/transactions` | 流水（默认首页） | 筛选、分页、导出、记一笔、票据图集 |
| `/stats` | 收支统计 | 月度汇总、分类占比、收支对比 |
| `/books` | 账本 | 新建 / 改名 / 切换 / 归档 / 回收站 |
| `/categories` | 分类模板 | 账号级模板，改一条存一条 |
| `/settings` | 账号设置 | 资料、改密码、注销 |
| `/report/:token` | 公示页 | 免登录只读，可看票据 |

登录后的页面统一套 `AppLayout`（桌面左侧竖栏，手机抽屉导航），「记一笔」「分享」两个弹窗挂在 layout 上共用。


## 项目结构

```
bookkeep-web/
├── index.html
├── vite.config.ts              dev server、/api 代理到 127.0.0.1:8080、Vitest 配置（happy-dom）
└── src/
    ├── main.ts                 挂载应用、注册 Element Plus / Pinia / router
    ├── App.vue
    ├── style.css               全局样式与主题变量
    ├── api/                    出网口：视图层不出现 URL 字符串
    │   ├── request.ts          唯一 axios 实例：带 token、判 code、401 跳登录、blob 下载
    │   ├── auth.ts book.ts category.ts template.ts transaction.ts
    │   ├── statistic.ts receipt.ts user.ts public.ts
    ├── components/             可复用组件
    │   ├── TxItem.vue              一条流水（列表行）
    │   ├── TransactionFormDialog.vue 记一笔 / 改流水（含分类现建、票据）
    │   ├── ReceiptGalleryDialog.vue  票据图集（管理端读写 / 公示页只读）
    │   ├── CategoryFormDialog.vue    分类表单（名称 + 图标 + 颜色）
    │   ├── TemplateFormDialog.vue    新建模板
    │   └── CategoryChart.vue CategoryChartCard.vue CompareChart.vue  图表
    ├── composables/
    │   ├── shell.ts            layout 向子页面提供的分类缓存、数据版本号、开弹窗
    │   └── useIsMobile.ts      响应式断点
    ├── layouts/AppLayout.vue   侧边栏 + 顶栏 + 记一笔/分享弹窗 + 404
    ├── router/index.ts         路由与登录守卫
    ├── stores/auth.ts          Pinia：token、用户、账本列表
    ├── types/api.ts            与后端 DTO 一一对应的类型（唯一类型来源）
    ├── utils/
    │   ├── validate.ts         邮箱 / 密码 / 金额 / 用户名规则（与后端同一条）
    │   ├── category.ts         图标与颜色的语义 key → emoji / 色值
    │   ├── receipt.ts          票据大小、张数、默认标题
    │   └── token.ts            localStorage 读写
    └── views/                  10 个页面（见上表）
```

## 与后端的约定

1. 响应统一 `{code, message, data}`；业务错误是 **HTTP 200 + `body.code`**，只有认证/授权失败用真实 401/403。
   所以 `request.ts` 成功回调看 `code`、失败回调看 `status`。
2. 金额是**字符串**（后端 `BigDecimal` 按字符串序列化），不要 `parseFloat` 后累加。
3. 前端从不传 `bookId`：后端按 `user.current_book_id` 推导。
4. 下载类接口成功是文件流、失败是 JSON：`request.ts` 里有独立的 `httpFile` 实例，按 `content-type` 分流。
5. 图片走 blob（登录态接口不能用 `<img src>`）——所以 nginx 的 CSP `img-src` 必须含 `blob:`。

改后端 DTO 时先改 `src/types/api.ts`，让编译错误告诉你哪些页面要跟着改。

## 开发

```powershell
npm install
npm run dev        # http://localhost:5173，/api 代理到 127.0.0.1:8080
```

后端要先跑起来（`bookkeep-server`，需要 `DB_USER` / `DB_PWD`）。
数据库里没账号就直接开 `/register`。

## 构建与测试

```powershell
npm run test       # Vitest（组件 + api 层单测）
npm run build      # vue-tsc 类型检查 + 打包 → dist/
npm run preview    # 本地预览 dist
```

`build` 会做全量类型检查，类型错误在这一步失败，不会拖到运行时。

## 部署

只把 `dist/` 交给 nginx（本地单机部署或云端 compose 都是只读挂载）：

- 本机：`robocopy dist D:\coding\bookkeep-server\deploy\web`
- 云端：覆盖 `/opt/bookkeep-server/bookkeep-web/dist`，不用重启容器

完整步骤见后端仓库的 `docs/部署文档.md`。

## 已知取舍

- Element Plus 全量引入，首屏 JS ≈1MB（gzip 330KB）；演示阶段不为按需加载增加配置
- token 存 localStorage：能扛刷新，但 XSS 可窃取；要更稳得换 httpOnly Cookie
- 局域网 http 不是安全上下文，`navigator.clipboard` 不可用，分享弹窗的复制会退回 `execCommand('copy')`

## License

MIT © 2026 wsj060618 — 见 [LICENSE](LICENSE)。