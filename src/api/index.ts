import { ApiError, request } from './client'
import type { BusinessDatabase, BusinessDatabaseInput, BusinessUser, Call, Kind, Model, ModelInput, Page, ResultSample, ResultSummary, Scope, Task, TaskCreate, Token } from '@/types/api'

const q = (params: Record<string, string | number | undefined>) => ({ params })
const scopeQuery = (scope: Scope) => ({ ...scope })
const root = '/api/v1/data-governance'
const taskPath: Record<Kind, string> = { 'governance-value': '/api/v1/tasks', 'governance-anomaly': `${root}/anomaly-tasks`, 'governance-risk': `${root}/risk-tasks` }
const resultPath: Record<Kind, string> = { 'governance-value': `${root}/value-results`, 'governance-anomaly': `${root}/anomaly-results`, 'governance-risk': `${root}/risk-results` }

export const api = {
  health: async () => { const path = import.meta.env.VITE_API_BASE_URL ? '/' : '/__api_health'; const result = await request<{ message: string }>(path, { credential: 'none', v1: false }); if (result?.message !== 'Content Security LLM') throw new ApiError(0, 'API 健康响应无效'); return result },
  createToken: (body: { token: string; expires_at: string; label?: string }) => request('/api/auth/token', { method: 'POST', body, credential: 'admin' }),
  tokens: () => request<Token[]>('/api/v1/admin/tokens', { credential: 'admin' }),
  businessUsers: (params: { page: number; page_size: number; keyword?: string }) => request<Page<BusinessUser>>('/api/v1/admin/business-users', { credential: 'admin', params }),
  labelToken: (id: string, label: string) => request<Token>(`/api/v1/admin/tokens/${encodeURIComponent(id)}/label`, { method: 'PATCH', body: { label }, credential: 'admin' }),
  tokenStatusById: (id: string, enabled: boolean) => request<Token>(`/api/v1/admin/tokens/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { enabled }, credential: 'admin' }),
  deleteToken: (id: string) => request<{ id: string; deleted: boolean }>(`/api/v1/admin/tokens/${encodeURIComponent(id)}`, { method: 'DELETE', credential: 'admin' }),
  allTokenStatus: (enabled: boolean) => request<{ enabled: boolean; updated_count: number }>('/api/auth/tokens/status', { method: 'PATCH', body: { enabled }, credential: 'admin' }),
  models: () => request<Model[]>('/api/models'),
  model: (id: string) => request<Model>(`/api/models/${encodeURIComponent(id)}`),
  createModel: (body: ModelInput) => request<Model>('/api/models', { method: 'POST', body }),
  updateModel: (id: string, body: Partial<ModelInput>) => request<Model>(`/api/models/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  deleteModel: (id: string) => request<void>(`/api/models/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  bindings: () => request<Partial<Record<Kind, string>>>('/api/v1/admin/governance/models', { credential: 'admin' }),
  setBinding: (kind: Kind, model_id: string) => request(`/api/v1/admin/governance/models/${kind}`, { method: 'PUT', body: { model_id }, credential: 'admin' }),
  businessDatabase: () => request<BusinessDatabase | null>('/api/v1/admin/governance/business-database', { credential: 'admin' }),
  setBusinessDatabase: (body: BusinessDatabaseInput) => request<BusinessDatabase>('/api/v1/admin/governance/business-database', { method: 'PUT', body, credential: 'admin' }),
  responseTypes: () => request<string[]>('/api/llm/response-types'),
  invoke: (body: { model_id: string; input: string; response_type: string }) => request<{ model_id: string; response_type: string; result: Record<string, unknown> }>('/api/llm/invoke', { method: 'POST', body }),
  calls: (limit: number, offset: number) => request<Call[]>('/api/calls', q({ limit, offset })),
  adminCalls: (limit: number, offset: number) => request<Call[]>('/api/v1/admin/calls', { ...q({ limit, offset }), credential: 'admin' }),
  createTask: (body: TaskCreate) => request<Task>(taskPath[body.kind], { method: 'POST', body }),
  task: (kind: Kind, id: string) => request<Task>(`${taskPath[kind]}/${encodeURIComponent(id)}`, kind === 'governance-value' ? q({ kind }) : {}),
  valueTasks: (scope: Scope, page: number, page_size: number) => request<Page<Task>>('/api/v1/tasks', q({ kind: 'governance-value', ...scopeQuery(scope), page, page_size })),
  latestResult: (kind: Kind, scope: Scope) => request<ResultSummary | null>(`${resultPath[kind]}/latest`, q(scopeQuery(scope))),
  resultHistory: (kind: 'governance-anomaly' | 'governance-risk', scope: Scope) => request<ResultSummary[]>(resultPath[kind], q(scopeQuery(scope))),
  result: (kind: Kind, id: string) => request<ResultSummary>(`${resultPath[kind]}/${encodeURIComponent(id)}`),
  samples: (kind: Kind, id: string, params: Record<string, string | number | undefined>) => request<Page<ResultSample>>(`${resultPath[kind]}/${encodeURIComponent(id)}/samples`, q(params)),
  sample: (kind: 'governance-anomaly' | 'governance-risk', resultId: string, sampleId: string) => request<ResultSample>(`${resultPath[kind]}/${encodeURIComponent(resultId)}/samples/${encodeURIComponent(sampleId)}`),
}

export function taskId(task: Task): string { return task.task_id || task.id || '' }
