// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import GovernanceWorkspace from '@/views/GovernanceWorkspace.vue'
import GovernanceConfigView from '@/views/GovernanceConfigView.vue'
import { ApiError } from '@/api/client'

const mock = vi.hoisted(() => ({ governanceOptions: vi.fn(), governanceOverview: vi.fn(), createTask: vi.fn(), task: vi.fn(), latestResult: vi.fn(), samples: vi.fn(), exportRisk: vi.fn(), riskKnowledge: vi.fn(), sample: vi.fn(), bindings: vi.fn(), models: vi.fn(), businessDatabase: vi.fn(), setBusinessDatabase: vi.fn(), testBusinessDatabase: vi.fn() }))
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
  mock.businessDatabase.mockResolvedValue({ host: 'localhost', port: 3306, database: 'business', username: 'reader', password_configured: true })
  mock.testBusinessDatabase.mockResolvedValue({ connected: true, checks: ['connection', 'query', 'datasets', 'dataset_records'], elapsed_ms: 7, checked_at: '2026-10-10T01:38:14+00:00' })
})
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = '' })

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

it('连接测试只测试已保存配置，不提交当前表单或要求重新输入密码', async () => {
  wrapper = mount(GovernanceConfigView, { global: { plugins: [ElementPlus] } }); await flushPromises()
  await wrapper.findAll('.field').find(field => field.find('label').text() === '主机')!.find('input').setValue('unsaved-host')
  await button('测试已保存连接').trigger('click'); await flushPromises()
  expect(mock.testBusinessDatabase).toHaveBeenCalledWith()
  expect(mock.setBusinessDatabase).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('MySQL 连通，治理所需表及字段可读')
  expect(wrapper.text()).toContain('检测的是已保存配置；修改后请先保存')
  expect(wrapper.text()).toContain('2026-10-10T01:38:14+00:00'); expect(wrapper.text()).toContain('7 毫秒')
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

it('连接测试失败展示后端消息及追踪 ID', async () => {
  mock.testBusinessDatabase.mockRejectedValue(new ApiError(502, 'MySQL 已连通，但 datasets 检查失败', 'db-trace'))
  wrapper = mount(GovernanceConfigView, { global: { plugins: [ElementPlus] } }); await flushPromises()
  await button('测试已保存连接').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('datasets 检查失败'); expect(wrapper.text()).toContain('db-trace')
})

it('未配置时禁用检测，页面加载不自动检测', async () => {
  mock.businessDatabase.mockResolvedValue(null)
  wrapper = mount(GovernanceConfigView, { global: { plugins: [ElementPlus] } }); await flushPromises()
  expect(button('测试已保存连接').attributes('disabled')).toBeDefined()
  expect(mock.testBusinessDatabase).not.toHaveBeenCalled()
  expect(wrapper.text()).not.toContain('已测试通过')
})

it('检测进行中禁止重复检测、保存和刷新，成功后展示本次通过状态', async () => {
  let finish!: (value: unknown) => void
  mock.testBusinessDatabase.mockReturnValue(new Promise(resolve => { finish = resolve }))
  wrapper = mount(GovernanceConfigView, { global: { plugins: [ElementPlus] } }); await flushPromises()
  await button('测试已保存连接').trigger('click'); await flushPromises()
  expect(button('保存业务库配置').attributes('disabled')).toBeDefined()
  expect(button('刷新配置').attributes('disabled')).toBeDefined()
  await button('测试已保存连接').trigger('click'); await flushPromises()
  expect(mock.testBusinessDatabase).toHaveBeenCalledTimes(1)
  finish({ connected: true, checks: ['connection', 'query', 'datasets', 'dataset_records'], elapsed_ms: 2054, checked_at: '2026-10-10T01:38:14+00:00' }); await flushPromises()
  expect(wrapper.text()).toContain('已测试通过')
  expect(wrapper.text()).toContain('2054 毫秒')
  expect(button('保存业务库配置').attributes('disabled')).toBeUndefined()
})

it('保存进行中禁用检测，成功保存后清空密码和旧通过状态且不自动检测', async () => {
  wrapper = mount(GovernanceConfigView, { global: { plugins: [ElementPlus] } }); await flushPromises()
  await button('测试已保存连接').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('已测试通过')
  const password = wrapper.find('input[type="password"]'); await password.setValue('new-password')
  let finish!: (value: unknown) => void
  mock.setBusinessDatabase.mockReturnValue(new Promise(resolve => { finish = resolve }))
  await button('保存业务库配置').trigger('click'); await flushPromises()
  expect(button('测试已保存连接').attributes('disabled')).toBeDefined()
  expect(button('保存业务库配置').attributes('disabled')).toBeDefined()
  expect(button('刷新配置').attributes('disabled')).toBeDefined()
  finish({ host: 'localhost', port: 3306, database: 'business', username: 'reader', password_configured: true }); await flushPromises()
  expect((password.element as HTMLInputElement).value).toBe('')
  expect(wrapper.text()).toContain('已保存，尚未测试')
  expect(wrapper.text()).not.toContain('已测试通过')
  expect(mock.testBusinessDatabase).toHaveBeenCalledTimes(1)
  await button('测试已保存连接').trigger('click'); await flushPromises()
  expect(mock.testBusinessDatabase).toHaveBeenCalledTimes(2)
})

it('刷新配置立即清除旧检测结果，刷新失败也不保留通过状态', async () => {
  wrapper = mount(GovernanceConfigView, { global: { plugins: [ElementPlus] } }); await flushPromises()
  await button('测试已保存连接').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('已测试通过')
  mock.businessDatabase.mockRejectedValue(new ApiError(403, '管理员密钥错误，请重新输入', 'refresh-trace'))
  await button('刷新配置').trigger('click'); await flushPromises()
  expect(wrapper.text()).not.toContain('已测试通过')
  expect(wrapper.text()).not.toContain('2026-10-10T01:38:14+00:00')
  expect(wrapper.text()).toContain('refresh-trace')
})

it.each([
  new ApiError(403, '管理员密钥错误，请重新输入', 'admin-trace'),
  new ApiError(409, '请先保存业务数据库配置', 'config-trace'),
  new ApiError(500, '已保存的数据库密码无法解密，请重新保存配置', 'decrypt-trace'),
  new ApiError(502, '数据库账号或密码错误，或该账号不允许从本服务主机访问', 'connect-trace'),
  new ApiError(502, 'MySQL 已连通，但 datasets 检查失败', 'query-trace'),
  new ApiError(0, '无法连接 API，请检查服务地址与代理配置'),
])('再次检测失败清除旧成功状态，并保留准确错误：$message', async failure => {
  wrapper = mount(GovernanceConfigView, { global: { plugins: [ElementPlus] } }); await flushPromises()
  await button('测试已保存连接').trigger('click'); await flushPromises()
  mock.testBusinessDatabase.mockRejectedValueOnce(failure)
  await button('测试已保存连接').trigger('click'); await flushPromises()
  expect(wrapper.text()).not.toContain('已测试通过')
  expect(wrapper.text()).not.toContain('MySQL 连通，治理所需表及字段可读')
  expect(wrapper.text()).toContain('检测失败')
  expect(wrapper.text()).toContain(failure.message)
  if (failure.traceId) expect(wrapper.text()).toContain(failure.traceId)
})
