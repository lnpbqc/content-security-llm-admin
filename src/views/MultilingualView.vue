<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '@/api'
import { errorMessage } from '@/api/client'
import { session } from '@/stores/session'
import type { Model, MultilingualResult, MultilingualSample, MultilingualScope, MultilingualTask, Page } from '@/types/api'
import { createTaskPoller, shouldPoll } from '@/utils/polling'
import TaskBadge from '@/components/TaskBadge.vue'

const models = ref<Model[]>([])
const modelId = ref('')
const datasetId = ref(1)
const versionId = ref('')
const languages = ref('zh, en')
const mode = ref<MultilingualScope['analysis_mode']>('semantic_weighting')
const modelError = ref('')
const error = ref('')
const busy = ref(false)
const taskId = ref('')
const active = ref<MultilingualTask | null>(null)
const taskError = ref('')
const refreshing = ref(false)
const resultId = ref('')
const result = ref<MultilingualResult | null>(null)
const resultError = ref('')
const resultBusy = ref(false)
const history = ref<MultilingualResult[]>([])
const historyError = ref('')
const historyBusy = ref(false)
const samples = ref<Page<MultilingualSample> | null>(null)
const samplePage = ref(1)
const sampleTotal = ref(0)
const sampleError = ref('')
const sampleBusy = ref(false)
const detail = ref<MultilingualSample | null>(null)
let lifecycle = 0, taskRevision = 0, resultRevision = 0, sampleRevision = 0, historyRevision = 0, modelRevision = 0
const riskLabels = { safe: '安全', low: '低风险', medium: '中风险', high: '高风险', unknown: '未知' }
const modeLabels = { semantic_weighting: '语义权重', risk_tiering: '风险分层' }
const percent = (value: number | null, scale = 100) => value == null ? '—' : `${Number((value * scale).toFixed(2))}%`
const delta = (value: number | null, scale: number) => value == null ? '无可比基线' : `${value > 0 ? '+' : ''}${Number((value * scale).toFixed(2))} 个百分点`
const poller = createTaskPoller(async () => { await refreshTask(); return active.value?.status || 'succeeded' })

function scope(): MultilingualScope {
  const selected = languages.value.trim().split(/[,，\s]+/).filter(Boolean)
  if (!Number.isInteger(datasetId.value) || datasetId.value < 1 || !versionId.value.trim() || versionId.value.trim().length > 128) throw new Error('请填写正整数数据集 ID 和 1–128 字符的版本 ID')
  if (!selected.length || selected.length > 32 || selected.some(item => !/^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{2,8})*$/.test(item)) || new Set(selected).size !== selected.length) throw new Error('请填写 1–32 个不重复的语言标签，以逗号或空格分隔，例如 zh, en, ug')
  return { dataset_id: datasetId.value, version_id: versionId.value.trim(), languages: selected, analysis_mode: mode.value, scheme_id: 'multilingual-v1' }
}
async function loadModels() {
  const current = ++modelRevision; modelError.value = ''
  try { const data = await api.models(); if (current === modelRevision) models.value = data }
  catch (e) { if (current === modelRevision) modelError.value = errorMessage(e) }
}
function clearResult() {
  resultRevision++; sampleRevision++; result.value = null; samples.value = null; detail.value = null; samplePage.value = 1; sampleTotal.value = 0; resultError.value = ''; sampleError.value = ''; resultBusy.value = false; sampleBusy.value = false
}
async function loadSamples() {
  if (!result.value) return
  const current = ++sampleRevision; const id = result.value.id
  samples.value = null; detail.value = null; sampleError.value = ''; sampleBusy.value = true
  try { const data = await api.multilingualSamples(id, samplePage.value, 20); if (current === sampleRevision) { samples.value = data; sampleTotal.value = data.total } }
  catch (e) { if (current === sampleRevision) sampleError.value = errorMessage(e) }
  finally { if (current === sampleRevision) sampleBusy.value = false }
}
async function queryResult(load: () => Promise<MultilingualResult | null>) {
  clearResult(); const current = resultRevision; resultBusy.value = true
  try {
    const data = await load()
    if (current !== resultRevision) return
    result.value = data
    if (data) { resultId.value = data.id; await loadSamples() }
    else resultError.value = '当前范围尚无已发布结果'
  } catch (e) { if (current === resultRevision) resultError.value = errorMessage(e) }
  finally { if (current === resultRevision) resultBusy.value = false }
}
async function latest() {
  error.value = ''
  try { const input = scope(); await queryResult(() => api.latestMultilingual(input)) }
  catch (e) { error.value = errorMessage(e) }
}
async function loadResult(id = resultId.value) {
  if (!id.trim()) { resultError.value = '请输入结果 ID'; return }
  await queryResult(() => api.multilingualResult(id.trim()))
}
async function loadHistory() {
  error.value = ''; historyError.value = ''
  let input: MultilingualScope
  try { input = scope() } catch (e) { error.value = errorMessage(e); return }
  const current = ++historyRevision; historyBusy.value = true; history.value = []
  try { const data = await api.multilingualHistory(input); if (current === historyRevision) { history.value = data; if (!data.length) historyError.value = '当前范围暂无历史结果' } }
  catch (e) { if (current === historyRevision) historyError.value = errorMessage(e) }
  finally { if (current === historyRevision) historyBusy.value = false }
}
async function showTask(task: MultilingualTask, current: number) {
  if (current !== taskRevision) return
  active.value = task; taskId.value = task.task_id
  if (shouldPoll(task.status)) poller.start()
  else {
    poller.stop()
    if (task.status === 'succeeded' && task.result_id) await loadResult(task.result_id)
  }
}
async function refreshTask() {
  if (!active.value || refreshing.value) return
  const current = taskRevision; const id = active.value.task_id; refreshing.value = true; taskError.value = ''
  try { await showTask(await api.multilingualTask(id), current) }
  catch (e) { if (current === taskRevision) { taskError.value = errorMessage(e); poller.stop() }; throw e }
  finally { if (current === taskRevision) refreshing.value = false }
}
async function selectTask() {
  if (!taskId.value.trim()) { taskError.value = '请输入任务 ID'; return }
  const id = taskId.value.trim(); const current = ++taskRevision
  poller.stop(); active.value = null; refreshing.value = true; taskError.value = ''; clearResult()
  try { await showTask(await api.multilingualTask(id), current) }
  catch (e) { if (current === taskRevision) taskError.value = errorMessage(e) }
  finally { if (current === taskRevision) refreshing.value = false }
}
async function create() {
  if (busy.value) return
  error.value = ''
  const life = lifecycle; const current = taskRevision
  try {
    if (!session.bearer.value) throw new Error('请先录入访问令牌')
    if (!models.value.some(item => item.model_id === modelId.value)) throw new Error('请选择当前可用的模型')
    const input = scope(); busy.value = true
    const task = await api.createMultilingual({ model_id: modelId.value, input })
    if (life !== lifecycle || current !== taskRevision) return
    poller.stop(); taskRevision++; clearResult(); taskError.value = ''
    ElMessage.success('多语种分析任务已提交'); await showTask(task, taskRevision)
  } catch (e) { if (life === lifecycle) error.value = errorMessage(e) }
  finally { if (life === lifecycle) busy.value = false }
}
watch(session.bearerRevision, () => {
  lifecycle++; taskRevision++; historyRevision++; poller.stop(); clearResult(); models.value = []; modelId.value = ''; active.value = null; taskId.value = ''; resultId.value = ''; history.value = []; busy.value = false; refreshing.value = false; historyBusy.value = false; error.value = ''; taskError.value = ''; historyError.value = ''
  void loadModels()
})
onMounted(loadModels)
onBeforeUnmount(() => { lifecycle++; taskRevision++; resultRevision++; sampleRevision++; historyRevision++; modelRevision++; poller.stop() })
</script>

<template>
  <div class="page-header"><div><h1>多语种语义与风险</h1><p class="muted">分析指定数据集版本和语种的语义权重、风险分层及跨语种分布相似度。</p></div><el-button @click="loadModels">刷新模型</el-button></div>
  <div class="section">
    <h2>分析范围与模型</h2><p class="muted">使用当前访问令牌提交，由治理 worker 执行。显式选择模型，无需管理员密钥或治理模型绑定；只读已入库的结构化记录，不使用模拟样本。</p>
    <div class="form-grid" style="margin-top:16px">
      <div class="field"><label for="multilingual-model">模型</label><el-select id="multilingual-model" v-model="modelId" placeholder="选择分析模型"><el-option v-for="item in models" :key="item.model_id" :value="item.model_id" :label="`${item.name}（${item.model_id}）`" /></el-select></div>
      <div class="field"><label for="multilingual-mode">分析重点</label><el-select id="multilingual-mode" v-model="mode"><el-option label="语义权重" value="semantic_weighting" /><el-option label="风险分层" value="risk_tiering" /></el-select><p class="field-hint">两种模式均返回完整权重和风险结果，仅改变解释重点。</p></div>
      <div class="field"><label for="multilingual-dataset">数据集 ID</label><el-input-number id="multilingual-dataset" v-model="datasetId" :min="1" :precision="0" /></div>
      <div class="field"><label for="multilingual-version">数据集版本</label><el-input id="multilingual-version" v-model="versionId" :maxlength="128" placeholder="例如 v1.0.0，须与实际数据集版本一致" /></div>
      <div class="field full"><label for="multilingual-languages">语种范围</label><el-input id="multilingual-languages" v-model="languages" placeholder="例如 zh, en, ug" /><p class="field-hint">逗号或空格分隔，1–32 个不重复的语言标签；本接口会实际筛选语种。方案固定为 multilingual-v1。</p></div>
    </div>
    <p class="field-hint">CSV/JSON 文件直接入库不等于逐行结构化样本。准确率需要记录中预先提供 reference_risk_level（safe / low / medium / high）；无需在此填写标签。</p>
    <p class="field-hint">服务端核对数据集当前版本号；版本号不变时新增记录，也会改变下次任务的样本范围。</p>
    <p v-if="modelError" class="error">{{ modelError }}</p><p v-if="error" class="error" role="alert">{{ error }}</p>
    <div class="row end"><el-button :loading="busy" @click="create" type="primary">提交多语种分析</el-button></div>
  </div>
  <div class="section">
    <h2>任务状态</h2><div class="toolbar"><el-input v-model="taskId" placeholder="输入多语种任务 ID" /><el-button :loading="refreshing" @click="selectTask">查询任务</el-button><el-button v-if="active" :loading="refreshing" @click="refreshTask().catch(() => {})">刷新任务</el-button></div>
    <p class="field-hint">当前接口无任务列表，可保存任务 ID 后查询；等待或运行中每 3 秒刷新，终态或请求失败后停止。</p>
    <p v-if="taskError" class="error">{{ taskError }}</p>
    <dl v-if="active" class="detail-list"><dt>任务 ID</dt><dd>{{ active.task_id }}</dd><dt>状态</dt><dd><TaskBadge :status="active.status" /></dd><dt>模型 / 创建时间</dt><dd>{{ active.model_id }} / {{ active.created_at }}</dd><dt>实际任务范围</dt><dd>{{ active.input.dataset_id }} · {{ active.input.version_id }} · {{ active.input.languages.join(', ') }} · {{ modeLabels[active.input.analysis_mode] }}</dd><dt v-if="active.error_message">失败原因</dt><dd v-if="active.error_message" class="error">{{ active.error_message }}</dd></dl>
  </div>
  <div class="section">
    <h2>只读结果与历史</h2><div class="row"><el-button :loading="resultBusy" @click="latest">查询当前范围最新结果</el-button><el-button :loading="historyBusy" @click="loadHistory">查询当前范围历史</el-button></div>
    <p class="field-hint">查询按数据集版本、语种、分析重点及方案匹配，不按上方所选模型筛选；查看快照不会重新运行模型。</p>
    <div class="toolbar" style="margin-top:16px"><el-input v-model="resultId" placeholder="输入多语种结果 ID" /><el-button :loading="resultBusy" @click="loadResult()">按结果 ID 查看</el-button></div>
    <p v-if="historyError" class="error">{{ historyError }}</p>
    <el-table v-if="history.length" :data="history"><el-table-column prop="id" label="结果 ID" min-width="220" /><el-table-column prop="dataset_name" label="数据集" min-width="130" /><el-table-column prop="model_id" label="模型" min-width="150" /><el-table-column prop="finished_at" label="完成时间" min-width="180" /><el-table-column label="操作" width="80"><template #default="{ row }"><el-button link type="primary" @click="loadResult(row.id)">查看结果</el-button></template></el-table-column></el-table>
    <p v-if="resultError" class="error" role="alert">{{ resultError }}</p>
    <p v-if="!result && !resultError && !resultBusy" class="muted">尚未查询结果。任务成功后自动读取结果。</p>
  </div>
  <template v-if="result">
    <div class="section">
      <h2>结果快照 · {{ result.dataset_name }}</h2>
      <p class="muted">{{ result.id }} · {{ result.finished_at }} · 模型 {{ result.model_id }}</p><p class="field-hint">实际结果范围：数据集 {{ result.scope.dataset_id }} / {{ result.scope.version_id }} · {{ result.scope.languages.join(', ') }} · {{ modeLabels[result.scope.analysis_mode] }} · {{ result.scheme_name }}。修改上方表单不会改变此快照。</p>
      <div class="metric-row"><div class="metric"><strong>{{ percent(result.data_weight_classification_accuracy) }}</strong><span>数据权重判别准确率</span></div><div class="metric"><strong>{{ percent(result.semantic_consistency) }}</strong><span>跨语种风险分布相似度</span></div><div class="metric"><strong>{{ percent(result.high_risk_semantic_weight, 1) }}</strong><span>平均风险语义权重</span></div><div class="metric"><strong>{{ result.overall_risk_score ?? '—' }}</strong><span>平均风险分（0–1）· {{ riskLabels[result.overall_risk_level] }}</span></div></div>
      <p class="field-hint">准确率：{{ result.accuracy_correct_count }} / {{ result.accuracy_test_count }} 个带标准标签样本预测正确；无标准标签时显示“—”，失败或无法评估的带标签样本仍计入分母。</p>
      <p class="field-hint">相似度为各语种安全/中性/风险分布的两两 Jensen–Shannon 相似度均值，不表示逐句翻译一致；少于两个有效语种时显示“—”。风险语义权重是有效样本风险权重均值，不是高风险样本占比。</p>
      <p class="field-hint">同范围、同模型上次结果变化：相似度 {{ delta(result.semantic_consistency_delta, 100) }}；风险语义权重 {{ delta(result.high_risk_semantic_weight_delta, 1) }}。</p>
      <p class="muted">目标 {{ result.target_count }} · 已评估 {{ result.valid_count }} · 无法评估 {{ result.unassessable_count }} · 失败 {{ result.failed_count }} · 有效语种 {{ result.covered_language_count }}</p>
      <h3 style="margin-top:20px">各语种平均语义权重</h3>
      <el-table :data="result.language_distribution" empty-text="无有效语种数据"><el-table-column prop="language" label="语种" width="100" /><el-table-column prop="sample_count" label="有效样本" width="100" /><el-table-column label="安全 / 中性 / 风险权重（%）" min-width="300"><template #default="{ row }"><div class="weight-bar" aria-hidden="true"><span :style="{ width: `${row.safe_weight}%` }" class="safe" /><span :style="{ width: `${row.neutral_weight}%` }" class="neutral" /><span :style="{ width: `${row.risk_weight}%` }" class="risk" /></div><span>安全 {{ row.safe_weight }}% · 中性 {{ row.neutral_weight }}% · 风险 {{ row.risk_weight }}%</span></template></el-table-column></el-table>
      <h3 style="margin-top:20px">样本风险分层</h3><p class="field-hint">仅统计已评估样本；风险分阈值：低 {{ result.thresholds.low }}、中 {{ result.thresholds.medium }}、高 {{ result.thresholds.high }}，等于阈值归入较高档。</p>
      <el-table :data="result.risk_distribution"><el-table-column label="等级" width="110"><template #default="{ row }">{{ riskLabels[row.level as keyof typeof riskLabels] }}</template></el-table-column><el-table-column prop="count" label="样本数" width="100" /><el-table-column label="占已评估样本比例" min-width="200"><template #default="{ row }"><el-progress :percentage="row.percent" /></template></el-table-column></el-table>
      <h3 style="margin-top:20px">风险证据（最多 20 项）</h3><el-table :data="result.risk_evidence" empty-text="暂无风险证据"><el-table-column prop="sample_id" label="样本 ID" min-width="140" /><el-table-column prop="language" label="语种" width="80" /><el-table-column prop="quote" label="原文引用" min-width="230" /><el-table-column prop="reason" label="依据" min-width="230" /><el-table-column label="风险语义权重" width="130"><template #default="{ row }">{{ percent(row.semantic_weight) }}</template></el-table-column><el-table-column prop="risk_score" label="风险分（0–1）" width="120" /><el-table-column label="等级" width="100"><template #default="{ row }">{{ riskLabels[row.risk_level as keyof typeof riskLabels] }}</template></el-table-column></el-table>
    </div>
    <div class="section">
      <div class="section-header"><h2>分页样本</h2><el-button :loading="sampleBusy" @click="loadSamples">刷新样本</el-button></div><p class="field-hint">展示已评估和无法评估的样本；模型失败记录仅计入汇总失败数。正文为服务端遮蔽后的快照。</p><p v-if="sampleError" class="error">{{ sampleError }}</p>
      <el-table :data="samples?.items || []" empty-text="暂无样本"><el-table-column prop="id" label="样本 ID" min-width="130" /><el-table-column prop="language" label="语种" width="85" /><el-table-column prop="text" label="已遮蔽正文" min-width="250" show-overflow-tooltip /><el-table-column label="状态" width="110"><template #default="{ row }">{{ row.status === 'assessed' ? '已评估' : '无法评估' }}</template></el-table-column><el-table-column label="风险等级" width="110"><template #default="{ row }">{{ riskLabels[row.risk_level as keyof typeof riskLabels] }}</template></el-table-column><el-table-column label="标准档位" width="110"><template #default="{ row }">{{ row.reference_risk_level ? riskLabels[row.reference_risk_level as keyof typeof riskLabels] : '无标准标签' }}</template></el-table-column><el-table-column label="操作" width="110"><template #default="{ row }"><el-button link type="primary" @click="detail = row">样本详情</el-button></template></el-table-column></el-table>
      <el-pagination layout="prev, pager, next, total" :current-page="samplePage" :page-size="20" :total="sampleTotal" @current-change="(value: number) => { samplePage = value; loadSamples() }" />
    </div>
  </template>
  <el-drawer :model-value="!!detail" title="多语种样本详情" size="min(640px, 94vw)" @close="detail = null"><template v-if="detail"><dl class="detail-list"><dt>样本 ID / 语种</dt><dd>{{ detail.id }} / {{ detail.language }}</dd><dt>已遮蔽正文</dt><dd><pre class="pre">{{ detail.text }}</pre></dd><dt>安全 / 中性 / 风险权重</dt><dd>{{ percent(detail.semantic_weights?.safe ?? null) }} / {{ percent(detail.semantic_weights?.neutral ?? null) }} / {{ percent(detail.semantic_weights?.risk ?? null) }}</dd><dt>风险分 / 档位</dt><dd>{{ detail.risk_score ?? '—' }} / {{ riskLabels[detail.risk_level] }}</dd><dt>标准档位</dt><dd>{{ detail.reference_risk_level ? riskLabels[detail.reference_risk_level] : '无标准标签' }}</dd><dt v-if="detail.unassessable_reason">无法评估原因</dt><dd v-if="detail.unassessable_reason">{{ detail.unassessable_reason }}</dd></dl><h3 style="margin-top:20px">引用与依据</h3><div v-for="(item, index) in detail.evidence" :key="index"><blockquote>{{ item.quote }}</blockquote><p>{{ item.reason }}</p></div></template></el-drawer>
</template>

<style scoped>
.weight-bar { display: flex; height: 12px; overflow: hidden; border-radius: 3px; margin-bottom: 4px; background: #edf1f4; }
.weight-bar .safe { background: #338577; }
.weight-bar .neutral { background: #9aa6b6; }
.weight-bar .risk { background: #bb665b; }
</style>
