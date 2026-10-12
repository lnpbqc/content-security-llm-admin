// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus, { ElPagination, ElSelect } from 'element-plus'
import NeuralTraceView from '@/views/NeuralTraceView.vue'
import { session } from '@/stores/session'

const mock = vi.hoisted(() => ({ traceCases: vi.fn(), createTrace: vi.fn(), traceTasks: vi.fn(), traceTask: vi.fn(), traceResult: vi.fn() }))
vi.mock('@/api', () => ({ api: mock }))
const traceCase = { case_id: 'CASE_1', query: '问题', gold_answer: '正确答案', poison_target_answer: '污染答案' }
const task = { task_id: 'trace-1', case_id: 'CASE_1', status: 'pending', stage: 'queued', error_message: null, created_at: 'now', updated_at: 'now', started_at: null, finished_at: null }
const result = { schema_version: 'neural-trace-result-v1', task_id: 'trace-1', case: traceCase, model: { repo_id: 'Qwen/Qwen3-4B' }, input_hashes: { E1: 'hash-1' }, scoring_patch_scope: 'candidate_prediction_span', generation_patch_scope: 'generation_prompt_last_token', document_trace: { summary: { document_trace_success: true }, rows: [{ name: 'delete_poison', answer: '干预回答', margin: 0.4, gold_answer_match: true, poison_answer_match: false, intervention_success: true }] }, layer_scan: { summary: { best_layer: 3 }, rows: [{ layer_index: 0, crs: -0.2, patched_margin: 0.1, margin_delta: 0.01 }, { layer_index: 3, crs: 1.4, patched_margin: 0.4, margin_delta: 0.3 }] }, activation_difference: { summary: {}, rows: [{ layer_index: 0, normalized_l2: 0.8, cosine_distance: 0.2 }] }, component_scan: { summary: {}, rows: [{ layer_index: 3, component: 'mlp', crs: 1.2, patched_margin: 0.4, patched_answer: '实际回答', patched_answer_matches_gold: false, patched_answer_matches_poison: true }] }, baseline_generation: { clean: { answer: '基线回答' } } }
let wrapper: VueWrapper
function button(text: string) { return wrapper.findAll('button').find(item => item.text().trim() === text)! }
async function start() { wrapper = mount(NeuralTraceView, { global: { plugins: [ElementPlus] } }); await flushPromises() }
beforeEach(() => {
  for (const fn of Object.values(mock)) fn.mockReset()
  session.setBearer('owner'); session.setAdmin('')
  mock.traceCases.mockResolvedValue([traceCase]); mock.traceTasks.mockResolvedValue({ items: [task], total: 41 })
  mock.createTrace.mockResolvedValue(task); mock.traceTask.mockResolvedValue(task); mock.traceResult.mockResolvedValue(result)
})
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); vi.restoreAllMocks(); document.body.innerHTML = '' })

it('使用审核案例和 Bearer 建单，运行中仅查询状态，成功取结果并停止轮询', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  await start()
  wrapper.findComponent(ElSelect).vm.$emit('update:modelValue', 'CASE_1'); await flushPromises()
  expect(wrapper.text()).toContain('正确答案'); expect(wrapper.text()).toContain('污染答案')
  await button('提交溯源任务').trigger('click'); await flushPromises()
  expect(mock.createTrace).toHaveBeenCalledWith({ case_id: 'CASE_1' }); expect(mock.traceResult).not.toHaveBeenCalled()
  mock.traceTask.mockResolvedValue({ ...task, status: 'succeeded', stage: 'completed' })
  await vi.advanceTimersByTimeAsync(3000); await flushPromises()
  expect(mock.traceResult).toHaveBeenCalledWith('trace-1')
  expect(wrapper.text()).toContain('1.4'); expect(wrapper.text()).toContain('-0.2'); expect(wrapper.text()).toContain('实际回答')
  expect(wrapper.text()).toContain('观测差异'); expect(wrapper.text()).toContain('候选评分改善不代表自由生成已经纠错')
  const count = mock.traceTask.mock.calls.length
  await vi.advanceTimersByTimeAsync(6000); await flushPromises()
  expect(mock.traceTask).toHaveBeenCalledTimes(count)
})

it('异步失败显示阶段和错误，停止轮询且不读取结果', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  mock.traceTask.mockResolvedValue({ ...task, status: 'failed', stage: 'preflight', error_message: '模型文件缺失' })
  await start(); await button('查看').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('模型文件缺失'); expect(wrapper.text()).toContain('环境检查')
  expect(mock.traceResult).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(6000); expect(mock.traceTask).toHaveBeenCalledTimes(1)
})

it('切换令牌清理任务并忽略旧结果，分页从当前令牌重新开始', async () => {
  mock.traceTask.mockResolvedValue({ ...task, status: 'succeeded' })
  let finish!: (value: unknown) => void
  mock.traceResult.mockReturnValue(new Promise(resolve => { finish = resolve }))
  await start(); await button('查看').trigger('click'); await flushPromises()
  wrapper.findComponent(ElPagination).vm.$emit('current-change', 3); await flushPromises()
  expect(mock.traceTasks).toHaveBeenLastCalledWith(20, 40)
  mock.traceTasks.mockResolvedValue({ items: [], total: 0 })
  session.setBearer('new-owner'); await flushPromises()
  expect(mock.traceTasks).toHaveBeenLastCalledWith(20, 0)
  finish(result); await flushPromises()
  expect(wrapper.text()).not.toContain('实际回答'); expect(wrapper.text()).not.toContain('trace-1')
})

it('结果暂不可用时保留真实错误和 trace_id，可手动刷新重试', async () => {
  mock.traceTask.mockResolvedValue({ ...task, status: 'succeeded' })
  const { ApiError } = await import('@/api/client')
  mock.traceResult.mockRejectedValueOnce(new ApiError(409, '任务尚未成功完成', 'result-trace'))
  await start(); await button('查看').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('result-trace')
  await button('刷新详情').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('实际回答'); expect(wrapper.text()).not.toContain('result-trace')
})

it('未选择案例或没有访问令牌时阻止建单', async () => {
  await start(); await button('提交溯源任务').trigger('click'); await flushPromises()
  expect(mock.createTrace).not.toHaveBeenCalled()
  session.setBearer(''); await flushPromises()
  await button('提交溯源任务').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('请先录入访问令牌'); expect(mock.createTrace).not.toHaveBeenCalled()
})

it('建单后的历史刷新遇到令牌切换，不查询原令牌的新任务', async () => {
  await start()
  wrapper.findComponent(ElSelect).vm.$emit('update:modelValue', 'CASE_1'); await flushPromises()
  let finish!: (value: unknown) => void
  mock.traceTasks.mockReturnValueOnce(new Promise(resolve => { finish = resolve })).mockResolvedValue({ items: [], total: 0 })
  await button('提交溯源任务').trigger('click'); await flushPromises()
  session.setBearer('new-owner'); await flushPromises()
  finish({ items: [task], total: 1 }); await flushPromises()
  expect(mock.traceTask).not.toHaveBeenCalled(); expect(wrapper.text()).not.toContain('trace-1')
})
