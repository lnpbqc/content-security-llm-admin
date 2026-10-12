<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '@/api'
import { errorMessage } from '@/api/client'
import type { Model, ModelInput } from '@/types/api'
import { validModel } from '@/utils/forms'
import { session } from '@/stores/session'

const rows = ref<Model[]>([])
const selected = ref<Model | null>(null)
const error = ref('')
const loading = ref(false)
const open = ref(false)
const editing = ref(false)
const form = ref<ModelInput>({ upstream_model_id: '', name: '', description: '', base_url: '', api_key: '' })
async function load() { loading.value = true; error.value = ''; try { rows.value = await api.models() } catch (e) { error.value = errorMessage(e) } finally { loading.value = false } }
function canWrite() { if (session.bearer.value && session.admin.value) return true; error.value = '新增、编辑和删除模型需要同时录入访问令牌与管理员密钥'; return false }
function create() { if (!canWrite()) return; editing.value = false; form.value = { upstream_model_id: '', name: '', description: '', base_url: '', api_key: '' }; open.value = true }
async function edit(row: Model) { try { const model = await api.model(row.model_id); editing.value = true; form.value = { upstream_model_id: model.upstream_model_id, name: model.name, description: model.description, base_url: model.base_url, api_key: '' }; selected.value = model; open.value = true } catch (e) { error.value = errorMessage(e) } }
async function detail(row: Model) { try { selected.value = await api.model(row.model_id) } catch (e) { error.value = errorMessage(e) } }
async function save() {
  if (!canWrite()) return
  const input = { ...form.value, upstream_model_id: form.value.upstream_model_id.trim(), name: form.value.name.trim(), base_url: form.value.base_url.trim() }
  if (!validModel({ ...input, api_key: editing.value ? input.api_key || 'unchanged' : input.api_key })) { error.value = '请填写模型名称、上游模型 ID、有效的 HTTP(S) 地址及创建时的 API Key'; return }
  try { if (editing.value && selected.value) { const body: Partial<ModelInput> = { upstream_model_id: input.upstream_model_id, name: input.name, description: input.description, base_url: input.base_url }; if (input.api_key) body.api_key = input.api_key; await api.updateModel(selected.value.model_id, body) } else await api.createModel(input); open.value = false; selected.value = null; await load(); ElMessage.success('模型配置已保存') } catch (e) { error.value = errorMessage(e) }
}
async function remove(row: Model) { if (!canWrite()) return; try { await ElMessageBox.confirm(`软删除「${row.name}」后，该模型不能再被调用。确定继续？`, '软删除模型', { type: 'warning', confirmButtonText: '删除' }); if (!canWrite()) return; await api.deleteModel(row.model_id); await load(); ElMessage.success('模型已软删除') } catch (e) { if (e !== 'cancel' && e !== 'close') error.value = errorMessage(e) } }
onMounted(load)
</script>
<template>
  <div class="page-header"><div><h1>模型配置</h1><p class="muted">查询使用访问令牌；新增、编辑和删除同时需要管理员密钥。保存配置不会预先验证上游连通性。</p></div><el-button type="primary" @click="create">新增模型</el-button></div>
  <div class="section"><div class="section-header"><h2>可用模型</h2><el-button @click="load">刷新</el-button></div><p v-if="error" class="error">{{ error }}</p><el-table :data="rows" v-loading="loading" empty-text="暂无可用模型" class="data-table"><el-table-column prop="name" label="名称" min-width="140" /><el-table-column prop="model_id" label="本地模型 ID" min-width="225"><template #default="{ row }"><span class="mono">{{ row.model_id }}</span></template></el-table-column><el-table-column prop="upstream_model_id" label="上游模型 ID" min-width="150" /><el-table-column prop="base_url" label="API 地址" min-width="210" /><el-table-column prop="updated_at" label="更新时间" min-width="175" /><el-table-column label="操作" width="190"><template #default="{ row }"><el-button link type="primary" @click="detail(row)">详情</el-button><el-button link type="primary" @click="edit(row)">编辑</el-button><el-button link type="danger" @click="remove(row)">删除</el-button></template></el-table-column></el-table></div>
  <el-dialog v-model="open" :title="editing ? '编辑模型' : '新增模型'" width="min(620px, 94vw)" @closed="error = ''"><div class="form-grid"><div class="field"><label>本地显示名称</label><el-input v-model="form.name" /></div><div class="field"><label>上游模型 ID</label><el-input v-model="form.upstream_model_id" /></div><div class="field full"><label>API 根地址</label><el-input v-model="form.base_url" placeholder="https://example.com/v1" /></div><div class="field full"><label>描述</label><el-input v-model="form.description" /></div><div class="field full"><label>上游 API Key</label><el-input v-model="form.api_key" type="password" show-password autocomplete="off" :placeholder="editing ? '留空表示不修改；旧密钥不可查看' : '创建时必填'" /></div></div><p v-if="error" class="error">{{ error }}</p><template #footer><el-button @click="open = false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template></el-dialog>
  <el-drawer :model-value="!!selected && !open" title="模型详情" size="min(500px, 90vw)" @close="selected = null"><dl v-if="selected" class="detail-list"><dt>本地模型 ID</dt><dd class="mono">{{ selected.model_id }}</dd><dt>名称</dt><dd>{{ selected.name }}</dd><dt>上游模型 ID</dt><dd>{{ selected.upstream_model_id }}</dd><dt>API 地址</dt><dd>{{ selected.base_url }}</dd><dt>描述</dt><dd>{{ selected.description || '无' }}</dd><dt>创建时间</dt><dd>{{ selected.created_at }}</dd><dt>更新时间</dt><dd>{{ selected.updated_at }}</dd><dt>API Key</dt><dd>查询接口不返回</dd></dl></el-drawer>
</template>
