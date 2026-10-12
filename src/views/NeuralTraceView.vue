<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '@/api'
import { errorMessage } from '@/api/client'
import { session } from '@/stores/session'
import type { TraceCase, TraceResult, TraceTask } from '@/types/api'
import { createTaskPoller, shouldPoll } from '@/utils/polling'
import TraceResultDetails from '@/components/TraceResultDetails.vue'

const cases = ref<TraceCase[]>([])
const caseId = ref('')
const chosen = computed(() => cases.value.find(item => item.case_id === caseId.value))
const rows = ref<TraceTask[]>([])
const page = ref(1)
const total = ref(0)
const manualId = ref('')
const active = ref<TraceTask | null>(null)
const result = ref<TraceResult | null>(null)
const caseError = ref('')
const listError = ref('')
const error = ref('')
const detailError = ref('')
const busy = ref(false)
const refreshing = ref(false)
let revision = 0
let listRevision = 0
const statuses: Record<string, string> = { pending: '等待中', running: '运行中', succeeded: '已完成', failed: '失败' }
const stages: Record<string, string> = { queued: '已入队', preflight: '环境检查', document_trace: '文档干预', prepare_inputs: '输入与 Token 对齐', layer_scan: '逐层因果扫描', activation_difference: '激活差异', component_scan: '组件因果扫描', collect_result: '整理结果', completed: '已完成' }
const poller = createTaskPoller(async () => { await refresh(); return active.value?.status || 'succeeded' })

async function loadList() {
  const current = ++listRevision
  listError.value = ''
  try { const data = await api.traceTasks(20, (page.value - 1) * 20); if (current === listRevision) { rows.value = data.items; total.value = data.total } }
  catch (e) { if (current === listRevision) listError.value = errorMessage(e) }
}
async function load() {
  const current = revision; caseError.value = ''
  const results = await Promise.allSettled([api.traceCases(), loadList()])
  if (current !== revision) return
  if (results[0].status === 'fulfilled') cases.value = results[0].value; else caseError.value = errorMessage(results[0].reason)
}
async function refresh() {
  if (!active.value || refreshing.value) return
  const current = revision; const id = active.value.task_id; refreshing.value = true; detailError.value = ''
  try {
    const task = await api.traceTask(id)
    if (current !== revision) return
    active.value = task
    rows.value = rows.value.map(row => row.task_id === id ? task : row)
    if (shouldPoll(task.status)) poller.start(); else poller.stop()
    if (task.status === 'succeeded') {
      const data = await api.traceResult(id)
      if (current === revision) result.value = data
    } else result.value = null
  } catch (e) { if (current === revision) { detailError.value = errorMessage(e); poller.stop() }; throw e }
  finally { if (current === revision) refreshing.value = false }
}
async function select(id = manualId.value) {
  if (!id.trim()) { detailError.value = '请输入任务 ID'; return }
  poller.stop(); revision++; refreshing.value = false; active.value = null; result.value = null; detailError.value = ''
  const current = revision
  try {
    const task = await api.traceTask(id.trim())
    if (current !== revision) return
    active.value = task; manualId.value = task.task_id
    if (shouldPoll(task.status)) poller.start()
    if (task.status === 'succeeded') { const data = await api.traceResult(task.task_id); if (current === revision) result.value = data }
  } catch (e) { if (current === revision) detailError.value = errorMessage(e) }
}
async function create() {
  if (busy.value) return
  error.value = ''
  if (!session.bearer.value) { error.value = '请先录入访问令牌'; return }
  if (!chosen.value) { error.value = '请选择服务端审核案例'; return }
  const current = revision; busy.value = true
  try {
    const task = await api.createTrace({ case_id: chosen.value.case_id })
    if (current !== revision) return
    ElMessage.success('溯源任务已提交'); page.value = 1; await loadList(); if (current === revision) await select(task.task_id)
  } catch (e) { if (current === revision) error.value = errorMessage(e) }
  finally { busy.value = false }
}
watch(session.bearerRevision, () => {
  revision++; listRevision++; poller.stop(); cases.value = []; caseId.value = ''; rows.value = []; total.value = 0; page.value = 1; active.value = null; result.value = null; manualId.value = ''; error.value = ''; detailError.value = ''; refreshing.value = false
  void load()
})
onMounted(load)
onBeforeUnmount(() => { revision++; listRevision++; poller.stop() })
</script>

<template>
  <div class="page-header"><div><h1>神经因果溯源</h1><p class="muted">选择审核案例，查看文档干预、逐层因果恢复与组件扫描结果。</p></div><el-button @click="load">刷新案例与历史</el-button></div>
  <div class="section">
    <h2>新建溯源任务</h2><p class="muted">使用当前访问令牌建单，由独立 GPU worker 执行。仅支持服务端登记案例，提交会重新运行溯源实验。</p>
    <p v-if="caseError" class="error">{{ caseError }}</p>
    <div class="field" style="margin-top:16px"><label>审核案例</label><el-select v-model="caseId" placeholder="选择审核案例" :disabled="busy"><el-option v-for="item in cases" :key="item.case_id" :value="item.case_id" :label="`${item.case_id} · ${item.query}`" /></el-select></div>
    <dl v-if="chosen" class="detail-list"><dt>问题</dt><dd>{{ chosen.query }}</dd><dt>正确答案</dt><dd>{{ chosen.gold_answer }}</dd><dt>污染目标答案</dt><dd>{{ chosen.poison_target_answer }}</dd></dl>
    <p v-if="error" class="error">{{ error }}</p><div class="row end"><el-button type="primary" :loading="busy" @click="create">提交溯源任务</el-button></div>
  </div>
  <div class="section">
    <h2>当前令牌的溯源历史</h2><p v-if="listError" class="error">{{ listError }}</p>
    <el-table :data="rows" empty-text="暂无溯源任务"><el-table-column prop="task_id" label="任务 ID" min-width="235" /><el-table-column prop="case_id" label="案例" min-width="180" /><el-table-column label="状态" width="90"><template #default="{ row }">{{ statuses[row.status] || row.status }}</template></el-table-column><el-table-column label="阶段" min-width="150"><template #default="{ row }">{{ stages[row.stage] || row.stage }}</template></el-table-column><el-table-column prop="created_at" label="创建时间" min-width="175" /><el-table-column label="详情" width="80"><template #default="{ row }"><el-button link type="primary" @click="select(row.task_id)">查看</el-button></template></el-table-column></el-table>
    <el-pagination layout="prev, pager, next, total" :current-page="page" :page-size="20" :total="total" @current-change="(value: number) => { page = value; loadList() }" />
  </div>
  <div class="section">
    <h2>任务详情</h2><div class="toolbar"><el-input v-model="manualId" placeholder="输入溯源任务 ID" /><el-button @click="select()">按 ID 查询</el-button><el-button v-if="active" :loading="refreshing" @click="refresh().catch(() => {})">刷新详情</el-button></div>
    <p v-if="detailError" class="error">{{ detailError }}</p>
    <template v-if="active">
      <dl class="detail-list"><dt>任务 ID</dt><dd>{{ active.task_id }}</dd><dt>案例</dt><dd>{{ active.case_id }}</dd><dt>状态</dt><dd>{{ statuses[active.status] }}</dd><dt>阶段</dt><dd>{{ stages[active.stage] || active.stage }}</dd><dt>创建 / 更新时间</dt><dd>{{ active.created_at }} / {{ active.updated_at }}</dd><dt>开始 / 结束时间</dt><dd>{{ active.started_at || '未开始' }} / {{ active.finished_at || '未结束' }}</dd></dl>
      <p v-if="active.error_message" class="error">{{ active.error_message }}</p><p v-if="shouldPoll(active.status)" class="muted">每 3 秒查询状态，完成或失败后停止。阶段不代表固定百分比进度。</p>
    </template>
  </div>
  <TraceResultDetails v-if="result" :result="result" />
</template>
