<script setup lang="ts">
import type { AnalysisRecord } from '@/types/api'
defineProps<{ record: AnalysisRecord }>()
const statuses = { running: '分析中', succeeded: '成功', failed: '失败' }
</script>
<template>
  <div class="section"><div class="section-header"><h2>分析结果</h2><el-tag :type="record.status === 'succeeded' ? 'success' : record.status === 'failed' ? 'danger' : 'info'">{{ statuses[record.status] }}</el-tag></div>
    <dl class="detail-list"><dt>记录 ID</dt><dd class="mono">{{ record.id }}</dd><dt>模型 ID</dt><dd>{{ record.model_id }}</dd><dt>开始时间</dt><dd>{{ record.created_at }}</dd><dt>结束时间</dt><dd>{{ record.finished_at || '—' }}</dd></dl>
    <p v-if="record.error_message" class="error">{{ record.error_code }}：{{ record.error_message }}</p>
    <p v-if="record.status === 'running'" class="muted">分析尚未结束，可通过记录 ID 刷新查询。</p>
    <template v-if="record.original_output != null"><h3 style="margin-top:20px">原始生成内容</h3><pre class="pre">{{ record.original_output }}</pre></template>
    <template v-if="record.result"><p v-if="record.result.summary || record.result.conclusion">{{ record.result.summary || record.result.conclusion }}</p><p v-if="record.result.risk_level" class="muted">建议风险等级：{{ record.result.risk_level }}</p><p v-if="record.result.verification_state" class="warning">核验状态：{{ record.result.verification_state }}。审计结果是模型建议。</p><template v-if="record.result.governedOutput"><h3>治理后内容</h3><pre class="pre">{{ record.result.governedOutput }}</pre></template><h3 style="margin-top:20px">完整结果与引用</h3><pre class="pre">{{ JSON.stringify(record.result, null, 2) }}</pre></template>
    <el-collapse><el-collapse-item title="查看提交材料及关联调用"><h3>提交材料</h3><pre class="pre">{{ JSON.stringify(record.input, null, 2) }}</pre><h3>关联调用</h3><pre class="pre">{{ JSON.stringify(record.calls, null, 2) }}</pre></el-collapse-item></el-collapse>
  </div>
</template>
