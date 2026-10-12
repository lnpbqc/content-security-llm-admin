import { ApiError, request, requestFile } from './client'
import type { AnalysisKind, AnalysisOptions, AnalysisRecord, AuditInput, GovernanceInput, GovernanceOptions, GovernanceOverview, OverviewCard, ScenarioInput, TrainingArtifact, TrainingDefaults, TrainingInput, TrainingMetrics, TrainingTask } from '@/types/api'
import type { BusinessDatabase, BusinessDatabaseInput, BusinessDatabaseTestResult, BusinessUser, Call, Kind, Model, ModelInput, Page, ResultSample, ResultSummary, Scope, Task, TaskCreate, Token } from '@/types/api'
import type { ScriptTrainingInput, TraceCase, TraceResult, TraceTask, TrainingLogs, TrainingScript } from '@/types/api'

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
  createModel: (body: ModelInput) => request<Model>('/api/models', { method: 'POST', body, credential: 'both' }),
  updateModel: (id: string, body: Partial<ModelInput>) => request<Model>(`/api/models/${encodeURIComponent(id)}`, { method: 'PATCH', body, credential: 'both' }),
  deleteModel: (id: string) => request<void>(`/api/models/${encodeURIComponent(id)}`, { method: 'DELETE', credential: 'both' }),
  bindings: () => request<Partial<Record<Kind, string>>>('/api/v1/admin/governance/models', { credential: 'admin' }),
  setBinding: (kind: Kind, model_id: string) => request(`/api/v1/admin/governance/models/${kind}`, { method: 'PUT', body: { model_id }, credential: 'admin' }),
  businessDatabase: () => request<BusinessDatabase | null>('/api/v1/admin/governance/business-database', { credential: 'admin' }),
  setBusinessDatabase: (body: BusinessDatabaseInput) => request<BusinessDatabase>('/api/v1/admin/governance/business-database', { method: 'PUT', body, credential: 'admin' }),
  testBusinessDatabase: () => request<BusinessDatabaseTestResult>('/api/v1/admin/governance/business-database/test', { method: 'POST', credential: 'admin' }),
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
  governanceOptions: (kind: Kind) => request<GovernanceOptions>(kind === 'governance-risk' ? `${root}/risk-options` : `${root}/options`, q({ kind })),
  governanceOverview: async (kind: Kind): Promise<GovernanceOverview> => kind === 'governance-value' ? { cards: await request<OverviewCard[]>('/api/v1/kpis', q({ kind })) } : request<GovernanceOverview>(kind === 'governance-risk' ? `${root}/risk-overview` : `${root}/anomaly-results/overview`, q({ kind })),
  exportRisk: (id: string, body: { keyword: string; level: string; status: string }) => request<ResultSample[]>(`${root}/risk-results/${encodeURIComponent(id)}/export`, { method: 'POST', body }),
  riskKnowledge: (result_id: string, sample_id: string, keyword: string) => request<Record<string, unknown>[]>('/api/v1/risk-knowledge', q({ result_id, sample_id, keyword })),
  trainingDefaults: () => request<TrainingDefaults>('/api/v1/training/defaults'),
  trainingScripts: () => request<TrainingScript[]>('/api/v1/training/scripts'),
  createScriptTraining: (body: ScriptTrainingInput) => request<TrainingTask>('/api/v1/training/script-tasks', { method: 'POST', body, credential: 'both' }),
  createTraining: (body: TrainingInput) => request<TrainingTask>('/api/v1/training/tasks', { method: 'POST', body, credential: 'both' }),
  trainingTasks: (page: number, page_size: number) => request<Page<TrainingTask>>('/api/v1/training/tasks', q({ page, page_size })),
  trainingTask: (id: string) => request<TrainingTask>(`/api/v1/training/tasks/${encodeURIComponent(id)}`),
  trainingMetrics: (id: string, after_id: number) => request<TrainingMetrics>(`/api/v1/training/tasks/${encodeURIComponent(id)}/metrics`, q({ after_id, limit: 200 })),
  trainingLogs: (id: string, after_offset: number, limit = 65536) => request<TrainingLogs>(`/api/v1/training/tasks/${encodeURIComponent(id)}/logs`, q({ after_offset, limit })),
  cancelTraining: (id: string) => request<TrainingTask>(`/api/v1/training/tasks/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
  trainingArtifacts: (id: string) => request<TrainingArtifact[]>(`/api/v1/training/tasks/${encodeURIComponent(id)}/artifacts`),
  downloadTraining: (id: string, artifactId: string) => requestFile(`/api/v1/training/tasks/${encodeURIComponent(id)}/artifacts/${encodeURIComponent(artifactId)}/download`),
  analysisOptions: () => request<AnalysisOptions>('/api/v1/analysis/options'),
  analyzeScenario: (body: ScenarioInput) => request<AnalysisRecord>('/api/v1/analysis/scenarios', { method: 'POST', body }),
  analyzeGovernance: (body: GovernanceInput) => request<AnalysisRecord>('/api/v1/analysis/model-governance', { method: 'POST', body }),
  analyzeAudit: (body: AuditInput) => request<AnalysisRecord>('/api/v1/analysis/audits', { method: 'POST', body }),
  analysisRecords: (params: { page: number; page_size: number; kind?: AnalysisKind; scenario_code?: string; status?: string }) => request<Page<AnalysisRecord>>('/api/v1/analysis/records', q(params)),
  analysisRecord: (id: string) => request<AnalysisRecord>(`/api/v1/analysis/records/${encodeURIComponent(id)}`),
  traceCases: () => request<TraceCase[]>('/api/v1/neural-trace/cases'),
  createTrace: (body: { case_id: string }) => request<TraceTask>('/api/v1/neural-trace/tasks', { method: 'POST', body }),
  traceTasks: (limit: number, offset: number) => request<{ items: TraceTask[]; total: number }>('/api/v1/neural-trace/tasks', q({ limit, offset })),
  traceTask: (id: string) => request<TraceTask>(`/api/v1/neural-trace/tasks/${encodeURIComponent(id)}`),
  traceResult: (id: string) => request<TraceResult>(`/api/v1/neural-trace/tasks/${encodeURIComponent(id)}/result`),
}

export function taskId(task: Task): string { return task.task_id || task.id || '' }
