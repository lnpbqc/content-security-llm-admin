<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '@/api'
import { errorMessage } from '@/api/client'
import type { Kind, Model } from '@/types/api'

const kinds: { id: Kind; label: string }[] = [{ id: 'governance-value', label: '价值分析' }, { id: 'governance-anomaly', label: '异常治理' }, { id: 'governance-risk', label: '风险分级' }]
const bindings = ref<Partial<Record<Kind, string>>>({})
const models = ref<Model[]>([])
const error = ref('')
const modelError = ref('')
const loading = ref(false)
async function load() {
  if (loading.value) return
  loading.value = true; error.value = ''; modelError.value = ''
  const results = await Promise.allSettled([api.bindings(), api.models()])
  if (results[0].status === 'fulfilled') bindings.value = results[0].value; else error.value = errorMessage(results[0].reason)
  if (results[1].status === 'fulfilled') models.value = results[1].value; else modelError.value = errorMessage(results[1].reason)
  loading.value = false
}
async function saveBinding(kind: Kind) { const id = bindings.value[kind]; if (!id) { modelError.value = '请选择已存在的本地模型'; return } try { await api.setBinding(kind, id); ElMessage.success('任务模型绑定已保存'); modelError.value = '' } catch (e) { modelError.value = errorMessage(e) } }
onMounted(load)
</script>
<template>
  <div class="page-header"><div><h1>治理任务配置</h1><p class="muted">使用管理员密钥保存三类治理任务的模型绑定。数据库连接由服务端启动配置管理，治理和源码训练复用同一 MySQL 连接，无需在此填写。</p></div><el-button :disabled="loading" :loading="loading" @click="load">刷新配置</el-button></div>
  <div class="section"><h2>任务模型绑定</h2><p class="muted">仅可选择当前未删除的本地模型。新任务使用保存后的绑定。</p><p v-if="error || modelError" class="error">{{ error || modelError }}</p><div v-for="kind in kinds" :key="kind.id" class="row" style="margin-top:18px"><strong style="width:95px;font-size:13px">{{ kind.label }}</strong><el-select v-model="bindings[kind.id]" placeholder="未配置" clearable style="max-width:460px;flex:1"><el-option v-for="model in models" :key="model.model_id" :label="`${model.name}（${model.model_id}）`" :value="model.model_id" /></el-select><el-button @click="saveBinding(kind.id)">保存绑定</el-button></div></div>
</template>
