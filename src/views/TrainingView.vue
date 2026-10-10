<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '@/api'
import { errorMessage } from '@/api/client'
import { session } from '@/stores/session'
import type { TensorContract, TrainingArtifact, TrainingDefaults, TrainingInput, TrainingMetric, TrainingTask } from '@/types/api'
import { jsonObject } from '@/utils/analysis'
import { saveFile } from '@/utils/download'
import { createTaskPoller } from '@/utils/polling'

const defaults = ref<TrainingDefaults | null>(null)
const form = ref({ name: '', dataset_id: 1, version_id: '', epochs: 10, batch_size: 8, learning_rate: 0.0002, task_type: 'multiclass' })
const source = ref('')
const contract = ref('{}')
const advanced = ref('{}')
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
let revision = 0
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
async function loadList() {
  const current = revision
  try { const data = await api.trainingTasks(page.value, 20); if (current === revision) { rows.value = data.items; total.value = data.total } }
  catch (e) { if (current === revision) error.value = errorMessage(e) }
}
async function load() {
  error.value = ''; const current = revision
  const results = await Promise.allSettled([api.trainingDefaults(), loadList()])
  if (current !== revision) return
  if (results[0].status === 'fulfilled') { defaults.value = results[0].value } else error.value = errorMessage(results[0].reason)
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
  poller.stop(); revision++; active.value = null; metrics.value = []; artifacts.value = []; cursor.value = 0; hasMore.value = false; refreshing.value = false; metricBusy.value = false
  const current = revision; detailError.value = ''
  try {
    const task = await api.trainingTask(id.trim())
    if (current !== revision) return
    active.value = task; manualId.value = task.id; await refresh()
  } catch (e) { if (current === revision) detailError.value = errorMessage(e) }
}
async function create() {
  error.value = ''
  if (!session.bearer.value || !session.admin.value) { error.value = '创建训练任务需要同时录入访问令牌和管理员密钥'; return }
  const current = revision
  try {
    if (!form.value.name.trim() || form.value.name.trim().length > 100 || !Number.isInteger(form.value.dataset_id) || form.value.dataset_id < 1 || !form.value.version_id.trim() || !source.value.trim()) throw new Error('请填写任务名称（最多 100 字）、数据集 ID、版本和 Python 源码')
    const tensors = jsonObject(contract.value, '张量契约')
    if (!tensors.inputs || !tensors.targets || !tensors.outputs) throw new Error('张量契约须包含 inputs、targets 和 outputs')
    const input: TrainingInput = { ...jsonObject(advanced.value, '高级参数'), ...form.value, name: form.value.name.trim(), version_id: form.value.version_id.trim(), python_source: source.value, contract: tensors as TensorContract }
    busy.value = true
    const task = await api.createTraining(input)
    if (current !== revision) return
    ElMessage.success('训练任务已提交'); page.value = 1; await loadList(); await select(task.id)
  } catch (e) { if (current === revision) error.value = errorMessage(e) }
  finally { busy.value = false }
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
function reset() { revision++; poller.stop(); rows.value = []; total.value = 0; page.value = 1; active.value = null; manualId.value = ''; metrics.value = []; artifacts.value = []; defaults.value = null; refreshing.value = false; metricBusy.value = false; error.value = ''; detailError.value = '' }
watch(session.bearerRevision, () => { reset(); void load() })
onMounted(load)
onBeforeUnmount(() => { revision++; poller.stop() })
</script>
<template>
  <div class="page-header"><div><h1>模型训练</h1><p class="muted">提交自定义 PyTorch 训练，查看进度、训练指标与产物。</p></div><el-button @click="load">刷新列表与选项</el-button></div>
  <div class="section"><div class="section-header"><h2>新建训练任务</h2><div class="row"><el-button :disabled="!defaults" @click="useExample()">载入分类示例</el-button><el-button :disabled="!defaults" @click="useExample(true)">载入自定义损失示例</el-button></div></div>
    <p class="warning">Python 源码将在训练服务器执行，仅提交可信代码。创建需要访问令牌及管理员密钥；数据集 ID 和版本须对应实际业务数据。</p>
    <div class="form-grid">
      <div class="field"><label>任务名称</label><el-input v-model="form.name" :maxlength="100" /></div><div class="field"><label>数据集 ID</label><el-input-number v-model="form.dataset_id" :min="1" :precision="0" /></div>
      <div class="field"><label>数据集版本</label><el-input v-model="form.version_id" /></div><div class="field"><label>任务类型</label><el-select v-model="form.task_type"><el-option v-for="value in defaults?.supported.task_types || ['multiclass', 'binary', 'multilabel', 'regression', 'custom']" :key="value" :value="value" :label="value" /></el-select></div>
      <div class="field"><label>训练轮数</label><el-input-number v-model="form.epochs" :min="1" :precision="0" /></div><div class="field"><label>批大小</label><el-input-number v-model="form.batch_size" :min="1" :precision="0" /></div><div class="field"><label>学习率</label><el-input-number v-model="form.learning_rate" :min="0.00000001" :step="0.0001" :precision="8" /></div>
      <div class="field full"><label>Python 源码</label><el-input v-model="source" type="textarea" :rows="12" placeholder="可先载入服务端示例，再按业务数据修改 build_model 和 build_dataset" /></div>
      <div class="field"><label>张量契约 JSON</label><el-input v-model="contract" type="textarea" :rows="9" /></div><div class="field"><label>高级训练参数 JSON</label><el-input v-model="advanced" type="textarea" :rows="9" /><p class="field-hint">可配置 device、seed、optimizer、scheduler、loss、metrics，以及 model_params、data_params 等参数。上方表单字段优先。</p></div>
    </div>
    <el-collapse v-if="defaults"><el-collapse-item title="查看服务端支持选项与业务记录示例"><pre class="pre">{{ JSON.stringify({ supported: defaults.supported, example_record: defaults.example_record }, null, 2) }}</pre></el-collapse-item></el-collapse>
    <p v-if="error" class="error">{{ error }}</p><div class="row end"><el-button type="primary" :loading="busy" @click="create">提交训练任务</el-button></div>
  </div>
  <div class="section"><h2>当前令牌的训练任务</h2><el-table :data="rows" empty-text="暂无训练任务"><el-table-column prop="name" label="名称" min-width="150" /><el-table-column prop="id" label="任务 ID" min-width="230" /><el-table-column label="状态" width="100"><template #default="{ row }">{{ statuses[row.status] || row.status }}</template></el-table-column><el-table-column prop="progress" label="进度 %" width="100" /><el-table-column prop="created_at" label="创建时间" min-width="175" /><el-table-column label="详情" width="90"><template #default="{ row }"><el-button link type="primary" @click="select(row.id)">查看</el-button></template></el-table-column></el-table><el-pagination layout="prev, pager, next, total" :current-page="page" :page-size="20" :total="total" @current-change="(value: number) => { page = value; loadList() }" /></div>
  <div class="section"><h2>任务状态、指标与产物</h2><div class="toolbar"><el-input v-model="manualId" placeholder="输入训练任务 ID" /><el-button @click="select()">按 ID 查询</el-button><el-button v-if="active" :loading="refreshing" @click="refresh().catch(() => {})">刷新详情</el-button><el-button v-if="active && ['pending','running'].includes(active.status)" type="danger" plain @click="cancel">取消任务</el-button></div>
    <p v-if="detailError" class="error">{{ detailError }}</p>
    <template v-if="active"><p>{{ active.name }} · {{ statuses[active.status] }} · 第 {{ active.epoch }} 轮 / 第 {{ active.step }} 步 · {{ active.elapsed }}</p><el-progress :percentage="active.progress" /><p v-if="active.error_message" class="error">{{ active.error_message }}</p><div class="metric-row"><div v-for="(value, key) in active.latest_metrics" :key="key" class="metric"><strong>{{ value ?? '—' }}</strong><span>{{ key }}</span></div></div>
      <h3>增量指标</h3><el-table :data="metrics" max-height="350" empty-text="暂无指标"><el-table-column prop="epoch" label="轮数" width="80" /><el-table-column prop="step" label="步数" width="90" /><el-table-column prop="phase" label="阶段" width="110" /><el-table-column v-for="key in ['loss', 'train_loss', 'accuracy', 'precision', 'recall', 'f1']" :key="key" :prop="`metrics.${key}`" :label="key" min-width="110" /></el-table><el-button v-if="hasMore" :loading="metricBusy" @click="loadMetrics().catch(() => {})">加载更多指标</el-button>
      <h3 style="margin-top:20px">训练产物</h3><el-table :data="artifacts" empty-text="暂无产物"><el-table-column prop="filename" label="文件名" min-width="180" /><el-table-column prop="kind" label="类型" width="100" /><el-table-column prop="size" label="大小（字节）" width="130" /><el-table-column prop="sha256" label="SHA256" min-width="220" show-overflow-tooltip /><el-table-column label="下载" width="90"><template #default="{ row }"><el-button link type="primary" @click="download(row)">下载</el-button></template></el-table-column></el-table>
      <el-collapse><el-collapse-item title="查看任务配置与运行环境"><pre class="pre">{{ JSON.stringify({ config: active.config, runtime: active.runtime }, null, 2) }}</pre></el-collapse-item></el-collapse>
    </template>
  </div>
</template>
