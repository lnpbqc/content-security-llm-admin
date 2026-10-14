// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus, { ElPagination, ElSelect } from 'element-plus'
import MultilingualView from '@/views/MultilingualView.vue'
import { session } from '@/stores/session'
import { ApiError } from '@/api/client'

const mock = vi.hoisted(() => ({ models: vi.fn(), createMultilingual: vi.fn(), multilingualTask: vi.fn(), latestMultilingual: vi.fn(), multilingualHistory: vi.fn(), multilingualResult: vi.fn(), multilingualSamples: vi.fn() }))
vi.mock('@/api', () => ({ api: mock }))
const scope = { dataset_id: 1, version_id: 'v1', languages: ['zh', 'en'], analysis_mode: 'semantic_weighting', scheme_id: 'multilingual-v1' }
const task = { task_id: 'multi-task', input: scope, model_id: 'm1', status: 'pending', created_at: 'now', result_id: null, error_message: null }
const result = { id: 'multi-result', task_id: 'multi-task', scope, dataset_name: '结构化数据集', model_id: 'm1', finished_at: 'now', data_source: 'business_dataset', scheme_name: '多语种方案', thresholds: { low: 0.25, medium: 0.5, high: 0.75 }, target_count: 3, valid_count: 2, unassessable_count: 0, failed_count: 1, accuracy_correct_count: 1, accuracy_test_count: 2, data_weight_classification_accuracy: 0.5, overall_risk_score: 0.7, overall_risk_level: 'medium', semantic_consistency: 0.9, semantic_consistency_method: 'pairwise_jensen_shannon_similarity', high_risk_semantic_weight: 62.5, covered_language_count: 2, semantic_consistency_delta: -0.02, high_risk_semantic_weight_delta: 3.5, language_distribution: [{ language: 'zh', sample_count: 1, safe_weight: 10, neutral_weight: 20, risk_weight: 70 }], risk_distribution: [{ level: 'medium', count: 2, percent: 100 }], risk_evidence: [{ sample_id: 's1', language: 'zh', quote: '引用片段', reason: '证据依据', semantic_weight: 0.7, risk_score: 0.7, risk_level: 'medium' }] }
const sample = { id: 's1', dataset_id: 1, version_id: 'v1', revision_id: 'rev1', text: '已遮蔽样本正文', language: 'zh', status: 'assessed', semantic_weights: { safe: 0.1, neutral: 0.2, risk: 0.7 }, risk_score: 0.7, risk_level: 'medium', reference_risk_level: 'high', evidence: [{ quote: '引用片段', reason: '证据依据' }] }
let wrapper: VueWrapper
function button(label: string) { return wrapper.findAll('button').find(item => item.text().trim() === label)! }
async function start() { wrapper = mount(MultilingualView, { global: { plugins: [ElementPlus] } }); await flushPromises() }
async function fill() {
  await wrapper.find('#multilingual-version').setValue('v1')
  wrapper.findAllComponents(ElSelect)[0]!.vm.$emit('update:modelValue', 'm1'); await flushPromises()
}
beforeEach(() => {
  for (const fn of Object.values(mock)) fn.mockReset()
  session.setBearer('owner'); session.setAdmin('')
  mock.models.mockResolvedValue([{ model_id: 'm1', name: '分析模型' }])
  mock.createMultilingual.mockResolvedValue(task); mock.multilingualTask.mockResolvedValue(task)
  mock.latestMultilingual.mockResolvedValue(result); mock.multilingualHistory.mockResolvedValue([result]); mock.multilingualResult.mockResolvedValue(result)
  mock.multilingualSamples.mockResolvedValue({ items: [sample], total: 41, page: 1, page_size: 20, total_pages: 3 })
})
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); vi.restoreAllMocks(); document.body.innerHTML = '' })

it('显式选模建单，仅成功后读取结果，停止终态轮询', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  await start(); await fill(); await button('提交多语种分析').trigger('click'); await flushPromises()
  expect(mock.createMultilingual).toHaveBeenCalledWith({ model_id: 'm1', input: scope })
  expect(mock.multilingualResult).not.toHaveBeenCalled()
  mock.multilingualTask.mockResolvedValue({ ...task, status: 'succeeded', result_id: 'multi-result' })
  await vi.advanceTimersByTimeAsync(3000); await flushPromises()
  expect(mock.multilingualResult).toHaveBeenCalledWith('multi-result')
  expect(mock.multilingualSamples).toHaveBeenCalledWith('multi-result', 1, 20)
  expect(wrapper.findAll('.metric strong').map(item => item.text())).toEqual(['50%', '90%', '62.5%', '0.7'])
  expect(wrapper.text()).toContain('-2 个百分点'); expect(wrapper.text()).toContain('+3.5 个百分点')
  expect(wrapper.text()).toContain('引用片段'); expect(wrapper.text()).toContain('已遮蔽样本正文')
  const count = mock.multilingualTask.mock.calls.length
  await vi.advanceTimersByTimeAsync(6000); expect(mock.multilingualTask).toHaveBeenCalledTimes(count)
})

it.each(['zh, zh', 'zh, 非法', Array.from({ length: 33 }, (_, n) => `en-${String(n).padStart(2, '0')}`).join(',')])('非法或重复语种在提交前提示：%s', async value => {
  await start(); await fill(); await wrapper.find('#multilingual-languages').setValue(value)
  await button('提交多语种分析').trigger('click'); await flushPromises()
  expect(mock.createMultilingual).not.toHaveBeenCalled(); expect(wrapper.text()).toContain('1–32 个不重复的语言标签')
})

it('失败任务不发布结果并停止轮询，查询错误保留 trace_id', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  mock.multilingualTask.mockResolvedValue({ ...task, status: 'failed', error_message: '没有所选语种的样本' })
  await start(); await wrapper.find('input[placeholder="输入多语种任务 ID"]').setValue('multi-task')
  await button('查询任务').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('没有所选语种的样本'); expect(mock.multilingualResult).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(6000); expect(mock.multilingualTask).toHaveBeenCalledTimes(1)
  mock.multilingualTask.mockRejectedValue(new ApiError(404, '任务不存在', 'multi-trace'))
  await button('刷新任务').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('multi-trace')
})

it('历史和最新结果可不选模型查询，分页始终使用结果快照 ID', async () => {
  await start(); await wrapper.find('#multilingual-version').setValue('v1')
  await button('查询当前范围历史').trigger('click'); await flushPromises()
  expect(mock.multilingualHistory).toHaveBeenCalledWith(scope)
  await button('查看结果').trigger('click'); await flushPromises()
  wrapper.findComponent(ElPagination).vm.$emit('current-change', 2); await flushPromises()
  expect(mock.multilingualSamples).toHaveBeenLastCalledWith('multi-result', 2, 20)
  await wrapper.find('#multilingual-version').setValue('v2')
  await button('刷新样本').trigger('click'); await flushPromises()
  expect(mock.multilingualSamples).toHaveBeenLastCalledWith('multi-result', 2, 20)
  mock.latestMultilingual.mockResolvedValue(null)
  await button('查询当前范围最新结果').trigger('click'); await flushPromises()
  expect(mock.latestMultilingual).toHaveBeenCalledWith({ ...scope, version_id: 'v2' })
  expect(wrapper.text()).toContain('当前范围尚无已发布结果'); expect(wrapper.text()).not.toContain('已遮蔽样本正文')
})

it('没有标签或跨语种基线时保留空值；准确率为零时正确显示 0%', async () => {
  mock.latestMultilingual.mockResolvedValue({ ...result, data_weight_classification_accuracy: null, accuracy_correct_count: 0, accuracy_test_count: 0, semantic_consistency: null, high_risk_semantic_weight: null, overall_risk_score: null, overall_risk_level: 'unknown', semantic_consistency_delta: null, high_risk_semantic_weight_delta: null, language_distribution: [], risk_evidence: [] })
  await start(); await fill(); await button('查询当前范围最新结果').trigger('click'); await flushPromises()
  expect(wrapper.findAll('.metric strong').map(item => item.text())).toEqual(['—', '—', '—', '—'])
  expect(wrapper.text()).toContain('无可比基线')
  mock.latestMultilingual.mockResolvedValue({ ...result, data_weight_classification_accuracy: 0 })
  await button('查询当前范围最新结果').trigger('click'); await flushPromises()
  expect(wrapper.find('.metric strong').text()).toBe('0%')
})

it('结果暂不可用显示真实错误，可按 ID 重试', async () => {
  mock.multilingualTask.mockResolvedValue({ ...task, status: 'succeeded', result_id: 'multi-result' })
  mock.multilingualResult.mockRejectedValueOnce(new ApiError(409, '结果暂不可用', 'result-trace'))
  await start(); await wrapper.find('input[placeholder="输入多语种任务 ID"]').setValue('multi-task')
  await button('查询任务').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('result-trace'); expect(mock.multilingualSamples).not.toHaveBeenCalled()
  await wrapper.find('input[placeholder="输入多语种结果 ID"]').setValue('multi-result')
  await button('按结果 ID 查看').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('结构化数据集'); expect(wrapper.text()).not.toContain('result-trace')
})

it('切换令牌忽略旧查询响应并清理结果、历史和任务', async () => {
  let finish!: (value: unknown) => void
  mock.latestMultilingual.mockReturnValue(new Promise(resolve => { finish = resolve }))
  await start(); await fill(); await button('查询当前范围历史').trigger('click'); await flushPromises()
  await button('查询当前范围最新结果').trigger('click'); await flushPromises()
  session.setBearer('new-owner'); await flushPromises()
  finish(result); await flushPromises()
  expect(wrapper.text()).not.toContain('multi-result'); expect(wrapper.text()).not.toContain('结构化数据集')
  expect(mock.multilingualSamples).not.toHaveBeenCalled(); expect(mock.models).toHaveBeenCalledTimes(2)
})

it('切换令牌后旧建单响应不再触发任务轮询或读取结果', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  let finish!: (value: unknown) => void
  mock.createMultilingual.mockReturnValue(new Promise(resolve => { finish = resolve }))
  await start(); await fill(); await button('提交多语种分析').trigger('click'); await flushPromises()
  session.setBearer('new-owner'); await flushPromises(); finish(task); await flushPromises()
  await vi.advanceTimersByTimeAsync(6000)
  expect(mock.multilingualTask).not.toHaveBeenCalled(); expect(wrapper.text()).not.toContain('multi-task')
})

it('切换结果忽略上一结果的未完成分页请求', async () => {
  await start(); await fill(); await button('查询当前范围最新结果').trigger('click'); await flushPromises()
  let finish!: (value: unknown) => void
  mock.multilingualSamples.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  wrapper.findComponent(ElPagination).vm.$emit('current-change', 2); await flushPromises()
  mock.multilingualResult.mockResolvedValue({ ...result, id: 'new-result', dataset_name: '新的数据集快照' })
  mock.multilingualSamples.mockResolvedValue({ items: [{ ...sample, text: '新结果正文' }], total: 1, page: 1, page_size: 20, total_pages: 1 })
  await wrapper.find('input[placeholder="输入多语种结果 ID"]').setValue('new-result')
  await button('按结果 ID 查看').trigger('click'); await flushPromises()
  finish({ items: [{ ...sample, text: '过期分页正文' }], total: 41, page: 2, page_size: 20, total_pages: 3 }); await flushPromises()
  expect(wrapper.text()).toContain('新结果正文'); expect(wrapper.text()).not.toContain('过期分页正文')
  expect(wrapper.findComponent(ElPagination).props('currentPage')).toBe(1)
})

it('切换令牌忽略旧任务状态响应，停止后台轮询', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  await start(); await fill(); await button('提交多语种分析').trigger('click'); await flushPromises()
  let finish!: (value: unknown) => void
  mock.multilingualTask.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  await vi.advanceTimersByTimeAsync(3000)
  session.setBearer('new-owner'); await flushPromises()
  finish({ ...task, status: 'succeeded', result_id: 'multi-result' }); await flushPromises()
  await vi.advanceTimersByTimeAsync(6000)
  expect(mock.multilingualTask).toHaveBeenCalledTimes(1)
  expect(mock.multilingualResult).not.toHaveBeenCalled(); expect(wrapper.text()).not.toContain('multi-task')
})
