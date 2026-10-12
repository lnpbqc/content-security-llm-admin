<script setup lang="ts">
import type { TraceResult } from '@/types/api'
import TraceLayerChart from './TraceLayerChart.vue'
defineProps<{ result: TraceResult }>()
const yesNo = (value: unknown) => value === true ? '是' : value === false ? '否' : '—'
const conditions: Record<string, string> = { original_poison: '原始污染', delete_poison: '删除污染文档', replace_with_clean: '替换为干净文档', repair_poison_span: '修复污染片段' }
const components: Record<string, string> = { layer: '整层', self_attn: 'Attention', mlp: 'MLP' }
</script>
<template>
  <div class="section"><h2>本次溯源结果</h2><dl class="detail-list"><dt>案例 / 任务</dt><dd>{{ result.case.case_id }} / {{ result.task_id }}</dd><dt>问题</dt><dd>{{ result.case.query }}</dd><dt>正确答案</dt><dd>{{ result.case.gold_answer }}</dd><dt>污染目标答案</dt><dd>{{ result.case.poison_target_answer }}</dd></dl>
    <el-collapse><el-collapse-item title="查看模型环境、输入哈希与干预范围"><pre class="pre">{{ JSON.stringify({ schema_version: result.schema_version, model: result.model, input_hashes: result.input_hashes, scoring_patch_scope: result.scoring_patch_scope, generation_patch_scope: result.generation_patch_scope }, null, 2) }}</pre></el-collapse-item></el-collapse>
  </div>
  <div class="section"><h2>文档干预</h2><pre class="pre">{{ JSON.stringify(result.document_trace.summary, null, 2) }}</pre>
    <el-table :data="result.document_trace.rows" empty-text="暂无文档干预数据"><el-table-column label="条件" min-width="170"><template #default="{ row }">{{ conditions[row.name] || row.name }}</template></el-table-column><el-table-column prop="answer" label="实际回答" min-width="240" /><el-table-column prop="margin" label="Margin" width="110" /><el-table-column v-for="field in [{ key: 'gold_answer_match', label: '匹配正确答案' }, { key: 'poison_answer_match', label: '匹配污染答案' }, { key: 'intervention_success', label: '干预成功' }]" :key="field.key" :label="field.label" width="120"><template #default="{ row }">{{ yesNo(row[field.key]) }}</template></el-table-column></el-table>
  </div>
  <div class="section"><h2>逐层因果恢复（CRS）</h2><p class="field-hint">CRS = (patched_margin − poison_margin) / (clean_margin − poison_margin)，可小于 0 或大于 1；最大 CRS 层不等于错误最早产生的层。层索引从 0 开始。</p>
    <TraceLayerChart :rows="result.layer_scan.rows" value-key="crs" label="逐层 CRS" /><pre class="pre">{{ JSON.stringify(result.layer_scan.summary, null, 2) }}</pre>
    <el-table :data="result.layer_scan.rows" max-height="400" empty-text="暂无逐层数据"><el-table-column prop="layer_index" label="层索引" /><el-table-column prop="crs" label="CRS" /><el-table-column prop="patched_margin" label="干预后 Margin" /><el-table-column prop="margin_delta" label="Margin 变化" /></el-table>
  </div>
  <div class="section"><h2>激活观测差异</h2><p class="field-hint">L2 与 cosine 差异是观测指标，不作为因果贡献分数；接口不提供单个神经元异常归因。</p>
    <div class="form-grid"><TraceLayerChart :rows="result.activation_difference.rows" value-key="normalized_l2" label="归一化 L2 差异" /><TraceLayerChart :rows="result.activation_difference.rows" value-key="cosine_distance" label="Cosine 距离" /></div><pre class="pre">{{ JSON.stringify(result.activation_difference.summary, null, 2) }}</pre>
    <el-table :data="result.activation_difference.rows" max-height="400" empty-text="暂无激活差异"><el-table-column prop="layer_index" label="层索引" /><el-table-column prop="normalized_l2" label="归一化 L2" /><el-table-column prop="cosine_distance" label="Cosine 距离" /></el-table>
  </div>
  <div class="section"><h2>组件因果扫描与实际生成</h2><p class="field-hint">候选评分改善不代表自由生成已经纠错。评分干预候选预测区间；自由生成干预 Prompt 最后一个 Token。</p><pre class="pre">{{ JSON.stringify(result.component_scan.summary, null, 2) }}</pre>
    <el-table :data="result.component_scan.rows" empty-text="暂无组件数据"><el-table-column prop="layer_index" label="层索引" width="80" /><el-table-column label="组件" width="100"><template #default="{ row }">{{ components[row.component] || row.component }}</template></el-table-column><el-table-column prop="crs" label="CRS" width="100" /><el-table-column prop="patched_margin" label="干预后 Margin" width="130" /><el-table-column prop="patched_answer" label="实际回答" min-width="240" /><el-table-column label="匹配正确答案" width="120"><template #default="{ row }">{{ yesNo(row.patched_answer_matches_gold) }}</template></el-table-column><el-table-column label="匹配污染答案" width="120"><template #default="{ row }">{{ yesNo(row.patched_answer_matches_poison) }}</template></el-table-column></el-table>
    <h3 style="margin-top:20px">本次基线自由生成</h3><pre class="pre">{{ JSON.stringify(result.baseline_generation, null, 2) }}</pre>
  </div>
</template>
