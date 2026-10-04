<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api, taskId } from '@/api'
import { ApiError, errorMessage } from '@/api/client'
import ScopeFields from '@/components/ScopeFields.vue'
import TaskBadge from '@/components/TaskBadge.vue'
import { session } from '@/stores/session'
import type { Kind, Page, ResultSample, ResultSummary, Scope, Task, TaskCreate } from '@/types/api'
import { required, taskPayload, validScope } from '@/utils/forms'
import { createTaskPoller, shouldPoll } from '@/utils/polling'

const route = useRoute()
const area = computed(() => route.params.area as string)
const kind = computed<Kind>(() => area.value === 'anomaly' ? 'governance-anomaly' : area.value === 'risk' ? 'governance-risk' : 'governance-value')
const label = computed(() => ({ value: '价值分析', anomaly: '异常治理', risk: '风险分级' })[area.value] || '价值分析')
const schemes = computed(() => area.value === 'value' ? ['general-v1', 'general-v2'] : area.value === 'anomaly' ? ['anomaly-basic-v1'] : ['risk-v1'])
const tab = ref('tasks')
const scope = ref<Scope>({ dataset_id: 0, version_id: '', language: 'zh', scheme_id: 'general-v1' })
const name = ref('')
const activeTask = ref<Task | null>(null)
const manualId = ref('')
const taskRows = ref<Task[]>([])
const taskPage = ref(1)
const taskTotal = ref(0)
const recentIds = ref<string[]>([])
const original = ref<Record<string, TaskCreate>>({})
const summary = ref<ResultSummary | null>(null)
const histories = ref<ResultSummary[]>([])
const resultId = ref('')
const samples = ref<Page<ResultSample> | null>(null)
const sampleDetail = ref<ResultSample | null>(null)
const samplePage = ref(1)
const pageSize = ref(10)
const tier = ref('all')
const keyword = ref('')
const bin = ref('')
const sortBy = ref('')
const sortOrder = ref('')
const anomalyType = ref('')
const level = ref('')
const sampleStatus = ref('')
const error = ref('')
const busy = ref(false)
const poller = createTaskPoller(async () => {
  if (!activeTask.value) return 'failed'
  const id = taskId(activeTask.value)
  const revision = session.bearerRevision.value
  try {
    const task = await api.task(kind.value, id)
    if (revision !== session.bearerRevision.value || !activeTask.value || taskId(activeTask.value) !== id) return 'failed'
    activeTask.value = task
    if (task.status === 'failed') error.value = task.error_message || '任务失败'
    return task.status
  } catch (e) { error.value = e instanceof ApiError && e.status === 404 ? '任务不存在，或不属于当前访问令牌' : errorMessage(e); throw e }
})

function persistRecent() { sessionStorage.setItem('cs-recent-tasks', JSON.stringify({ ids: recentIds.value, original: original.value })) }
function restoreRecent() { try { const stored = JSON.parse(sessionStorage.getItem('cs-recent-tasks') || '{}') as { ids?: string[]; original?: Record<string, TaskCreate> }; recentIds.value = stored.ids || []; original.value = stored.original || {} } catch { recentIds.value = []; original.value = {} } }
function reset() { poller.stop(); scope.value = { dataset_id: 0, version_id: '', language: 'zh', scheme_id: schemes.value[0] || '' }; name.value = ''; activeTask.value = null; manualId.value = ''; taskRows.value = []; taskPage.value = 1; taskTotal.value = 0; summary.value = null; histories.value = []; resultId.value = ''; samples.value = null; sampleDetail.value = null; error.value = ''; restoreRecent() }
watch(area, reset, { immediate: true })
watch(scope, () => { summary.value = null; histories.value = []; samples.value = null; sampleDetail.value = null; taskRows.value = [] }, { deep: true })
watch(session.bearerRevision, () => { poller.stop(); activeTask.value = null; taskRows.value = []; summary.value = null; histories.value = []; samples.value = null; recentIds.value = []; original.value = {}; sessionStorage.removeItem('cs-recent-tasks'); error.value = '访问令牌已更换。原任务可能因令牌隔离而无法查询。' })
onBeforeUnmount(() => poller.stop())

async function create() {
  if (!required(name.value) || !validScope(scope.value)) { error.value = '请填写任务名称与完整范围；数据集 ID 至少为 1'; return }
  busy.value = true; error.value = ''; poller.stop()
  const payload = taskPayload(kind.value, name.value, scope.value)
  try {
    const task = await api.createTask(payload)
    const id = taskId(task)
    activeTask.value = task; manualId.value = id
    original.value[id] = payload; recentIds.value = [id, ...recentIds.value.filter(item => item !== id)].slice(0, 20); persistRecent()
    if (shouldPoll(task.status)) poller.start()
    ElMessage.success('任务已提交，状态：等待中')
    if (kind.value === 'governance-value') await loadValueTasks()
  } catch (e) { error.value = errorMessage(e) } finally { busy.value = false }
}
async function recreate() { if (!activeTask.value) return; const payload = original.value[taskId(activeTask.value)]; if (!payload) return; name.value = payload.name; scope.value = { ...payload.input }; await create() }
async function queryTask(id = manualId.value) {
  if (!required(id)) { error.value = '请输入任务 ID'; return }
  poller.stop(); error.value = ''
  try { const task = await api.task(kind.value, id.trim()); activeTask.value = task; manualId.value = id.trim(); if (task.status === 'failed') error.value = task.error_message || '任务失败'; if (shouldPoll(task.status)) poller.start() }
  catch (e) { error.value = e instanceof ApiError && e.status === 404 ? '任务不存在，或不属于当前访问令牌' : errorMessage(e); activeTask.value = null }
}
async function loadValueTasks() {
  if (!validScope(scope.value)) { error.value = '查询价值任务列表需要完整四元组范围'; return }
  error.value = ''
  try { const page = await api.valueTasks(scope.value, taskPage.value, 20); taskRows.value = page.items; taskTotal.value = page.total } catch (e) { error.value = errorMessage(e) }
}
async function loadLatest() {
  if (!validScope(scope.value)) { error.value = '查询最新结果需要完整四元组范围'; return }
  error.value = ''; summary.value = null; samples.value = null; sampleDetail.value = null
  try { summary.value = await api.latestResult(kind.value, scope.value); resultId.value = summary.value?.id || ''; if (summary.value) await loadSamples() } catch (e) { error.value = errorMessage(e) }
}
async function loadHistory() {
  if (!validScope(scope.value)) { error.value = '查询历史结果需要完整四元组范围'; return }
  if (kind.value === 'governance-value') return
  try { histories.value = await api.resultHistory(kind.value, scope.value) } catch (e) { error.value = errorMessage(e) }
}
async function loadResult(id = resultId.value) {
  if (!required(id)) { error.value = '请输入结果 ID'; return }
  error.value = ''; samplePage.value = 1; sampleDetail.value = null
  try { summary.value = await api.result(kind.value, id.trim()); resultId.value = id.trim(); await loadSamples() } catch (e) { error.value = e instanceof ApiError && e.status === 404 ? '结果不存在，或不属于当前访问令牌' : errorMessage(e) }
}
async function loadSamples() {
  if (!resultId.value) return
  const params: Record<string, string | number | undefined> = { page: samplePage.value, page_size: pageSize.value, keyword: keyword.value }
  if (kind.value === 'governance-value') { params.tier = tier.value; params.bin = bin.value; if (sortBy.value && sortOrder.value) { params.sort_by = sortBy.value; params.sort_order = sortOrder.value } }
  if (kind.value === 'governance-anomaly') { params.type = anomalyType.value; params.status = sampleStatus.value }
  if (kind.value === 'governance-risk') { params.level = level.value; params.status = sampleStatus.value; if (sortBy.value && sortOrder.value) { params.sort_by = sortBy.value; params.sort_order = sortOrder.value } }
  try { samples.value = await api.samples(kind.value, resultId.value, params) } catch (e) { error.value = errorMessage(e) }
}
async function loadSample(id: string) { if (kind.value === 'governance-value') return; try { sampleDetail.value = await api.sample(kind.value, resultId.value, id) } catch (e) { error.value = errorMessage(e) } }
function setResultFromTask() { if (activeTask.value?.result_id) { resultId.value = activeTask.value.result_id; tab.value = 'results'; loadResult() } }
function field(key: string): unknown { return summary.value?.[key] }
function list(key: string): Record<string, unknown>[] { const value = field(key); return Array.isArray(value) ? value as Record<string, unknown>[] : [] }
function applyFilters() { samplePage.value = 1; loadSamples() }
</script>
<template>
  <div class="page-header"><div><h1>{{ label }}</h1><p class="muted">数据集 ID 和当前版本由操作者填写；任务按创建时的 Bearer 令牌隔离。</p></div></div>
  <div class="section"><h2>数据集与方案范围</h2><ScopeFields v-model="scope" :schemes="schemes" /><p class="field-hint">此服务没有数据集目录或选项接口。语种保留在查询范围中，目前不筛选业务库记录。</p></div>
  <el-tabs v-model="tab">
    <el-tab-pane label="任务" name="tasks">
      <div class="section"><h2>新建验证任务</h2><p class="muted">只提交任务类型、名称和上方四元组范围。模型和样本由后端读取。</p><div class="field" style="margin:16px 0;max-width:450px"><label>任务名称</label><el-input v-model="name" placeholder="输入本次任务名称" /></div><el-button type="primary" :loading="busy" @click="create">创建任务</el-button><p class="field-hint">创建后立即显示等待中；worker 为独立进程，本页面不能启动或查看其进程状态。</p></div>
      <div class="section"><div class="section-header"><h2>查询任务状态</h2><TaskBadge v-if="activeTask" :status="activeTask.status" /></div><div class="toolbar"><el-input v-model="manualId" placeholder="输入任务 ID" style="width:390px;max-width:100%" /><el-button @click="queryTask()">按 ID 查询</el-button><el-select v-if="kind !== 'governance-value'" placeholder="本会话最近提交" clearable style="width:260px" @change="(value: string) => { if (value) queryTask(value) }"><el-option v-for="id in recentIds.filter(id => original[id]?.kind === kind)" :key="id" :label="id" :value="id" /></el-select></div><template v-if="activeTask"><dl class="detail-list"><dt>任务 ID</dt><dd class="mono">{{ taskId(activeTask) }}</dd><dt>状态</dt><dd><TaskBadge :status="activeTask.status" /></dd><dt>创建时间</dt><dd>{{ activeTask.created_at }}</dd><dt>结果 ID</dt><dd class="mono">{{ activeTask.result_id || '尚无结果' }}</dd><template v-if="activeTask.coverage !== undefined"><dt>已处理样本</dt><dd>{{ activeTask.coverage }}</dd></template><template v-if="activeTask.error_message"><dt>失败原因</dt><dd class="error">{{ activeTask.error_message }}</dd></template></dl><div class="row" style="margin-top:16px"><el-button v-if="activeTask.result_id" type="primary" @click="setResultFromTask">查看只读结果</el-button><el-button v-if="activeTask.status === 'failed' && original[taskId(activeTask)]" @click="recreate">按原参数新建任务</el-button></div></template><p v-else class="muted">输入任务 ID 查询；换令牌后原任务可能返回 404。</p></div>
      <div v-if="kind === 'governance-value'" class="section"><div class="section-header"><h2>当前范围的价值任务</h2><el-button @click="taskPage = 1; loadValueTasks()">查询列表</el-button></div><el-table :data="taskRows" empty-text="请填写完整范围后查询" class="data-table"><el-table-column prop="task_id" label="任务 ID" min-width="225"><template #default="{ row }"><span class="mono">{{ row.task_id }}</span></template></el-table-column><el-table-column prop="name" label="名称" min-width="150" /><el-table-column label="状态" width="105"><template #default="{ row }"><TaskBadge :status="row.status" /></template></el-table-column><el-table-column prop="created_at" label="创建时间" min-width="175" /><el-table-column label="操作" width="100"><template #default="{ row }"><el-button link type="primary" @click="queryTask(row.task_id)">查看</el-button></template></el-table-column></el-table><el-pagination style="margin-top:16px;justify-content:flex-end" background layout="prev, pager, next, total" :current-page="taskPage" :page-size="20" :total="taskTotal" @current-change="(value: number) => { taskPage = value; loadValueTasks() }" /></div>
      <p v-else class="muted" style="margin-bottom:18px">当前接口没有{{ label }}任务列表；仅支持输入 ID 或查看本会话最近提交的任务。</p>
    </el-tab-pane>
    <el-tab-pane label="只读结果" name="results">
      <div class="section"><div class="section-header"><h2>结果查询</h2><div class="row"><el-button @click="loadLatest">查询当前范围最新结果</el-button><el-button v-if="kind !== 'governance-value'" @click="loadHistory">查询历史</el-button></div></div><div class="toolbar"><el-input v-model="resultId" placeholder="输入结果 ID" style="width:390px;max-width:100%" /><el-button @click="loadResult()">按 ID 查看</el-button></div><el-empty v-if="!summary && !error" description="尚未查询结果，或当前范围没有已完成结果" :image-size="70" /><template v-if="histories.length"><h3>历史结果</h3><el-table :data="histories" size="small"><el-table-column prop="id" label="结果 ID" min-width="230" /><el-table-column prop="dataset_name" label="数据集" min-width="140" /><el-table-column prop="finished_at" label="完成时间" min-width="175" /><el-table-column label="操作" width="80"><template #default="{ row }"><el-button link type="primary" @click="loadResult(row.id)">查看</el-button></template></el-table-column></el-table></template></div>
      <div v-if="summary" class="section"><div class="section-header"><h2>结果汇总 · {{ summary.dataset_name }}</h2><span class="muted">{{ summary.finished_at }}</span></div><p class="mono muted">结果 ID：{{ summary.id }} · 任务 ID：{{ summary.task_id }}</p>
        <div v-if="kind === 'governance-value'" class="metric-row"><div v-for="item in [{ key:'mean_score', label:'均分' },{ key:'valid_count', label:'有效' },{ key:'unavailable_count', label:'不可评估' },{ key:'failed_count', label:'失败' }]" :key="item.key" class="metric"><strong>{{ field(item.key) ?? '—' }}</strong><span>{{ item.label }}</span></div></div>
        <div v-else-if="kind === 'governance-anomaly'" class="metric-row"><div v-for="item in [{ key:'anomaly_count', label:'异常样本' },{ key:'valid_count', label:'有效' },{ key:'unavailable_count', label:'不可评估' },{ key:'failed_count', label:'失败' }]" :key="item.key" class="metric"><strong>{{ field(item.key) ?? '—' }}</strong><span>{{ item.label }}</span></div></div>
        <div v-else class="metric-row"><div v-for="item in [{ key:'risk_count', label:'风险样本' },{ key:'valid_count', label:'有效' },{ key:'unassessable_count', label:'无法评估' },{ key:'failed_count', label:'失败' }]" :key="item.key" class="metric"><strong>{{ field(item.key) ?? '—' }}</strong><span>{{ item.label }}</span></div></div>
        <template v-if="kind === 'governance-value'"><h3>五维评分</h3><el-table :data="list('dimensions')" size="small" empty-text="无有效样本评分"><el-table-column prop="name" label="维度" /><el-table-column prop="score" label="均分" /><el-table-column prop="reason" label="说明" /></el-table><h3 style="margin-top:20px">分数区间</h3><div class="row"><el-tag v-for="item in list('bins')" :key="String(item.id)" effect="plain">{{ item.label }}：{{ item.count }}</el-tag></div></template>
        <template v-else-if="kind === 'governance-anomaly'"><h3>异常类型统计</h3><div class="row"><el-tag v-for="item in list('primary_type_counts')" :key="String(item.type)" effect="plain">{{ item.type }}：{{ item.count }}</el-tag></div></template>
        <template v-else><h3>风险等级统计</h3><div class="row"><el-tag v-for="item in list('levels')" :key="String(item.level)" effect="plain">{{ item.label }}：{{ item.count }}</el-tag></div></template>
      </div>
      <div v-if="summary" class="section"><div class="section-header"><h2>分页样本</h2><span class="muted">只读快照，不触发模型调用</span></div><div class="toolbar"><el-input v-model="keyword" placeholder="关键词或样本 ID" clearable /><template v-if="kind === 'governance-value'"><el-select v-model="tier" style="width:130px"><el-option v-for="item in [{ value:'all',label:'全部档位' },{ value:'high',label:'高' },{ value:'medium',label:'中' },{ value:'low',label:'低' },{ value:'unavailable',label:'不可评估' }]" :key="item.value" :label="item.label" :value="item.value" /></el-select><el-select v-model="bin" clearable placeholder="分数区间" style="width:130px"><el-option v-for="n in 5" :key="n" :label="`${(n-1)*20}–${n*20}`" :value="String(n-1)" /></el-select><el-select v-model="sortBy" clearable placeholder="排序字段" style="width:120px"><el-option label="分数" value="score" /><el-option label="档位" value="tier" /></el-select></template><template v-else-if="kind === 'governance-anomaly'"><el-input v-model="anomalyType" placeholder="异常类型" /><el-input v-model="sampleStatus" placeholder="状态" /></template><template v-else><el-select v-model="level" clearable placeholder="风险等级" style="width:130px"><el-option v-for="item in ['HIGH','MEDIUM','LOW','NOTICE']" :key="item" :label="item" :value="item" /></el-select><el-input v-model="sampleStatus" placeholder="状态" /><el-select v-model="sortBy" clearable placeholder="排序字段" style="width:130px"><el-option label="风险等级" value="maximum_suggested_level" /><el-option label="状态" value="status" /></el-select></template><el-select v-if="kind !== 'governance-anomaly'" v-model="sortOrder" clearable placeholder="排序方向" style="width:120px"><el-option label="升序" value="asc" /><el-option label="降序" value="desc" /></el-select><el-button @click="applyFilters">筛选</el-button></div>
        <el-table :data="samples?.items || []" empty-text="暂无匹配样本" class="data-table"><el-table-column prop="id" label="样本 ID" min-width="120" /><el-table-column prop="text" :label="kind === 'governance-risk' ? '已遮蔽正文' : '正文'" min-width="300" show-overflow-tooltip /><el-table-column v-if="kind === 'governance-value'" prop="score" label="分数" width="90" /><el-table-column v-if="kind === 'governance-value'" prop="tier" label="档位" width="110" /><el-table-column v-if="kind === 'governance-anomaly'" prop="primary_type" label="主要异常" min-width="110" /><el-table-column v-if="kind === 'governance-risk'" prop="maximum_suggested_level" label="风险等级" width="110" /><el-table-column v-if="kind !== 'governance-value'" prop="status" label="状态" width="110" /><el-table-column label="详情" width="90"><template #default="{ row }"><el-button link type="primary" @click="kind === 'governance-value' ? sampleDetail = row : loadSample(row.id)">查看</el-button></template></el-table-column></el-table><el-pagination style="margin-top:16px;justify-content:flex-end" background layout="prev, pager, next, total" :current-page="samplePage" :page-size="pageSize" :total="samples?.total || 0" @current-change="(value: number) => { samplePage = value; loadSamples() }" /></div>
    </el-tab-pane>
  </el-tabs>
  <p v-if="error" class="error">{{ error }}</p>
  <el-drawer :model-value="!!sampleDetail" title="只读样本详情" size="min(640px, 94vw)" @close="sampleDetail = null"><template v-if="sampleDetail"><dl class="detail-list"><dt>样本 ID</dt><dd>{{ sampleDetail.id }}</dd><dt>{{ kind === 'governance-risk' ? '已遮蔽正文' : '原文' }}</dt><dd><pre class="pre">{{ sampleDetail.text }}</pre></dd></dl><h3 style="margin-top:20px">发现与证据</h3><pre class="pre">{{ JSON.stringify(sampleDetail.findings || sampleDetail.dimensions || [], null, 2) }}</pre><template v-if="kind === 'governance-anomaly'"><h3>候选字段变更（只读草稿）</h3><pre class="pre">{{ JSON.stringify(sampleDetail.candidates || [], null, 2) }}</pre></template><template v-if="kind === 'governance-risk'"><h3>证据</h3><pre class="pre">{{ JSON.stringify(sampleDetail.evidence || [], null, 2) }}</pre></template><p v-if="sampleDetail.unavailable_reason || sampleDetail.unassessable_reason" class="muted">{{ sampleDetail.unavailable_reason || sampleDetail.unassessable_reason }}</p></template></el-drawer>
</template>
