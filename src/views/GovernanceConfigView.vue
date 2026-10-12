<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '@/api'
import { errorMessage } from '@/api/client'
import type { BusinessDatabase, BusinessDatabaseInput, BusinessDatabaseTestResult, Kind, Model } from '@/types/api'
import { validDatabase } from '@/utils/forms'

const kinds: { id: Kind; label: string }[] = [{ id: 'governance-value', label: '价值分析' }, { id: 'governance-anomaly', label: '异常治理' }, { id: 'governance-risk', label: '风险分级' }]
const bindings = ref<Partial<Record<Kind, string>>>({})
const models = ref<Model[]>([])
const database = ref<BusinessDatabase | null>(null)
const form = ref<BusinessDatabaseInput>({ host: '', port: 3306, database: '', username: '', password: '' })
const error = ref('')
const modelError = ref('')
const dbError = ref('')
const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const testError = ref('')
const testResult = ref<BusinessDatabaseTestResult | null>(null)
const databaseStatus = computed(() => !database.value ? '未配置' : testing.value ? '正在检测已保存配置' : testResult.value ? '已测试通过（已保存配置）' : testError.value ? '本次检测未通过（已保存配置）' : '已保存，尚未测试')
const checkLabels = { connection: 'MySQL 连接', query: '基础查询', datasets: '数据集表字段及读取权限', dataset_records: '记录表字段及读取权限' }
async function load() {
  if (loading.value || saving.value || testing.value) return
  loading.value = true; error.value = ''; dbError.value = ''; testError.value = ''; testResult.value = null
  const results = await Promise.allSettled([api.bindings(), api.models(), api.businessDatabase()])
  if (results[0].status === 'fulfilled') bindings.value = results[0].value; else error.value = errorMessage(results[0].reason)
  if (results[1].status === 'fulfilled') models.value = results[1].value; else modelError.value = errorMessage(results[1].reason)
  if (results[2].status === 'fulfilled') { database.value = results[2].value; if (database.value) form.value = { host: database.value.host, port: database.value.port, database: database.value.database, username: database.value.username, password: '' } } else dbError.value = errorMessage(results[2].reason)
  loading.value = false
}
async function saveBinding(kind: Kind) { const id = bindings.value[kind]; if (!id) { modelError.value = '请选择已存在的本地模型'; return } try { await api.setBinding(kind, id); ElMessage.success('任务模型绑定已保存'); modelError.value = '' } catch (e) { modelError.value = errorMessage(e) } }
async function saveDatabase() {
  if (loading.value || saving.value || testing.value) return
  if (!validDatabase(form.value)) { dbError.value = '请填写主机、1–65535 端口、库名、用户名和密码'; return }
  saving.value = true; dbError.value = ''; testError.value = ''; testResult.value = null
  try { database.value = await api.setBusinessDatabase({ ...form.value }); form.value.password = ''; ElMessage.success('业务库配置已保存，尚未测试') }
  catch (e) { dbError.value = errorMessage(e) }
  finally { saving.value = false }
}
async function testDatabase() {
  if (!database.value || loading.value || saving.value || testing.value) return
  testing.value = true; dbError.value = ''; testError.value = ''; testResult.value = null
  try { testResult.value = await api.testBusinessDatabase() }
  catch (e) { testError.value = errorMessage(e) }
  finally { testing.value = false }
}
onMounted(load)
</script>
<template>
  <div class="page-header"><div><h1>治理任务配置</h1><p class="muted">使用管理员密钥保存模型绑定和业务数据库连接。配置保存在本服务中。</p></div><el-button :disabled="loading || saving || testing" :loading="loading" @click="load">刷新配置</el-button></div>
  <div class="section"><h2>任务模型绑定</h2><p class="muted">仅可选择当前未删除的本地模型。新任务使用保存后的绑定。</p><p v-if="error || modelError" class="error">{{ error || modelError }}</p><div v-for="kind in kinds" :key="kind.id" class="row" style="margin-top:18px"><strong style="width:95px;font-size:13px">{{ kind.label }}</strong><el-select v-model="bindings[kind.id]" placeholder="未配置" clearable style="max-width:460px;flex:1"><el-option v-for="model in models" :key="model.model_id" :label="`${model.name}（${model.model_id}）`" :value="model.model_id" /></el-select><el-button @click="saveBinding(kind.id)">保存绑定</el-button></div></div>
  <div class="section">
    <h2>业务 MySQL 连接</h2><p class="warning">未配置业务库时服务仍可启动，但 worker 执行任务会失败。保存配置不等于验证 MySQL 连通性。</p>
    <p class="muted" style="margin:14px 0">当前状态：{{ databaseStatus }}。查询接口不返回密码；每次重新保存都须输入密码。</p>
    <div class="form-grid"><div class="field"><label>主机</label><el-input v-model="form.host" /></div><div class="field"><label>端口</label><el-input-number v-model="form.port" :min="1" :max="65535" :controls="false" /></div><div class="field"><label>数据库名</label><el-input v-model="form.database" /></div><div class="field"><label>用户名</label><el-input v-model="form.username" /></div><div class="field full"><label>密码</label><el-input v-model="form.password" type="password" show-password autocomplete="off" placeholder="保存时必填；旧密码不可查看" /></div></div>
    <p v-if="dbError" class="error">{{ dbError }}</p>
    <p class="field-hint">检测的是已保存配置；修改后请先保存。检测结果不代表未保存表单的连接状态，测试无需重新输入密码。</p>
    <p v-if="testing" class="muted">正在检查 MySQL 连接、治理所需表字段及读取权限，请稍候。</p>
    <p v-if="testError" class="error" role="alert">连接检测失败：{{ testError }}</p>
    <div v-if="testResult" role="status">
      <el-alert title="MySQL 连通，治理所需表及字段可读" type="success" :closable="false" show-icon />
      <dl class="detail-list" style="margin-top:14px"><dt>本次检测时间</dt><dd><time :datetime="testResult.checked_at">{{ testResult.checked_at }}</time></dd><dt>检测耗时</dt><dd>{{ testResult.elapsed_ms }} 毫秒</dd><dt>已通过检查</dt><dd>{{ testResult.checks.map(check => checkLabels[check]).join('、') }}</dd></dl>
      <p class="field-hint">空表也可通过；检测通过不代表存在可治理记录、版本匹配或 worker／模型可用。</p>
    </div>
    <div class="row end"><el-button :disabled="!database || loading || saving || testing" :loading="testing" @click="testDatabase">测试已保存连接</el-button><el-button type="primary" :disabled="loading || saving || testing" :loading="saving" @click="saveDatabase">保存业务库配置</el-button></div>
  </div>
</template>
