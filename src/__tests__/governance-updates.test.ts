// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import GovernanceWorkspace from '@/views/GovernanceWorkspace.vue'
import GovernanceConfigView from '@/views/GovernanceConfigView.vue'
import { ApiError } from '@/api/client'

const mock = vi.hoisted(() => ({ governanceOptions: vi.fn(), governanceOverview: vi.fn(), createTask: vi.fn(), task: vi.fn(), latestResult: vi.fn(), samples: vi.fn(), exportRisk: vi.fn(), riskKnowledge: vi.fn(), sample: vi.fn(), bindings: vi.fn(), models: vi.fn(), setBinding: vi.fn() }))
vi.mock('@/api', () => ({ api: mock, taskId: (task: { id: string }) => task.id }))
const route = reactive({ params: { area: 'risk' } })
vi.mock('vue-router', () => ({ useRoute: () => route }))
vi.mock('@/utils/download', () => ({ saveFile: vi.fn() }))
let wrapper: VueWrapper
const scope = { dataset_id: 5, version_id: 'v1', language: 'zh', scheme_id: 'risk-v2' }
function button(text: string) { return wrapper.findAll('button').find(item => item.text().trim() === text)! }

beforeEach(() => {
  for (const fn of Object.values(mock)) fn.mockReset()
  sessionStorage.clear()
  mock.governanceOptions.mockResolvedValue({ schemes: [{ id: 'risk-v2', name: '服务端新方案' }] })
  mock.governanceOverview.mockResolvedValue({ cards: [{ label: '有效检测语料', value: 17 }], definitions: ['仅统计当前令牌'] })
  mock.createTask.mockResolvedValue({ id: 'task-1', status: 'pending', created_at: '', result_id: null, error_message: null })
  mock.latestResult.mockResolvedValue({ id: 'result-1', task_id: 'task-1', dataset_name: '测试数据集', finished_at: '', scope })
  mock.samples.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 10 })
  mock.exportRisk.mockResolvedValue([{ id: 'sample-1', text: '已遮蔽正文' }])
  mock.riskKnowledge.mockResolvedValue([{ id: 'rule-1', name: '快照规则', text: '规则正文' }])
  mock.sample.mockResolvedValue({ id: 'sample-1', text: '已遮蔽正文', evidence: [] })
  mock.bindings.mockResolvedValue({}); mock.models.mockResolvedValue([])
})
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = '' })

it('治理配置仅保留模型绑定，数据库连接改由服务端启动配置管理', async () => {
  wrapper = mount(GovernanceConfigView, { global: { plugins: [ElementPlus] } }); await flushPromises()
  expect(mock.bindings).toHaveBeenCalledOnce()
  expect(mock.models).toHaveBeenCalledOnce()
  expect(wrapper.text()).not.toContain('保存业务库配置')
  expect(wrapper.text()).not.toContain('测试已保存连接')
  expect(wrapper.text()).toContain('数据库连接由服务端启动配置管理')
  expect(wrapper.findAll('button').filter(item => item.text() === '保存绑定')).toHaveLength(3)
})

it('治理方案与概览来自服务端，旧创建任务仍仅发送原四元组', async () => {
  wrapper = mount(GovernanceWorkspace, { global: { plugins: [ElementPlus] } }); await flushPromises()
  expect(wrapper.text()).toContain('有效检测语料'); expect(wrapper.text()).toContain('17')
  wrapper.findComponent({ name: 'ScopeFields' }).vm.$emit('update:modelValue', scope)
  await wrapper.find('input[placeholder="输入本次任务名称"]').setValue('验证旧流程')
  await button('创建任务').trigger('click'); await flushPromises()
  expect(mock.createTask).toHaveBeenCalledWith({ kind: 'governance-risk', name: '验证旧流程', input: scope })
  expect(mock.governanceOptions).toHaveBeenCalledWith('governance-risk')
})

it('风险导出使用已查询结果和筛选条件，不受当前样本页限制', async () => {
  wrapper = mount(GovernanceWorkspace, { global: { plugins: [ElementPlus] } }); await flushPromises()
  wrapper.findComponent({ name: 'ScopeFields' }).vm.$emit('update:modelValue', scope); await flushPromises()
  await wrapper.findAll('[role="tab"]').find(item => item.text() === '只读结果')!.trigger('click')
  await button('查询当前范围最新结果').trigger('click'); await flushPromises()
  await button('导出匹配样本 JSON').trigger('click'); await flushPromises()
  expect(mock.exportRisk).toHaveBeenCalledWith('result-1', { keyword: '', level: '', status: '' })
  expect(mock.createTask).not.toHaveBeenCalled()
})

it('规则检索使用选中结果与样本快照，不创建新的模型任务', async () => {
  mock.samples.mockResolvedValue({ items: [{ id: 'sample-1', text: '已遮蔽正文' }], total: 1 })
  wrapper = mount(GovernanceWorkspace, { attachTo: document.body, global: { plugins: [ElementPlus] } }); await flushPromises()
  wrapper.findComponent({ name: 'ScopeFields' }).vm.$emit('update:modelValue', scope); await flushPromises()
  await wrapper.findAll('[role="tab"]').find(item => item.text() === '只读结果')!.trigger('click')
  await button('查询当前范围最新结果').trigger('click'); await flushPromises()
  await button('查看').trigger('click'); await flushPromises()
  const search = document.body.querySelector('input[placeholder="规则关键词"]') as HTMLInputElement
  search.value = '规则'; search.dispatchEvent(new Event('input', { bubbles: true }))
  const searchButton = [...document.body.querySelectorAll('button')].find(item => item.textContent?.trim() === '检索规则')!
  searchButton.click(); await flushPromises()
  expect(mock.riskKnowledge).toHaveBeenCalledWith('result-1', 'sample-1', '规则')
  expect(mock.createTask).not.toHaveBeenCalled()
  expect(document.body.textContent).toContain('快照规则')
})

it('三类模型绑定保存仍调用原接口', async () => {
  mock.bindings.mockResolvedValue({ 'governance-value': 'model-1' })
  mock.models.mockResolvedValue([{ model_id: 'model-1', name: '治理模型' }])
  mock.setBinding.mockResolvedValue({ kind: 'governance-value', model_id: 'model-1' })
  wrapper = mount(GovernanceConfigView, { global: { plugins: [ElementPlus] } }); await flushPromises()
  await button('保存绑定').trigger('click'); await flushPromises()
  expect(mock.setBinding).toHaveBeenCalledWith('governance-value', 'model-1')
})

it('模型绑定加载失败保留服务端消息及追踪 ID，刷新后清除', async () => {
  mock.bindings.mockRejectedValueOnce(new ApiError(403, '管理员密钥错误', 'binding-trace'))
  wrapper = mount(GovernanceConfigView, { global: { plugins: [ElementPlus] } }); await flushPromises()
  expect(wrapper.text()).toContain('管理员密钥错误')
  expect(wrapper.text()).toContain('binding-trace')
  await button('刷新配置').trigger('click'); await flushPromises()
  expect(wrapper.text()).not.toContain('binding-trace')
})
