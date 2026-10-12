export type Credential = 'bearer' | 'admin' | 'both' | 'none'
export type Scope = { dataset_id: number; version_id: string; language: string; scheme_id: string }
export type Kind = 'governance-value' | 'governance-anomaly' | 'governance-risk'
export type TaskStatus = 'pending' | 'running' | 'succeeded' | 'failed'
export type Task = { id?: string; task_id?: string; name?: string; input?: Scope; status: TaskStatus; created_at: string; result_id: string | null; error_message: string | null; coverage?: number }
export type TaskCreate = { kind: Kind; name: string; input: Scope }
export type Page<T> = { items: T[]; total: number; page: number; page_size: number; total_pages: number }
export type Token = { id: string; label: string; created_at: string; expires_at: string; enabled: boolean }
export type BusinessUser = { id: number; username: string; display_name: string; role: string; enabled: boolean }
export type Model = { model_id: string; upstream_model_id: string; name: string; description: string | null; base_url: string; created_at: string; updated_at: string }
export type ModelInput = { upstream_model_id: string; name: string; description?: string | null; base_url: string; api_key: string }
export type BusinessDatabase = { host: string; port: number; database: string; username: string; password_configured: boolean }
export type BusinessDatabaseInput = Omit<BusinessDatabase, 'password_configured'> & { password: string }
export type BusinessDatabaseTestResult = { connected: true; checks: ('connection' | 'query' | 'datasets' | 'dataset_records')[]; elapsed_ms: number; checked_at: string }
export type Call = { id: string; model_id: string; input: string; output: Record<string, unknown> | null; response_type: string; status: string; error_code: string | null; created_at: string; token_id?: string; token_label?: string }
export type ResultSummary = { id: string; task_id: string; scope: Scope; dataset_name: string; finished_at: string; [key: string]: unknown }
export type ResultSample = { id: string; text: string; [key: string]: unknown }
export type TrainingStatus = TaskStatus | 'canceling' | 'canceled'
export type TensorSpec = { dtype: string; shape: (number | null)[] }
export type TensorContract = { inputs: Record<string, TensorSpec>; targets: TensorSpec | Record<string, TensorSpec>; outputs: TensorSpec | Record<string, TensorSpec> }
export type TrainingInput = {
  name: string; dataset_id: number; version_id: string; python_source: string; contract: TensorContract
  model_id?: string | null; base_version?: string | null; target_version?: string | null; method?: string
  epochs?: number; batch_size?: number; learning_rate?: number; seed?: number; device?: string
  optimizer?: string; optimizer_params?: Record<string, unknown>; scheduler?: string | null; scheduler_params?: Record<string, unknown>
  validation_ratio?: number; task_type?: string; loss?: string; metrics?: string; average?: string; threshold?: number; pos_label?: number
  model_params?: Record<string, unknown>; data_params?: Record<string, unknown>; loss_params?: Record<string, unknown>; metric_params?: Record<string, unknown>
}
export type TrainingDefaults = { defaults: Partial<TrainingInput>; supported: Record<string, string[]>; example_record: Record<string, unknown>; example_request: TrainingInput; custom_example_request: TrainingInput; trusted_code_only: boolean }
export type ScriptTrainingInput = { name: string; script_id: string; inputs: Record<string, unknown>; parameters: Record<string, unknown> }
export type TrainingScript = { id: string; name: string; description: string; inputs_schema: Record<string, unknown>; parameters_schema: Record<string, unknown> }
export type TrainingTask = Partial<Omit<TrainingInput, 'python_source' | 'name'>> & { id: string; name: string; runner?: 'script'; script_id?: string; inputs?: Record<string, unknown>; parameters?: Record<string, unknown>; status: TrainingStatus; progress: number | null; epoch: number | null; step: number | null; elapsed?: string; elapsed_seconds: number; created_at: string; error_message: string | null; latest_phase: string | null; latest_metrics: Record<string, number | null>; config: Record<string, unknown>; runtime: Record<string, unknown> }
export type TrainingMetric = { id: number; epoch?: number | null; step?: number | null; phase?: string | null; metrics: Record<string, number | null>; created_at: string }
export type TrainingMetrics = { items: TrainingMetric[]; next_after_id: number; has_more: boolean }
export type TrainingLogs = { text: string; next_after_offset: number; has_more: boolean }
export type TrainingArtifact = { id: string; filename: string; kind: string; epoch: number | null; loss: number | null; size: number; sha256: string }
export type TraceCase = { case_id: string; query: string; gold_answer: string; poison_target_answer: string }
export type TraceTask = { task_id: string; case_id: string; status: TaskStatus; stage: string; error_message: string | null; created_at: string; updated_at: string; started_at: string | null; finished_at: string | null }
export type TraceSection = { summary: Record<string, unknown>; rows: Record<string, unknown>[] }
export type TraceResult = { schema_version: 'neural-trace-result-v1'; task_id: string; case: TraceCase; model: Record<string, unknown>; input_hashes: Record<string, string>; document_trace: TraceSection; layer_scan: TraceSection; activation_difference: TraceSection; component_scan: TraceSection; baseline_generation: Record<string, unknown>; scoring_patch_scope: 'candidate_prediction_span'; generation_patch_scope: 'generation_prompt_last_token' }
export type AnalysisKind = 'scenario' | 'model_governance' | 'audit'
export type ScenarioCode = 'public_opinion' | 'hot_events' | 'cross_cultural' | 'ethnic_governance' | 'smart_government' | 'cyber_security'
export type Material = { id: string; content: string; title?: string | null; time?: string | null }
export type ScenarioInput = { model_id: string; scenario_code: ScenarioCode; content: string; language: string; materials: Material[]; target_language?: string }
export type GovernanceInput = { model_id: string; prompt: string; temperature?: number; max_tokens?: number }
export type ObservedStep = { id: string; label: string; detail: string; evidence_refs?: string[]; rule_refs?: string[] }
export type AuditInput = { model_id: string; audit_type: 'reasoning' | 'full_chain'; subject: { id: string; type: string; version: string }; steps: ObservedStep[]; evidence: Material[]; rules: { id: string; text: string }[] }
export type AnalysisOptions = { analysis_types: AnalysisKind[]; audit_types: string[]; scenarios: { code: ScenarioCode; name: string; input_requirements: string; supported_analysis_types: string[] }[] }
export type AnalysisRecord = { id: string; kind: AnalysisKind; scenario_code: ScenarioCode | null; model_id: string; input: Record<string, unknown>; status: 'running' | 'succeeded' | 'failed'; created_at: string; finished_at: string | null; result: Record<string, unknown> | null; original_output: unknown; error_message: string | null; error_code: string | null; calls: Record<string, unknown>[]; [key: string]: unknown }
export type GovernanceOptions = { schemes: { id: string; name: string; levels?: string[] }[]; types?: string[]; review_statuses?: string[] }
export type OverviewCard = { label: string; value: number; unit?: string }
export type GovernanceOverview = { cards: OverviewCard[]; definitions?: string[] }
