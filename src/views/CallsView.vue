<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/api'
import { errorMessage } from '@/api/client'
import type { Call } from '@/types/api'

const mode = ref<'mine' | 'admin'>('mine')
const rows = ref<Call[]>([])
const limit = ref(50)
const offset = ref(0)
const error = ref('')
const loading = ref(false)
async function load() { loading.value = true; error.value = ''; try { rows.value = mode.value === 'mine' ? await api.calls(limit.value, offset.value) : await api.adminCalls(limit.value, offset.value) } catch (e) { error.value = errorMessage(e); rows.value = [] } finally { loading.value = false } }
function changeMode(value: 'mine' | 'admin') { mode.value = value; offset.value = 0; load() }
function next() { offset.value += limit.value; load() }
function previous() { offset.value = Math.max(0, offset.value - limit.value); load() }
onMounted(load)
</script>
<template>
  <div class="page-header"><div><h1>调用记录</h1><p class="muted">个人记录按当前 Bearer 令牌隔离；管理员视图跨令牌查询。</p></div><el-button @click="load">刷新</el-button></div>
  <div class="section"><div class="toolbar"><el-radio-group :model-value="mode" @update:model-value="changeMode"><el-radio-button value="mine">当前令牌</el-radio-button><el-radio-button value="admin">管理员全部</el-radio-button></el-radio-group><span class="muted">每页</span><el-select v-model="limit" style="width:95px" @change="offset = 0; load()"><el-option v-for="n in [20, 50, 100, 200]" :key="n" :label="n" :value="n" /></el-select></div><p v-if="error" class="error">{{ error }}</p><el-table :data="rows" v-loading="loading" empty-text="暂无调用记录" class="data-table"><el-table-column type="expand"><template #default="{ row }"><div style="padding:12px 24px"><h3>输入</h3><pre class="pre">{{ row.input }}</pre><h3>输出</h3><pre class="pre">{{ row.output === null ? '无' : JSON.stringify(row.output, null, 2) }}</pre></div></template></el-table-column><el-table-column prop="created_at" label="时间" min-width="175" /><el-table-column prop="model_id" label="模型 ID" min-width="210"><template #default="{ row }"><span class="mono">{{ row.model_id }}</span></template></el-table-column><el-table-column prop="response_type" label="输出类型" min-width="145" /><el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="row.status === 'success' ? 'success' : 'danger'">{{ row.status === 'success' ? '成功' : '失败' }}</el-tag></template></el-table-column><el-table-column prop="error_code" label="错误码" min-width="140" /><el-table-column v-if="mode === 'admin'" prop="token_id" label="令牌 ID" min-width="200" /><el-table-column v-if="mode === 'admin'" prop="token_label" label="令牌标签" min-width="130" /></el-table><div class="row end"><span class="muted">偏移 {{ offset }}，当前 {{ rows.length }} 条</span><el-button :disabled="offset === 0" @click="previous">上一页</el-button><el-button :disabled="rows.length < limit" @click="next">下一页</el-button></div></div>
</template>
