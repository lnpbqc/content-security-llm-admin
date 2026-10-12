<script setup lang="ts">
import { computed } from 'vue'
import { jsonObject } from '@/utils/analysis'

const props = defineProps<{ inputs: string; parameters: string; parametersSchema: Record<string, unknown> }>()
const emit = defineEmits<{ 'update:inputs': [value: string]; 'update:parameters': [value: string] }>()
const values = computed(() => {
  try { return { inputs: jsonObject(props.inputs, '脚本输入'), parameters: jsonObject(props.parameters, '脚本参数') } }
  catch { return null }
})
const fields = [
  { key: 'epochs', label: '训练轮数', hint: '完整遍历训练样本的次数。首次试跑可改为 1。' },
  { key: 'batch_size', label: '批大小', hint: '每次训练使用的样本数；显存不足时可适当减小。' },
  { key: 'learning_rate', label: '学习率', hint: '控制每次参数更新的幅度，须大于 0；不确定时使用默认值。' },
  { key: 'seed', label: '随机种子', hint: '控制随机初始化和数据划分，方便重复实验。' },
  { key: 'train_samples', label: '训练样本数', hint: '从 CIFAR-100 训练集中取样，与验证样本数合计不能超过 50000。' },
  { key: 'validation_samples', label: '验证样本数', hint: '使用与训练集不重叠的样本评估模型。' },
]
const properties = computed(() => (props.parametersSchema.properties || {}) as Record<string, { minimum?: number; maximum?: number; enum?: string[] }>)
function update(group: 'inputs' | 'parameters', key: string, value: unknown) {
  if (!values.value) return
  const json = JSON.stringify({ ...values.value[group], [key]: value }, null, 2)
  if (group === 'inputs') emit('update:inputs', json); else emit('update:parameters', json)
}
function numberValue(key: string) { const value = values.value?.parameters[key]; return typeof value === 'number' ? value : undefined }
</script>
<template>
  <p v-if="!values" class="error">高级 JSON 格式无效，请在“高级 JSON 编辑”中修正后再使用表单。</p>
  <div class="form-grid" style="margin-top:16px">
    <div class="field full"><label for="cifar-download">允许下载数据集</label><el-switch id="cifar-download" :model-value="values?.inputs.download === true" :disabled="!values" active-text="允许下载" inactive-text="仅使用服务器缓存" @update:model-value="(value: unknown) => update('inputs', 'download', value)" /><p class="field-hint">首次运行通常保持开启：服务器下载官方 CIFAR-100 数据。关闭后须已有缓存；此处不上传文件，也无需填写业务数据集 ID。</p></div>
    <div v-for="field in fields" :key="field.key" class="field"><label :for="`cifar-${field.key}`">{{ field.label }}</label><el-input-number :id="`cifar-${field.key}`" :model-value="numberValue(field.key)" :min="properties[field.key]?.minimum" :max="properties[field.key]?.maximum" :precision="field.key === 'learning_rate' ? undefined : 0" :step="field.key === 'learning_rate' ? 0.001 : 1" :disabled="!values" @update:model-value="(value: unknown) => update('parameters', field.key, value)" /><p class="field-hint">{{ field.hint }}</p></div>
    <div class="field"><label for="cifar-device">运行设备</label><el-select id="cifar-device" :model-value="values?.parameters.device" :disabled="!values" @update:model-value="(value: unknown) => update('parameters', 'device', value)"><el-option v-for="device in properties.device?.enum || ['cuda', 'cpu']" :key="device" :value="device" :label="device === 'cuda' ? 'GPU（CUDA）' : device === 'cpu' ? 'CPU' : device" /></el-select><p class="field-hint">指服务器设备。选择 GPU 需要 CUDA 可用，否则任务失败；CPU 可用于调试，但通常较慢。</p></div>
  </div>
</template>
