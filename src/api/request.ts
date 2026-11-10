import axios, { type AxiosError, type AxiosInstance } from 'axios'
import { ElMessage } from 'element-plus'
import type { ApiResult } from '../types/api'
import { clearToken, getToken } from '../utils/token'

/**
 * 全项目唯一的 HTTP 客户端。业务代码不直接用 axios，只用下面导出的 get / post。
 *
 * 这里落实了 PLAN §5 的后端错误策略，必须两边对齐：
 *   1. 业务错误  → HTTP 200 + body.code（400/401/403 都可能出现在 200 里）
 *   2. 认证/授权 → 真实 HTTP 401 / 403
 * 所以拦截器要处理**两条**路径：成功回调里看 code，失败回调里看 status。
 *
 * 为什么不在这里 import router 做跳转：router → views → api → request 会形成循环依赖，
 * 模块初始化时容易拿到 undefined。用整页跳转最省事，顺带把内存状态全部清干净。
 */

const http: AxiosInstance = axios.create({
  baseURL: '/api', // 生产/开发都同源，见 vite.config.ts 的 proxy
  timeout: 10_000,
})

// ---------- 请求拦截器：带上 token ----------
http.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ---------- 响应拦截器：统一处理错误 ----------
http.interceptors.response.use(
  // 走到了这里说明 HTTP 状态是 2xx，业务结果还得看 body.code
  (response) => {
    const body = response.data as ApiResult<unknown>
    if (body.code === 200) {
      return response
    }
    if (body.code === 401) {
      // 例：用户已注销，token 本身合法但库里查不到人 → 后端返回 200 + code=401
      toLogin('登录状态已失效，请重新登录')
    } else {
      ElMessage.error(body.message || '请求失败')
    }
    return Promise.reject(new Error(body.message || '请求失败'))
  },
  // HTTP 状态不是 2xx：401/403 由后端的两个处理器输出，网络错误则没有 response
  (error: AxiosError<ApiResult<unknown>>) => {
    const status = error.response?.status
    const message = error.response?.data?.message

    if (status === 401) {
      toLogin(message || '未登录或登录状态已失效')
    } else if (status === 403) {
      ElMessage.error(message || '无权访问')
    } else if (status) {
      ElMessage.error(message || `请求失败（HTTP ${status}）`)
    } else {
      ElMessage.error('网络异常，请检查后端是否已启动')
    }
    return Promise.reject(error)
  },
)

/**
 * 清 token 并跳登录页。
 * 已经在登录页就不再提示/跳转，否则「密码错误」会被两套提示覆盖。
 */
function toLogin(message: string): void {
  clearToken()
  if (window.location.pathname !== '/login') {
    ElMessage.error(message)
    window.location.assign('/login')
  }
}

// ---------- 类型安全的薄封装：直接拿到 data，不用每次 .data.data ----------

export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const response = await http.get<ApiResult<T>>(url, { params })
  return response.data.data
}

export async function post<T>(url: string, body?: unknown): Promise<T> {
  const response = await http.post<ApiResult<T>>(url, body)
  return response.data.data
}

/**
 * multipart 上传（流水导入）。
 * <p>不设 Content-Type：浏览器会自动带上带 boundary 的 multipart/form-data，
 * 手写反而会把 boundary 写丢。导入解析比普通请求慢，超时放宽到 60s。
 */
export async function postForm<T>(url: string, form: FormData): Promise<T> {
  const response = await http.post<ApiResult<T>>(url, form, { timeout: 60_000 })
  return response.data.data
}

export async function put<T>(url: string, body?: unknown): Promise<T> {
  const response = await http.put<ApiResult<T>>(url, body)
  return response.data.data
}

export async function del<T>(url: string, body?: unknown): Promise<T> {
  // DELETE 也能带请求体（axios 用 config.data 传），注销账户需要它
  const response = await http.delete<ApiResult<T>>(url, body === undefined ? undefined : { data: body })
  return response.data.data
}

// ---------- 文件下载 ----------
// 导出成功时返回 text/csv（不是 JSON 信封），而失败仍是 200 + JSON，
// 所以不能复用上面的实例——那里按 body.code 判断，blob 上根本没有 code。

const httpFile: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 30_000,
  responseType: 'blob',
})

httpFile.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

httpFile.interceptors.response.use(
  (response) => response,
  (error: AxiosError<Blob>) => {
    void handleFileError(error)
    return Promise.reject(error)
  },
)

async function handleFileError(error: AxiosError<Blob>): Promise<void> {
  const status = error.response?.status
  const message = await blobMessage(error.response?.data)
  if (status === 401) {
    toLogin(message || '未登录或登录状态已失效')
    return
  }
  ElMessage.error(message || (status ? `下载失败（HTTP ${status}）` : '网络异常，请检查后端是否已启动'))
}

/** 下载失败时后端返回的是 JSON，但 responseType=blob 拿到的是 Blob，得读出来才知道 message */
async function blobMessage(data: unknown): Promise<string | undefined> {
  if (!(data instanceof Blob)) {
    return (data as ApiResult<unknown> | undefined)?.message
  }
  try {
    const body = JSON.parse(await data.text()) as ApiResult<unknown>
    return body.message
  } catch {
    return undefined
  }
}

export interface DownloadFile {
  blob: Blob
  filename: string
}

export async function getFile(url: string, params?: Record<string, unknown>): Promise<DownloadFile> {
  const response = await httpFile.get<Blob>(url, { params })
  const contentType = String(response.headers['content-type'] ?? '')

  // 参数错误（如日期区间颠倒）是 HTTP 200 + JSON 信封：这里不分支就会把 JSON 存成 .csv
  if (contentType.includes('application/json')) {
    const body = JSON.parse(await response.data.text()) as ApiResult<unknown>
    if (body.code === 401) {
      toLogin(body.message || '登录状态已失效，请重新登录')
    } else {
      ElMessage.error(body.message || '导出失败')
    }
    throw new Error(body.message || '导出失败')
  }

  return {
    blob: response.data,
    filename: filenameOf(response.headers['content-disposition'], '导出.csv'),
  }
}

/** 后端用 ContentDisposition attachment，中文名是 filename*=UTF-8''... 形式 */
function filenameOf(disposition: string | undefined, fallback: string): string {
  if (!disposition) return fallback
  const extended = /filename\*=UTF-8''([^;]+)/i.exec(disposition)
  if (extended) return decodeURIComponent(extended[1])
  const plain = /filename="?([^";]+)"?/i.exec(disposition)
  return plain ? plain[1] : fallback
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // 立即释放会让部分浏览器取消下载，等一拍再回收
  setTimeout(() => URL.revokeObjectURL(url), 0)
}