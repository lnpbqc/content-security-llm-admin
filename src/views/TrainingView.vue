<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '@/api'
import { errorMessage } from '@/api/client'
import { session } from '@/stores/session'
import type { TensorContract, TrainingArtifact, TrainingDefaults, TrainingInput, TrainingMetric, TrainingScript, TrainingTask } from '@/types/api'
import { jsonObject } from '@/utils/analysis'
import { saveFile } from '@/utils/download'
import { createTaskPoller } from '@/utils/polling'
import CifarTrainingFields from '@/components/CifarTrainingFields.vue'

const defaults = ref<TrainingDefaults | null>(null)
const form = ref({ name: '', dataset_id: 1, version_id: '', epochs: 10, batch_size: 8, learning_rate: 0.0002, task_type: 'multiclass' })
const source = ref('')
const contract = ref('{}')
const advanced = ref('{}')
const mode = ref('source')
const scripts = ref<TrainingScript[]>([])
const scriptId = ref('')
const scriptName = ref('')
const scriptInputs = ref('{}')
const scriptParameters = ref('{}')
const scriptError = ref('')
const selectedScript = computed(() => scripts.value.find(item => item.id === scriptId.value))
watch(scriptId, () => { scriptInputs.value = '{}'; scriptParameters.value = '{}'; useScriptDefaults() })
const rows = ref<TrainingTask[]>([])
const page = ref(1)
const total = ref(0)
const manualId = ref('')
const active = ref<TrainingTask | null>(null)
const metrics = ref<TrainingMetric[]>([])
const artifacts = ref<TrainingArtifact[]>([])
const cursor = ref(0)
const hasMore = ref(false)
const error = ref('')
const detailError = ref('')
const busy = ref(false)
const refreshing = ref(false)
const metricBusy = ref(false)
const logs = ref('')
const logCursor = ref(0)
const logHasMore = ref(false)
const logBusy = ref(false)
const logError = ref('')
const logLimit = ref(65536)
const metricKeys = computed(() => [...new Set(metrics.value.flatMap(item => Object.keys(item.metrics)))])
let revision = 0
let creationRevision = 0
const statuses: Record<string, string> = { pending: '等待中', running: '训练中', canceling: '取消中', canceled: '已取消', succeeded: '已完成', failed: '失败' }
const running = (task: TrainingTask) => ['pending', 'running', 'canceling'].includes(task.status)
const poller = createTaskPoller(async () => { await refresh(); return active.value && running(active.value) ? 'running' : 'succeeded' })

function useExample(custom = false) {
  if (!defaults.value) return
  const input = { ...defaults.value.defaults, ...(custom ? defaults.value.custom_example_request : defaults.value.example_request) }
  const { name, dataset_id, version_id, epochs, batch_size, learning_rate, task_type, python_source, contract: tensors, ...extra } = input
  form.value = { name, dataset_id, version_id, epochs: epochs ?? 10, batch_size: batch_size ?? 8, learning_rate: learning_rate ?? 0.0002, task_type: task_type ?? 'multiclass' }
  source.value = python_source; contract.value = JSON.stringify(tensors, null, 2); advanced.value = JSON.stringify(extra, null, 2)
}
function useScriptDefaults() {
  if (!selectedScript.value) return
  const defaultsFor = (schema: Record<string, unknown>) => Object.fromEntries(Object.entries((schema.properties || {}) as Record<string, { default?: unknown }>).filter(([, spec]) => 'default' in spec).map(([key, spec]) => [key, spec.default]))
  scriptInputs.value = JSON.stringify(defaultsFor(selectedScript.value.inputs_schema), null, 2)
  scriptParameters.value = JSON.stringify(defaultsFor(selectedScript.value.parameters_schema), null, 2)
}
async function loadList() {
  const current = revision
  try { const data = await api.trainingTasks(page.value, 20); if (current === revision) { rows.value = data.items; total.value = data.total } }
  catch (e) { if (current === revision) error.value = errorMessage(e) }
}
async function load() {
  error.value = ''; scriptError.value = ''; const current = revision
  const results = await Promise.allSettled([api.trainingDefaults(), api.trainingScripts(), loadList()])
  if (current !== revision) return
  if (results[0].status === 'fulfilled') { defaults.value = results[0].value } else error.value = errorMessage(results[0].reason)
  if (results[1].status === 'fulfilled') scripts.value = results[1].value; else scriptError.value = errorMessage(results[1].reason)
}
async function loadLogs() {
  if (!active.value || logBusy.value) return
  const current = revision; const id = active.value.id; logBusy.value = true; logError.value = ''
  try {
    const data = await api.trainingLogs(id, logCursor.value, logLimit.value)
    if (current !== revision || active.value?.id !== id) return
    logs.value += data.text; logCursor.value = data.next_after_offset; logHasMore.value = data.has_more
  } catch (e) { if (current === revision) logError.value = errorMessage(e) }
  finally { if (current === revision) logBusy.value = false }
}
async function loadMetrics() {
  if (!active.value || metricBusy.value) return
  const current = revision; const id = active.value.id; metricBusy.value = true
  try {
    const data = await api.trainingMetrics(id, cursor.value)
    if (current !== revision || active.value?.id !== id) return
    metrics.value.push(...data.items); cursor.value = data.next_after_id; hasMore.value = data.has_more
  } catch (e) { if (current === revision) detailError.value = errorMessage(e); throw e }
  finally { if (current === revision) metricBusy.value = false }
}
async function refresh() {
  if (!active.value || refreshing.value) return
  const current = revision; const id = active.value.id; refreshing.value = true; detailError.value = ''
  try {
    const task = await api.trainingTask(id)
    if (current !== revision) return
    active.value = task
    await loadMetrics()
    if (current !== revision) return
    await loadLogs()
    if (current !== revision) return
    const files = await api.trainingArtifacts(id)
    if (current !== revision) return
    artifacts.value = files
    rows.value = rows.value.map(row => row.id === task.id ? task : row)
    if (running(task)) poller.start(); else poller.stop()
  } catch (e) { if (current === revision) detailError.value = errorMessage(e); throw e }
  finally { if (current === revision) refreshing.value = false }
}
async function select(id = manualId.value) {
  if (!id.trim()) { detailError.value = '请输入任务 ID'; return }
  poller.stop(); revision++; active.value = null; metrics.value = []; artifacts.value = []; cursor.value = 0; hasMore.value = false; refreshing.value = false; metricBusy.value = false; clearLogs()
  const current = revision; detailError.value = ''
  try {
    const task = await api.trainingTask(id.trim())
    if (current !== revision) return
    active.value = task; manualId.value = task.id; await refresh()
  } catch (e) { if (current === revision) detailError.value = errorMessage(e) }
}
async function create() {
  if (busy.value) return
  error.value = ''
  if (!session.bearer.value || !session.admin.value) { error.value = '创建训练任务需要同时录入访问令牌和管理员密钥'; return }
  const current = revision
  const creation = ++creationRevision
  try {
    if (mode.value === 'script') {
      if (!scriptName.value.trim() || scriptName.value.trim().length > 100 || !selectedScript.value) throw new Error('请填写任务名称（最多 100 字）并选择已登记脚本')
      const input = { name: scriptName.value.trim(), script_id: selectedScript.value.id, inputs: jsonObject(scriptInputs.value, '脚本输入'), parameters: jsonObject(scriptParameters.value, '脚本参数') }
      busy.value = true
      const task = await api.createScriptTraining(input)
      if (current !== revision) return
      ElMessage.success('脚本任务已提交'); page.value = 1; await loadList(); if (current === revision) await select(task.id)
      return
    }
    if (!form.value.name.trim() || form.value.name.trim().length > 100 || !Number.isInteger(form.value.dataset_id) || form.value.dataset_id < 1 || !form.value.version_id.trim() || !source.value.trim()) throw new Error('请填写任务名称（最多 100 字）、数据集 ID、版本和 Python 源码')
    const tensors = jsonObject(contract.value, '张量契约')
    if (!tensors.inputs || !tensors.targets || !tensors.outputs) throw new Error('张量契约须包含 inputs、targets 和 outputs')
    const input: TrainingInput = { ...jsonObject(advanced.value, '高级参数'), ...form.value, name: form.value.name.trim(), version_id: form.value.version_id.trim(), python_source: source.value, contract: tensors as TensorContract }
    busy.value = true
    const task = await api.createTraining(input)
    if (current !== revision) return
    ElMessage.success('训练任务已提交'); page.value = 1; await loadList(); if (current === revision) await select(task.id)
  } catch (e) { if (current === revision) error.value = errorMessage(e) }
  finally { if (creation === creationRevision) busy.value = false }
}
async function cancel() {
  if (!active.value) return
  const id = active.value.id; const current = revision
  try { await ElMessageBox.confirm('确定取消此训练任务？已完成的训练不会继续执行。', '取消训练', { confirmButtonText: '确认取消', cancelButtonText: '返回' }) } catch { return }
  if (current !== revision) return
  try { const task = await api.cancelTraining(id); if (current === revision) { active.value = task; await refresh() } } catch (e) { if (current === revision) detailError.value = errorMessage(e) }
}
async function download(file: TrainingArtifact) {
  if (!active.value) return
  const current = revision
  try { const blob = await api.downloadTraining(active.value.id, file.id); if (current === revision) saveFile(blob, file.filename) } catch (e) { if (current === revision) detailError.value = errorMessage(e) }
}
function clearLogs() { logs.value = ''; logCursor.value = 0; logHasMore.value = false; logBusy.value = false; logError.value = ''; logLimit.value = 65536 }
function reset() { revision++; creationRevision++; busy.value = false; poller.stop(); rows.value = []; total.value = 0; page.value = 1; active.value = null; manualId.value = ''; metrics.value = []; artifacts.value = []; defaults.value = null; scripts.value = []; scriptId.value = ''; clearLogs(); refreshing.value = false; metricBusy.value = false; error.value = ''; detailError.value = '' }
watch(session.bearerRevision, () => { reset(); void load() })
onMounted(load)
onBeforeUnmount(() => { revision++; poller.stop() })
</script>
<template>
  <div class="page-header"><div><h1>模型训练</h1><p class="muted">提交源码训练或登记脚本任务，查看进度、指标、日志与产物。</p></div><el-button @click="load">刷新列表与选项</el-button></div>
  <div class="section"><div class="section-header"><h2>新建训练任务</h2><el-radio-group v-model="mode" :disabled="busy"><el-radio-button value="source">PyTorch 源码</el-radio-button><el-radio-button value="script">登记脚本</el-radio-button></el-radio-group></div>
    <template v-if="mode === 'source'">
    <div class="row"><el-button :disabled="!defaults" @click="useExample()">载入分类示例</el-button><el-button :disabled="!defaults" @click="useExample(true)">载入自定义损失示例</el-button></div>
    <p class="warning">Python 源码将在训练服务器执行，仅提交可信代码。创建需要访问令牌及管理员密钥；数据集 ID 和版本须对应实际业务数据。</p>
    <div class="form-grid">
      <div class="field"><label>任务名称</label><el-input v-model="form.name" :maxlength="100" /></div><div class="field"><label>数据集 ID</label><el-input-number v-model="form.dataset_id" :min="1" :precision="0" /></div>
      <div class="field"><label>数据集版本</label><el-input v-model="form.version_id" /></div><div class="field"><label>任务类型</label><el-select v-model="form.task_type"><el-option v-for="value in defaults?.supported.task_types || ['multiclass', 'binary', 'multilabel', 'regression', 'custom']" :key="value" :value="value" :label="value" /></el-select></div>
      <div class="field"><label>训练轮数</label><el-input-number v-model="form.epochs" :min="1" :precision="0" /></div><div class="field"><label>批大小</label><el-input-number v-model="form.batch_size" :min="1" :precision="0" /></div><div class="field"><label>学习率</label><el-input-number v-model="form.learning_rate" :min="0.00000001" :step="0.0001" :precision="8" /></div>
      <div class="field full"><label>Python 源码</label><el-input v-model="source" type="textarea" :rows="12" placeholder="可先载入服务端示例，再按业务数据修改 build_model 和 build_dataset" /></div>
      <div class="field"><label>张量契约 JSON</label><el-input v-model="contract" type="textarea" :rows="9" /></div><div class="field"><label>高级训练参数 JSON</label><el-input v-model="advanced" type="textarea" :rows="9" /><p class="field-hint">可配置 device、seed、optimizer、scheduler、loss、metrics，以及 model_params、data_params 等参数。上方表单字段优先。</p></div>
    </div>
    <el-collapse v-if="defaults"><el-collapse-item title="查看服务端支持选项与业务记录示例"><pre class="pre">{{ JSON.stringify({ supported: defaults.supported, example_record: defaults.example_record }, null, 2) }}</pre></el-collapse-item></el-collapse>
    </template>
    <template v-else>
      <p class="muted">“登记脚本”是服务器已安装并允许执行的训练程序。选择后填写参数即可，无需编写 Python。</p>
      <ol class="field-hint"><li>在右上角“会话凭据”录入访问令牌和管理员密钥。</li><li>选择脚本、给本次实验起名；参数会自动填入服务端默认值，可按需修改。</li><li>提交后在下方任务列表点“查看”，查看状态、指标、日志和下载产物。</li></ol>
      <p class="muted">日志和指标由脚本自动上报，无需填写；页面不会自动补算脚本未报告的指标。</p>
      <p v-if="scriptError" class="error">{{ scriptError }}</p>
      <div class="form-grid" style="margin-top:16px">
        <div class="field"><label>任务名称</label><el-input v-model="scriptName" placeholder="脚本任务名称" :maxlength="100" /><p class="field-hint">用于区分实验，例如“CIFAR-100 一轮试跑”。</p></div>
        <div class="field"><label>登记脚本</label><el-select v-model="scriptId" placeholder="选择服务端登记脚本"><el-option v-for="item in scripts" :key="item.id" :value="item.id" :label="`${item.name}（${item.id}）`" /></el-select></div>
        <div class="full"><p v-if="selectedScript" class="muted">{{ selectedScript.description }}</p><el-button :disabled="!selectedScript" @click="useScriptDefaults">载入脚本默认参数</el-button></div>
      </div>
      <CifarTrainingFields v-if="selectedScript?.id === 'cifar100-cnn'" v-model:inputs="scriptInputs" v-model:parameters="scriptParameters" :parameters-schema="selectedScript.parameters_schema" />
      <p v-if="!selectedScript" class="field-hint">请先选择脚本；脚本列表为空时，请检查访问令牌或联系管理员安装并登记脚本。</p>
      <el-collapse><el-collapse-item :title="selectedScript?.id === 'cifar100-cnn' ? '高级 JSON 编辑（与上方表单同步）' : '脚本输入与参数 JSON'">
        <p class="field-hint">输入决定数据来源，参数决定运行方式。两者都须为 JSON 对象；{} 表示使用服务端默认值。修改 JSON 会同步到上方表单，字段要求可查看下方定义。</p>
        <div class="form-grid"><div class="field"><label>脚本输入 JSON</label><el-input v-model="scriptInputs" type="textarea" :rows="8" /></div><div class="field"><label>脚本参数 JSON</label><el-input v-model="scriptParameters" type="textarea" :rows="8" /></div></div>
      </el-collapse-item></el-collapse>
      <p class="field-hint">提交会真正执行服务器脚本；默认参数也需要相应数据、设备和运行环境。</p>
      <el-collapse v-if="selectedScript"><el-collapse-item title="查看脚本输入与参数定义"><pre class="pre">{{ JSON.stringify({ inputs: selectedScript.inputs_schema, parameters: selectedScript.parameters_schema }, null, 2) }}</pre></el-collapse-item></el-collapse>
    </template>
    <p v-if="error" class="error">{{ error }}</p><div class="row end"><el-button type="primary" :loading="busy" @click="create">提交训练任务</el-button></div>
  </div>
  <div class="section"><h2>当前令牌的训练任务</h2><el-table :data="rows" empty-text="暂无训练任务"><el-table-column prop="name" label="名称" min-width="150" /><el-table-column prop="id" label="任务 ID" min-width="230" /><el-table-column label="状态" width="100"><template #default="{ row }">{{ statuses[row.status] || row.status }}</template></el-table-column><el-table-column prop="progress" label="进度 %" width="100" /><el-table-column prop="created_at" label="创建时间" min-width="175" /><el-table-column label="详情" width="90"><template #default="{ row }"><el-button link type="primary" @click="select(row.id)">查看</el-button></template></el-table-column></el-table><el-pagination layout="prev, pager, next, total" :current-page="page" :page-size="20" :total="total" @current-change="(value: number) => { page = value; loadList() }" /></div>
  <div class="section"><h2>任务状态、指标与产物</h2><div class="toolbar"><el-input v-model="manualId" placeholder="输入训练任务 ID" /><el-button @click="select()">按 ID 查询</el-button><el-button v-if="active" :loading="refreshing" @click="refresh().catch(() => {})">刷新详情</el-button><el-button v-if="active && ['pending','running'].includes(active.status)" type="danger" plain @click="cancel">取消任务</el-button></div>
    <p class="field-hint">选择任务后，指标历史按脚本上报的名称展示；运行日志只追加新输出。运行中随任务状态自动刷新，也可手动加载更多；读取日志和指标不会重新执行训练。</p>
    <p v-if="detailError" class="error">{{ detailError }}</p>
    <template v-if="active"><p>{{ active.name }} · {{ active.runner === 'script' ? `登记脚本 ${active.script_id}` : 'PyTorch 源码' }} · {{ statuses[active.status] }} · <span v-if="active.epoch != null">第 {{ active.epoch }} 轮 · </span><span v-if="active.step != null">第 {{ active.step }} 步 · </span>{{ active.elapsed ?? `${active.elapsed_seconds} 秒` }}</p><el-progress v-if="active.progress != null" :percentage="active.progress" /><p v-else class="muted">未上报进度</p><p v-if="active.error_message" class="error">{{ active.error_message }}</p><div class="metric-row"><div v-for="(value, key) in active.latest_metrics" :key="key" class="metric"><strong>{{ value ?? '—' }}</strong><span>{{ key }}</span></div></div>
      <h3>增量指标</h3><el-table :data="metrics" max-height="350" empty-text="暂无指标"><el-table-column prop="epoch" label="轮数" width="80" /><el-table-column prop="step" label="步数" width="90" /><el-table-column prop="phase" label="阶段" width="110" /><el-table-column v-for="key in metricKeys" :key="key" :label="key" min-width="110"><template #default="{ row }">{{ row.metrics[key] ?? '—' }}</template></el-table-column></el-table><el-button v-if="hasMore" :loading="metricBusy" @click="loadMetrics().catch(() => {})">加载更多指标</el-button>
      <h3 style="margin-top:20px">控制台日志</h3><div class="toolbar"><el-select v-model="logLimit" aria-label="日志读取字节上限" style="width:180px"><el-option v-for="size in [65536, 262144, 1048576]" :key="size" :value="size" :label="`每次 ${size / 1024} KiB`" /></el-select><el-button :loading="logBusy" @click="loadLogs">刷新日志</el-button><el-button v-if="logHasMore" :loading="logBusy" @click="loadLogs">加载更多日志</el-button></div>
      <p v-if="logError" class="error">{{ logError }}</p><pre class="pre training-log">{{ logs || '暂无日志' }}</pre><p class="field-hint">日志按服务端字节游标增量读取。若单行过长，可增大每次读取预算再重试。</p>
      <h3 style="margin-top:20px">训练产物</h3><el-table :data="artifacts" empty-text="暂无产物"><el-table-column prop="filename" label="文件名" min-width="180" /><el-table-column prop="kind" label="类型" width="100" /><el-table-column prop="size" label="大小（字节）" width="130" /><el-table-column prop="sha256" label="SHA256" min-width="220" show-overflow-tooltip /><el-table-column label="下载" width="90"><template #default="{ row }"><el-button link type="primary" @click="download(row)">下载</el-button></template></el-table-column></el-table>
      <el-collapse><el-collapse-item title="查看任务配置与运行环境"><pre class="pre">{{ JSON.stringify({ config: active.config, runtime: active.runtime }, null, 2) }}</pre></el-collapse-item></el-collapse>
    </template>
  </div>
</template>
