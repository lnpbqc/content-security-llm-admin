<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/api'
import { errorMessage } from '@/api/client'
import type { Model } from '@/types/api'
import { required } from '@/utils/forms'

const models = ref<Model[]>([])
const types = ref<string[]>([])
const modelId = ref('')
const responseType = ref('')
const input = ref('')
const result = ref<Record<string, unknown> | null>(null)
const error = ref('')
const loading = ref(false)
async function load() { error.value = ''; const values = await Promise.allSettled([api.models(), api.responseTypes()]); if (values[0].status === 'fulfilled') models.value = values[0].value; else error.value = errorMessage(values[0].reason); if (values[1].status === 'fulfilled') types.value = values[1].value; else error.value = errorMessage(values[1].reason) }
async function invoke() { if (!modelId.value || !responseType.value || !required(input.value)) { error.value = '请选择模型和输出类型，并输入文本'; return } loading.value = true; error.value = ''; result.value = null; try { result.value = (await api.invoke({ model_id: modelId.value, response_type: responseType.value, input: input.value })).result } catch (e) { error.value = errorMessage(e) } finally { loading.value = false } }
onMounted(load)
</script>
<template>
  <div class="page-header"><div><h1>通用模型调用</h1><p class="muted">输出类型由服务端实时提供；成功结果会按其结构展示。</p></div><el-button @click="load">刷新选项</el-button></div>
  <div class="section"><div class="form-grid"><div class="field"><label>本地模型</label><el-select v-model="modelId" placeholder="选择模型"><el-option v-for="model in models" :key="model.model_id" :label="`${model.name}（${model.model_id}）`" :value="model.model_id" /></el-select></div><div class="field"><label>结构化输出类型</label><el-select v-model="responseType" placeholder="选择服务端类型"><el-option v-for="type in types" :key="type" :label="type" :value="type" /></el-select></div><div class="field full"><label>输入文本</label><el-input v-model="input" type="textarea" :rows="7" placeholder="输入要分析的文本" /></div></div><p v-if="error" class="error">{{ error }}</p><div class="row end"><el-button type="primary" :loading="loading" @click="invoke">发起调用</el-button></div></div>
  <div v-if="result" class="section"><h2>结构化结果</h2><pre class="pre">{{ JSON.stringify(result, null, 2) }}</pre></div>
</template>
