<script setup lang="ts">
import type { Scope } from '@/types/api'
const props = defineProps<{ modelValue: Scope; schemes: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: Scope] }>()
function update(key: keyof Scope, value: string | number) { emit('update:modelValue', { ...props.modelValue, [key]: value }) }
</script>
<template>
  <div class="form-grid">
    <div class="field"><label>数据集 ID</label><el-input-number :model-value="modelValue.dataset_id || undefined" :min="1" :controls="false" placeholder="请输入数据集 ID" @update:model-value="(value: number) => update('dataset_id', value)" /></div>
    <div class="field"><label>当前版本 ID</label><el-input :model-value="modelValue.version_id" placeholder="由操作者输入业务库当前版本" @update:model-value="(value: string) => update('version_id', value)" /></div>
    <div class="field"><label>语种范围</label><el-input :model-value="modelValue.language" placeholder="例如 zh" @update:model-value="(value: string) => update('language', value)" /></div>
    <div class="field"><label>方案</label><el-select :model-value="modelValue.scheme_id" @update:model-value="(value: string) => update('scheme_id', value)"><el-option v-for="scheme in schemes" :key="scheme" :label="scheme" :value="scheme" /></el-select></div>
  </div>
</template>
