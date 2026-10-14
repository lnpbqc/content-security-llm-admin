import { beforeEach, describe, expect, it, vi } from 'vitest'

const storage = new Map<string, string>()
vi.stubGlobal('sessionStorage', { getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } })

const { ApiError, errorMessage, headersFor, parseError, request, unwrap } = await import('@/api/client')
const { session } = await import('@/stores/session')
const { api } = await import('@/api')

beforeEach(() => { storage.clear(); session.setBearer(''); session.setAdmin(''); vi.unstubAllGlobals(); vi.stubGlobal('sessionStorage', { getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) }); vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } }) })

it('多语种六个接口使用 Bearer，语种查询发送重复键而非逗号字符串', async () => {
  session.setBearer('owner'); session.setAdmin('setup')
  const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ code: 0, data: null }) })
  vi.stubGlobal('fetch', fetchMock)
  const scope = { dataset_id: 3, version_id: 'v1', languages: ['zh', 'en'], analysis_mode: 'risk_tiering', scheme_id: 'multilingual-v1' } as const
  const input = { ...scope, languages: [...scope.languages] }
  await api.createMultilingual({ model_id: 'm1', input })
  await api.multilingualTask('task/1')
  await api.latestMultilingual(input)
  await api.multilingualHistory(input)
  await api.multilingualResult('result/1')
  await api.multilingualSamples('result/1', 2, 20)
  const calls = fetchMock.mock.calls as [URL, RequestInit][]
  expect(calls.map(([url]) => url.pathname)).toEqual([
    '/api/v1/analysis/ethnic-multilingual/tasks', '/api/v1/analysis/ethnic-multilingual/tasks/task%2F1',
    '/api/v1/analysis/ethnic-multilingual/results/latest', '/api/v1/analysis/ethnic-multilingual/results',
    '/api/v1/analysis/ethnic-multilingual/results/result%2F1', '/api/v1/analysis/ethnic-multilingual/results/result%2F1/samples',
  ])
  expect(calls[0]![1].method).toBe('POST')
  expect(JSON.parse(String(calls[0]![1].body))).toEqual({ model_id: 'm1', input })
  for (const index of [2, 3]) {
    expect(calls[index]![0].searchParams.getAll('languages')).toEqual(['zh', 'en'])
    expect(calls[index]![0].searchParams.has('model_id')).toBe(false)
  }
  expect(calls[5]![0].searchParams.get('page')).toBe('2')
  for (const [, options] of calls) {
    expect((options.headers as Headers).get('Authorization')).toBe('Bearer owner')
    expect((options.headers as Headers).has('X-Setup-Secret')).toBe(false)
  }
})

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

it('创建训练需要双凭据，后续查询与取消仅使用 Bearer', async () => {
  session.setBearer('training-owner'); session.setAdmin('training-admin')
  const fetchMock = vi.fn().mockResolvedValue({ status: 202, json: async () => ({ code: 0, data: { id: 'training-1', status: 'pending' } }) })
  vi.stubGlobal('fetch', fetchMock)
  await api.createTraining({ name: '训练', dataset_id: 1, version_id: 'v1', python_source: 'pass', contract: { inputs: { x: { dtype: 'float32', shape: [null, 2] } }, targets: { dtype: 'int64', shape: [null] }, outputs: { dtype: 'float32', shape: [null, 2] } } })
  await api.trainingTasks(2, 20)
  await api.cancelTraining('training-1')
  const calls = fetchMock.mock.calls as [URL, RequestInit][]
  expect((calls[0]![1].headers as Headers).get('Authorization')).toBe('Bearer training-owner')
  expect((calls[0]![1].headers as Headers).get('X-Setup-Secret')).toBe('training-admin')
  expect(calls[1]![0].searchParams.get('page')).toBe('2')
  expect((calls[1]![1].headers as Headers).has('X-Setup-Secret')).toBe(false)
  expect(calls[2]![0].pathname).toBe('/api/v1/training/tasks/training-1/cancel')
  expect(calls[2]![1].method).toBe('POST')
  expect((calls[2]![1].headers as Headers).has('X-Setup-Secret')).toBe(false)
})

it('登记脚本创建发送双凭据，目录和字节游标日志仅发送 Bearer', async () => {
  session.setBearer('owner'); session.setAdmin('setup')
  const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ code: 0, data: {} }) })
  vi.stubGlobal('fetch', fetchMock)
  await api.trainingScripts()
  const input = { name: '实验', script_id: 'cifar100-cnn', inputs: { download: false }, parameters: { epochs: 1 } }
  await api.createScriptTraining(input)
  await api.trainingLogs('t/1', 123, 1048576)
  const calls = fetchMock.mock.calls as [URL, RequestInit][]
  expect(calls[0]![0].pathname).toBe('/api/v1/training/scripts')
  expect((calls[0]![1].headers as Headers).has('X-Setup-Secret')).toBe(false)
  expect(calls[1]![0].pathname).toBe('/api/v1/training/script-tasks')
  expect(JSON.parse(String(calls[1]![1].body))).toEqual(input)
  expect((calls[1]![1].headers as Headers).get('X-Setup-Secret')).toBe('setup')
  expect(calls[2]![0].pathname).toBe('/api/v1/training/tasks/t%2F1/logs')
  expect(Object.fromEntries(calls[2]![0].searchParams)).toEqual({ after_offset: '123', limit: '1048576' })
  expect((calls[2]![1].headers as Headers).get('Authorization')).toBe('Bearer owner')
  expect((calls[2]![1].headers as Headers).has('X-Setup-Secret')).toBe(false)
})

it('模型写操作双凭据，模型查询只使用 Bearer', async () => {
  session.setBearer('owner'); session.setAdmin('setup')
  const fetchMock = vi.fn().mockResolvedValue({ status: 204 })
  vi.stubGlobal('fetch', fetchMock)
  await api.createModel({ name: '模型', upstream_model_id: 'm', base_url: 'http://localhost/v1', api_key: 'key' })
  await api.updateModel('m', { name: '新名称' })
  await api.deleteModel('m')
  await api.models()
  const calls = fetchMock.mock.calls as [URL, RequestInit][]
  for (const [, options] of calls.slice(0, 3)) {
    expect((options.headers as Headers).get('Authorization')).toBe('Bearer owner')
    expect((options.headers as Headers).get('X-Setup-Secret')).toBe('setup')
  }
  expect((calls[3]![1].headers as Headers).has('X-Setup-Secret')).toBe(false)
})

it('溯源只发送案例 ID 与 Bearer，列表使用 limit/offset', async () => {
  session.setBearer('owner'); session.setAdmin('setup')
  const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ code: 0, data: {} }) })
  vi.stubGlobal('fetch', fetchMock)
  await api.traceCases(); await api.createTrace({ case_id: 'CASE_1' }); await api.traceTasks(20, 40); await api.traceTask('t/1'); await api.traceResult('t/1')
  const calls = fetchMock.mock.calls as [URL, RequestInit][]
  expect(calls.map(([url]) => url.pathname)).toEqual(['/api/v1/neural-trace/cases', '/api/v1/neural-trace/tasks', '/api/v1/neural-trace/tasks', '/api/v1/neural-trace/tasks/t%2F1', '/api/v1/neural-trace/tasks/t%2F1/result'])
  expect(JSON.parse(String(calls[1]![1].body))).toEqual({ case_id: 'CASE_1' })
  expect(calls[1]![1].method).toBe('POST')
  expect(Object.fromEntries(calls[2]![0].searchParams)).toEqual({ limit: '20', offset: '40' })
  for (const [, options] of calls) { expect((options.headers as Headers).get('Authorization')).toBe('Bearer owner'); expect((options.headers as Headers).has('X-Setup-Secret')).toBe(false) }
})

it('产物按文件流下载并发送 Bearer；下载失败保留追踪信息', async () => {
  session.setBearer('artifact-owner')
  const blob = new Blob(['weights'], { type: 'application/octet-stream' })
  const json = vi.fn()
  const fetchMock = vi.fn().mockResolvedValue({ status: 200, ok: true, blob: async () => blob, json })
  vi.stubGlobal('fetch', fetchMock)
  await expect(api.downloadTraining('t/1', 'a/1')).resolves.toBe(blob)
  const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit]
  expect(url.pathname).toBe('/api/v1/training/tasks/t%2F1/artifacts/a%2F1/download')
  expect((options.headers as Headers).get('Authorization')).toBe('Bearer artifact-owner')
  expect(json).not.toHaveBeenCalled()
  fetchMock.mockResolvedValue({ status: 404, ok: false, json: async () => ({ code: 404, message: '产物不存在', trace_id: 'download-trace' }) })
  await expect(api.downloadTraining('t1', 'missing')).rejects.toMatchObject({ message: '产物不存在', traceId: 'download-trace' })
})

it('分析失败时保留已持久化记录供页面展示', () => {
  const record = { id: 'failed-analysis', status: 'failed', original_output: '已有生成内容', calls: [{ call_id: 'call-1' }] }
  const error = parseError(502, { code: 502, message: '治理失败', data: record, trace_id: 'analysis-trace' }, true)
  expect(error.data).toEqual(record)
  expect(errorMessage(error)).toContain('analysis-trace')
})

it('通用调用仍使用旧契约，长输入不会被新 v1 限制影响', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ model_id: 'm1', response_type: 'general', result: {} }) })
  vi.stubGlobal('fetch', fetchMock)
  const input = 'x'.repeat(50001)
  await api.invoke({ model_id: 'm1', response_type: 'general', input })
  const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit]
  expect(url.pathname).toBe('/api/llm/invoke')
  expect(JSON.parse(String(options.body)).input).toBe(input)
})

it('风险导出只发送筛选条件，不发送分页', async () => {
  session.setBearer('owner'); session.setAdmin('setup')
  const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ code: 0, data: [] }) })
  vi.stubGlobal('fetch', fetchMock)
  await api.exportRisk('r1', { keyword: '文本', level: 'HIGH', status: '待复核' })
  const calls = fetchMock.mock.calls as [URL, RequestInit][]
  expect(JSON.parse(String(calls[0]![1].body))).toEqual({ keyword: '文本', level: 'HIGH', status: '待复核' })
})
