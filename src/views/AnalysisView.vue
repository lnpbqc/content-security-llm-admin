<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/api'
import { ApiError, errorMessage } from '@/api/client'
import AnalysisRecordDetails from '@/components/AnalysisRecordDetails.vue'
import { session } from '@/stores/session'
import type { AnalysisKind, AnalysisOptions, AnalysisRecord, AuditInput, Material, Model, ObservedStep, ScenarioCode, ScenarioInput } from '@/types/api'
import { jsonArray, validateAudit, validateScenario } from '@/utils/analysis'

const route = useRoute()
const area = computed(() => String(route.params.area || 'scenario'))
const title = computed(() => ({ scenario: '场景分析', governance: '模型治理', audit: '推理与全链路审计', records: '分析记录' })[area.value] || '场景分析')
const options = ref<AnalysisOptions | null>(null)
const models = ref<Model[]>([])
const modelId = ref('')
const scenario = ref<ScenarioCode>('public_opinion')
const content = ref('')
const language = ref('zh')
const targetLanguage = ref('')
const materials = ref('[]')
const prompt = ref('')
const temperature = ref<number | undefined>()
const maxTokens = ref<number | undefined>()
const auditType = ref<'reasoning' | 'full_chain'>('reasoning')
const subject = ref({ id: '', type: '', version: '' })
const steps = ref('[]')
const evidence = ref('[]')
const rules = ref('[]')
const record = ref<AnalysisRecord | null>(null)
const rows = ref<AnalysisRecord[]>([])
const page = ref(1)
const total = ref(0)
const filterKind = ref<AnalysisKind | ''>('')
const filterScenario = ref('')
const filterStatus = ref('')
const manualId = ref('')
const busy = ref(false)
const historyBusy = ref(false)
const error = ref('')
const historyError = ref('')
let revision = 0
let historyRevision = 0
const kindLabels = { scenario: '场景分析', model_governance: '模型治理', audit: '审计' }
const statuses = { running: '分析中', succeeded: '成功', failed: '失败' }
const instructions = computed(() => options.value?.scenarios.find(item => item.code === scenario.value)?.input_requirements)

async function loadOptions() {
  const current = revision; error.value = ''
  const results = await Promise.allSettled([api.models(), api.analysisOptions()])
  if (current !== revision) return
  if (results[0].status === 'fulfilled') models.value = results[0].value; else error.value = errorMessage(results[0].reason)
  if (results[1].status === 'fulfilled') options.value = results[1].value; else error.value = errorMessage(results[1].reason)
}
async function loadHistory() {
  const current = revision; const query = ++historyRevision; historyBusy.value = true; historyError.value = ''
  try {
    const data = await api.analysisRecords({ page: page.value, page_size: 20, kind: filterKind.value || undefined, scenario_code: filterScenario.value || undefined, status: filterStatus.value || undefined })
    if (current === revision && query === historyRevision) { rows.value = data.items; total.value = data.total }
  } catch (e) { if (current === revision && query === historyRevision) historyError.value = errorMessage(e) }
  finally { if (current === revision && query === historyRevision) historyBusy.value = false }
}
function applyFilters() { page.value = 1; void loadHistory() }
async function queryRecord(id = manualId.value) {
  if (!id.trim()) { historyError.value = '请输入分析记录 ID'; return }
  const current = revision; historyError.value = ''; record.value = null
  try { const value = await api.analysisRecord(id.trim()); if (current === revision) { record.value = value; manualId.value = value.id } }
  catch (e) { if (current === revision) historyError.value = errorMessage(e) }
}
async function submit() {
  const current = revision; error.value = ''; record.value = null
  try {
    if (!modelId.value) throw new Error('请选择模型')
    let execute: () => Promise<AnalysisRecord>
    if (area.value === 'scenario') {
      const input: ScenarioInput = { model_id: modelId.value, scenario_code: scenario.value, content: content.value, language: language.value.trim(), materials: jsonArray<Material>(materials.value, '材料'), ...(scenario.value === 'cross_cultural' && targetLanguage.value.trim() ? { target_language: targetLanguage.value.trim() } : {}) }
      validateScenario(input); execute = () => api.analyzeScenario(input)
    } else if (area.value === 'governance') {
      if (!prompt.value.trim() || prompt.value.trim().length > 50000) throw new Error('请输入 1–50000 字提示词')
      if (temperature.value != null && (!Number.isFinite(temperature.value) || temperature.value < 0 || temperature.value > 2)) throw new Error('temperature 须在 0–2 之间')
      if (maxTokens.value != null && (!Number.isInteger(maxTokens.value) || maxTokens.value < 1 || maxTokens.value > 8192)) throw new Error('max_tokens 须为 1–8192 的整数')
      const input = { model_id: modelId.value, prompt: prompt.value, ...(temperature.value != null ? { temperature: temperature.value } : {}), ...(maxTokens.value != null ? { max_tokens: maxTokens.value } : {}) }
      execute = () => api.analyzeGovernance(input)
    } else {
      const input: AuditInput = { model_id: modelId.value, audit_type: auditType.value, subject: { ...subject.value }, steps: jsonArray<ObservedStep>(steps.value, '步骤'), evidence: jsonArray<Material>(evidence.value, '证据'), rules: jsonArray<{ id: string; text: string }>(rules.value, '规则') }
      validateAudit(input); execute = () => api.analyzeAudit(input)
    }
    busy.value = true
    const value = await execute()
    if (current === revision) { record.value = value; manualId.value = value.id }
  } catch (e) {
    if (current !== revision) return
    error.value = errorMessage(e)
    if (e instanceof ApiError && e.data && typeof e.data === 'object' && 'id' in e.data && 'status' in e.data) { record.value = e.data as AnalysisRecord; manualId.value = record.value.id }
  } finally {
    if (current === revision) { busy.value = false; void loadHistory() }
  }
}
function reset() { revision++; historyRevision++; record.value = null; manualId.value = ''; rows.value = []; page.value = 1; total.value = 0; error.value = ''; historyError.value = ''; busy.value = false; historyBusy.value = false }
watch(area, () => { reset(); void loadOptions(); void loadHistory() }, { immediate: true })
watch(session.bearerRevision, () => { reset(); models.value = []; options.value = null; modelId.value = ''; void loadOptions(); void loadHistory() })
onBeforeUnmount(() => { revision++; historyRevision++ })
</script>
<template>
  <div class="page-header"><div><h1>{{ title }}</h1><p class="muted">分析与记录按当前访问令牌隔离，结果保留提交材料、引用和关联调用。</p></div><el-button @click="loadOptions(); loadHistory()">刷新</el-button></div>
  <div v-if="area !== 'records'" class="section"><h2>提交分析</h2><div class="form-grid">
    <div class="field full"><label>本地模型</label><el-select v-model="modelId" placeholder="选择模型"><el-option v-for="model in models" :key="model.model_id" :label="`${model.name}（${model.model_id}）`" :value="model.model_id" /></el-select></div>
    <template v-if="area === 'scenario'">
      <div class="field"><label>分析场景</label><el-select v-model="scenario"><el-option v-for="item in options?.scenarios || []" :key="item.code" :value="item.code" :label="item.name" /></el-select></div><div class="field"><label>输入语种</label><el-input v-model="language" placeholder="zh / en-US" /></div>
      <p v-if="instructions" class="field-hint full">{{ instructions }}</p>
      <div v-if="scenario === 'cross_cultural'" class="field"><label>目标语种（可选）</label><el-input v-model="targetLanguage" placeholder="如 en；留空不请求翻译" /></div>
      <div class="field full"><label>分析正文</label><el-input v-model="content" type="textarea" :rows="7" :maxlength="50000" show-word-limit /></div>
      <div class="field full"><label>补充材料 JSON（可选）</label><el-input v-model="materials" type="textarea" :rows="5" placeholder='[{"id":"m1","title":"材料标题","content":"材料原文","time":"原始时间"}]' /><p class="field-hint">每项包含唯一 id 和 content，可选 title、time。最多 50 项；input 保留给正文。正文与材料合计最多 200000 字符。</p></div>
    </template>
    <template v-else-if="area === 'governance'">
      <div class="field full"><label>生成提示词</label><el-input v-model="prompt" type="textarea" :rows="8" :maxlength="50000" show-word-limit /><p class="field-hint">服务先实际生成回答，再对该回答进行治理；结果保留原始内容及治理后内容。</p></div>
      <div class="field"><label>temperature（可选）</label><el-input-number v-model="temperature" :min="0" :max="2" :step="0.1" :precision="2" :value-on-clear="undefined" /></div><div class="field"><label>max_tokens（可选）</label><el-input-number v-model="maxTokens" :min="1" :max="8192" :precision="0" :value-on-clear="undefined" /></div>
    </template>
    <template v-else-if="area === 'audit'">
      <div class="field full"><label>审计类型</label><el-radio-group v-model="auditType"><el-radio-button value="reasoning">推理审计</el-radio-button><el-radio-button value="full_chain">全链路审计</el-radio-button></el-radio-group><p class="field-hint">基于可观测步骤、日志、证据与规则分析；审计建议的业务核验状态为 unverified。</p></div>
      <div class="field"><label>审计对象 ID</label><el-input v-model="subject.id" :maxlength="128" /></div><div class="field"><label>对象类型</label><el-input v-model="subject.type" :maxlength="128" /></div><div class="field"><label>对象版本</label><el-input v-model="subject.version" :maxlength="128" /></div>
      <div class="field full"><label>可观测步骤 JSON</label><el-input v-model="steps" type="textarea" :rows="6" placeholder='[{"id":"s1","label":"步骤名称","detail":"观测日志","evidence_refs":["e1"],"rule_refs":["r1"]}]' /><p class="field-hint">最多 100 项。evidence_refs 和 rule_refs 须对应下方已提交的 ID。</p></div>
      <div class="field"><label>证据 JSON</label><el-input v-model="evidence" type="textarea" :rows="6" placeholder='[{"id":"e1","content":"证据原文"}]' /></div><div class="field"><label>规则 JSON</label><el-input v-model="rules" type="textarea" :rows="6" placeholder='[{"id":"r1","text":"规则正文"}]' /></div>
    </template>
  </div><p v-if="error" class="error">{{ error }}</p><div class="row end"><el-button type="primary" :loading="busy" @click="submit">提交分析</el-button></div></div>
  <div class="section"><div class="section-header"><h2>分析记录</h2><el-button :loading="historyBusy" @click="loadHistory">刷新记录</el-button></div>
    <div class="toolbar"><el-select v-model="filterKind" clearable placeholder="全部类型" style="width:150px"><el-option v-for="(label, key) in kindLabels" :key="key" :label="label" :value="key" /></el-select><el-select v-model="filterScenario" clearable placeholder="全部场景" style="width:160px"><el-option v-for="item in options?.scenarios || []" :key="item.code" :label="item.name" :value="item.code" /></el-select><el-select v-model="filterStatus" clearable placeholder="全部状态" style="width:130px"><el-option v-for="(label, key) in statuses" :key="key" :value="key" :label="label" /></el-select><el-button @click="applyFilters">筛选</el-button></div>
    <el-table :data="rows" v-loading="historyBusy" empty-text="暂无分析记录"><el-table-column prop="id" label="记录 ID" min-width="230" /><el-table-column label="类型" width="110"><template #default="{ row }">{{ kindLabels[row.kind as AnalysisKind] }}</template></el-table-column><el-table-column prop="scenario_code" label="场景" min-width="140" /><el-table-column label="状态" width="100"><template #default="{ row }">{{ statuses[row.status as AnalysisRecord['status']] }}</template></el-table-column><el-table-column prop="created_at" label="创建时间" min-width="175" /><el-table-column label="详情" width="90"><template #default="{ row }"><el-button link type="primary" @click="queryRecord(row.id)">查看</el-button></template></el-table-column></el-table>
    <el-pagination layout="prev, pager, next, total" :current-page="page" :page-size="20" :total="total" @current-change="(value: number) => { page = value; loadHistory() }" />
    <div class="toolbar" style="margin-top:18px"><el-input v-model="manualId" placeholder="输入分析记录 ID" /><el-button @click="queryRecord()">按 ID 查询</el-button></div><p v-if="historyError" class="error">{{ historyError }}</p>
  </div>
  <AnalysisRecordDetails v-if="record" :record="record" />
</template>
