import { session } from '@/stores/session'
import type { Credential } from '@/types/api'

type Envelope<T> = { code: number; message: string; data: T; trace_id: string; timestamp: string }
type RequestOptions = { method?: string; body?: unknown; credential?: Credential; v1?: boolean; params?: Record<string, string | number | string[] | undefined> }

export class ApiError extends Error {
  constructor(public status: number, message: string, public traceId?: string, public data?: unknown) { super(message) }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.traceId ? `${error.message}（追踪 ID：${error.traceId}）` : error.message
  return error instanceof Error ? error.message : '请求失败'
}

export function parseError(status: number, value: unknown, v1: boolean): ApiError {
  const body = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  if (v1) {
    const message = typeof body.message === 'string' ? body.message : `请求失败（HTTP ${status}）`
    const trace = typeof body.trace_id === 'string' ? body.trace_id : undefined
    return new ApiError(status, status === 401 ? '访问令牌已失效，请重新输入' : status === 403 ? '管理员密钥错误，请重新输入' : message, trace, body.data)
  }
  const detail = body.detail
  const info = detail && typeof detail === 'object' && !Array.isArray(detail) ? detail as Record<string, unknown> : {}
  const validation = Array.isArray(detail) ? detail.map(item => {
    const row = item as { loc?: unknown[]; msg?: string }
    return `${row.loc?.slice(1).join('.') || '字段'}：${row.msg || '无效'}`
  }).join('；') : ''
  const message = status === 401 ? '访问令牌已失效，请重新输入' : status === 403 && info.code === 'invalid_setup_secret' ? '管理员密钥错误，请重新输入' : validation || String(info.message || info.code || `请求失败（HTTP ${status}）`)
  return new ApiError(status, message)
}

export function unwrap<T>(status: number, value: unknown, v1: boolean): T {
  if (status === 204) return undefined as T
  if (status < 200 || status >= 300) throw parseError(status, value, v1)
  if (!v1) return value as T
  const envelope = value as Envelope<T>
  if (!envelope || envelope.code !== 0) throw parseError(status, value, true)
  return envelope.data
}

export function headersFor(credential: Credential, body: unknown): Headers {
  const headers = new Headers()
  if (body !== undefined) headers.set('Content-Type', 'application/json')
  if ((credential === 'bearer' || credential === 'both') && session.bearer.value) headers.set('Authorization', `Bearer ${session.bearer.value}`)
  if ((credential === 'admin' || credential === 'both') && session.admin.value) headers.set('X-Setup-Secret', session.admin.value)
  return headers
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
  const url = new URL(`${base}${path}`, window.location.origin)
  for (const [key, value] of Object.entries(options.params || {})) {
    if (Array.isArray(value)) value.forEach(item => url.searchParams.append(key, item))
    else if (value !== undefined) url.searchParams.set(key, String(value))
  }
  let response: Response
  try {
    response = await fetch(url, { method: options.method || 'GET', headers: headersFor(options.credential || 'bearer', options.body), body: options.body === undefined ? undefined : JSON.stringify(options.body) })
  } catch {
    throw new ApiError(0, '无法连接 API，请检查服务地址与代理配置')
  }
  return response
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options)
  const value = response.status === 204 ? undefined : await response.json().catch(() => undefined)
  return unwrap<T>(response.status, value, options.v1 ?? path.startsWith('/api/v1/'))
}

export async function requestFile(path: string): Promise<Blob> {
  const response = await send(path, {})
  if (!response.ok) throw parseError(response.status, await response.json().catch(() => undefined), true)
  return response.blob()
}
