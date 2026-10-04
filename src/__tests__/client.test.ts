import { beforeEach, describe, expect, it, vi } from 'vitest'

const storage = new Map<string, string>()
vi.stubGlobal('sessionStorage', { getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } })

const { ApiError, errorMessage, headersFor, parseError, request, unwrap } = await import('@/api/client')
const { session } = await import('@/stores/session')
const { api } = await import('@/api')

beforeEach(() => { storage.clear(); session.setBearer(''); session.setAdmin(''); vi.unstubAllGlobals(); vi.stubGlobal('sessionStorage', { getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) }); vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } }) })

describe('两种响应格式', () => {
  it('直接返回旧接口对象并处理 204 空响应', () => { expect(unwrap(200, { model_id: 'm1' }, false)).toEqual({ model_id: 'm1' }); expect(unwrap(204, undefined, false)).toBeUndefined() })
  it('只取 v1 data，失败保留 trace_id', () => {
    expect(unwrap(200, { code: 0, message: 'success', data: [1], trace_id: 't', timestamp: '' }, true)).toEqual([1])
    expect(() => unwrap(422, { code: 422, message: '请求参数无效', data: null, trace_id: 'trace-1' }, true)).toThrow(ApiError)
    expect(errorMessage(parseError(422, { message: '请求参数无效', trace_id: 'trace-1' }, true))).toContain('trace-1')
  })
  it('解释旧接口 422 数组与两种凭据错误', () => {
    expect(parseError(422, { detail: [{ loc: ['body', 'token'], msg: 'too short' }] }, false).message).toContain('token')
    expect(parseError(401, { detail: { code: 'invalid_token' } }, false).message).toContain('重新输入')
    expect(parseError(403, { detail: { code: 'invalid_setup_secret' } }, false).message).toContain('管理员密钥')
  })
})

it('三类建单只发送现有路径和限定请求体', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ code: 0, message: 'success', data: { id: 'task-1', status: 'pending' }, trace_id: 't', timestamp: '' }) })
  vi.stubGlobal('fetch', fetchMock)
  const input = { dataset_id: 7, version_id: 'v2', language: 'zh', scheme_id: 'risk-v1' }
  await api.createTask({ kind: 'governance-risk', name: '验证', input })
  const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit]
  expect(url.pathname).toBe('/api/v1/data-governance/risk-tasks')
  expect(JSON.parse(String(options.body))).toEqual({ kind: 'governance-risk', name: '验证', input })
})

it('业务用户查询只请求模型服务的管理员接口，分页与关键词正确', async () => {
  session.setBearer('model-token')
  session.setAdmin('admin-secret')
  const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ code: 0, message: 'success', data: { items: [], total: 0, page: 2, page_size: 20, total_pages: 0 }, trace_id: 't', timestamp: '' }) })
  vi.stubGlobal('fetch', fetchMock)
  await api.businessUsers({ page: 2, page_size: 20, keyword: '张' })
  const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit]
  expect(url.pathname).toBe('/api/v1/admin/business-users')
  expect(Object.fromEntries(url.searchParams)).toEqual({ page: '2', page_size: '20', keyword: '张' })
  const headers = options.headers as Headers
  expect(headers.get('X-Setup-Secret')).toBe('admin-secret')
  expect(headers.has('Authorization')).toBe(false)
})

it('单枚令牌按 ID 启停，只发送管理员密钥和 enabled', async () => {
  session.setBearer('model-token')
  session.setAdmin('admin-secret')
  const token = { id: 'token-1', label: '测试', created_at: '', expires_at: '', enabled: false }
  const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ code: 0, message: 'success', data: token, trace_id: 't', timestamp: '' }) })
  vi.stubGlobal('fetch', fetchMock)
  await expect(api.tokenStatusById('token-1', false)).resolves.toEqual(token)
  const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit]
  expect(url.pathname).toBe('/api/v1/admin/tokens/token-1/status')
  expect(options.method).toBe('PATCH')
  expect(JSON.parse(String(options.body))).toEqual({ enabled: false })
  const headers = options.headers as Headers
  expect(headers.get('X-Setup-Secret')).toBe('admin-secret')
  expect(headers.has('Authorization')).toBe(false)
})

it('按 ID 删除令牌，只发送管理员密钥并读取 v1 data', async () => {
  session.setBearer('model-token')
  session.setAdmin('admin-secret')
  const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ code: 0, message: 'success', data: { id: 'token-1', deleted: true }, trace_id: 't', timestamp: '' }) })
  vi.stubGlobal('fetch', fetchMock)
  await expect(api.deleteToken('token-1')).resolves.toEqual({ id: 'token-1', deleted: true })
  const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit]
  expect(url.pathname).toBe('/api/v1/admin/tokens/token-1')
  expect(options.method).toBe('DELETE')
  expect(options.body).toBeUndefined()
  const headers = options.headers as Headers
  expect(headers.get('X-Setup-Secret')).toBe('admin-secret')
  expect(headers.has('Authorization')).toBe(false)
})

it('管理员与 Bearer 请求头互不混用', () => {
  session.setBearer('bearer-value'); session.setAdmin('admin-value')
  expect(headersFor('bearer', undefined).get('Authorization')).toBe('Bearer bearer-value')
  expect(headersFor('bearer', undefined).has('X-Setup-Secret')).toBe(false)
  expect(headersFor('admin', {}).get('X-Setup-Secret')).toBe('admin-value')
  expect(headersFor('admin', {}).has('Authorization')).toBe(false)
})

it('请求 URL 和方法按现有接口发送，DELETE 204 不解析 JSON', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ status: 204, json: vi.fn() })
  vi.stubGlobal('fetch', fetchMock)
  await expect(request('/api/models/m1', { method: 'DELETE' })).resolves.toBeUndefined()
  expect(fetchMock).toHaveBeenCalledWith(new URL('http://localhost:5173/api/models/m1'), expect.objectContaining({ method: 'DELETE' }))
})
