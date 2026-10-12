// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import AnalysisView from '@/views/AnalysisView.vue'
import { ApiError } from '@/api/client'
import { session } from '@/stores/session'

const mock = vi.hoisted(() => ({ models: vi.fn(), analysisOptions: vi.fn(), analysisRecords: vi.fn(), analysisRecord: vi.fn(), analyzeScenario: vi.fn(), analyzeGovernance: vi.fn(), analyzeAudit: vi.fn() }))
vi.mock('@/api', () => ({ api: mock }))
const route = reactive({ params: { area: 'scenario' } })
vi.mock('vue-router', () => ({ useRoute: () => route }))
let wrapper: VueWrapper
const record = { id: 'analysis-1', kind: 'scenario', scenario_code: 'public_opinion', model_id: 'model-1', input: {}, status: 'succeeded', created_at: '2026-10-10', finished_at: '2026-10-10', result: { summary: '分析完成' }, original_output: null, error_message: null, error_code: null, calls: [] }

function button(text: string) { return wrapper.findAll('button').find(item => item.text().trim() === text)! }
async function setField(label: string, value: string) { const field = wrapper.findAll('.field').find(item => item.find('label').text() === label)!; await field.find('textarea, input').setValue(value) }
async function start(area = 'scenario') { route.params.area = area; wrapper = mount(AnalysisView, { global: { plugins: [ElementPlus] } }); await flushPromises(); wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'model-1'); await flushPromises() }

beforeEach(() => {
  for (const fn of Object.values(mock)) fn.mockReset()
  session.setBearer('owner')
  mock.models.mockResolvedValue([{ model_id: 'model-1', name: '测试模型' }])
  mock.analysisOptions.mockResolvedValue({ analysis_types: ['scenario', 'model_governance', 'audit'], audit_types: ['reasoning', 'full_chain'], scenarios: [{ code: 'public_opinion', name: '舆情分析', input_requirements: '提供原始材料' }, { code: 'cross_cultural', name: '跨文化', input_requirements: '' }] })
  mock.analysisRecords.mockResolvedValue({ items: [], total: 0 })
  mock.analyzeScenario.mockResolvedValue(record)
  mock.analyzeGovernance.mockResolvedValue({ ...record, kind: 'model_governance' })
  mock.analyzeAudit.mockResolvedValue({ ...record, kind: 'audit' })
})
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; vi.restoreAllMocks() })

it('场景提交保留材料，非跨文化场景不附加目标语言', async () => {
  await start()
  await setField('分析正文', '原始输入')
  await setField('补充材料 JSON（可选）', '[{"id":"m1","content":"引用材料"}]')
  await button('提交分析').trigger('click'); await flushPromises()
  expect(mock.analyzeScenario).toHaveBeenCalledWith({ model_id: 'model-1', scenario_code: 'public_opinion', content: '原始输入', language: 'zh', materials: [{ id: 'm1', content: '引用材料' }] })
  expect(wrapper.text()).toContain('分析完成')
})

it('非法 JSON 和重复材料阻止请求', async () => {
  await start(); await setField('分析正文', '原始输入'); await setField('补充材料 JSON（可选）', '{')
  await button('提交分析').trigger('click'); await flushPromises()
  expect(mock.analyzeScenario).not.toHaveBeenCalled(); expect(wrapper.text()).toContain('有效 JSON')
})

it('治理失败仍展示原始生成、关联调用、记录 ID 和 trace_id', async () => {
  await start('governance')
  mock.analyzeGovernance.mockRejectedValue(new ApiError(502, '治理上游失败', 'trace-failed', { ...record, kind: 'model_governance', status: 'failed', original_output: '第一阶段已有回答', error_message: '治理上游失败', calls: [{ call_id: 'call-1' }] }))
  await setField('生成提示词', '生成回答'); await button('提交分析').trigger('click'); await flushPromises()
  expect(mock.analyzeGovernance).toHaveBeenCalledWith({ model_id: 'model-1', prompt: '生成回答' })
  expect(wrapper.text()).toContain('第一阶段已有回答'); expect(wrapper.text()).toContain('analysis-1'); expect(wrapper.text()).toContain('trace-failed')
})

it('全链路审计发送观测步骤和显式引用，缺失引用阻止提交', async () => {
  await start('audit')
  wrapper.findComponent({ name: 'ElRadioGroup' }).vm.$emit('update:modelValue', 'full_chain')
  await setField('审计对象 ID', 'case'); await setField('对象类型', 'workflow'); await setField('对象版本', 'v1')
  await setField('可观测步骤 JSON', '[{"id":"s1","label":"审核","detail":"记录","rule_refs":["missing"]}]')
  await button('提交分析').trigger('click'); await flushPromises()
  expect(mock.analyzeAudit).not.toHaveBeenCalled(); expect(wrapper.text()).toContain('rule_refs')
  await setField('规则 JSON', '[{"id":"missing","text":"规则内容"}]')
  await button('提交分析').trigger('click'); await flushPromises()
  expect(mock.analyzeAudit).toHaveBeenCalledWith(expect.objectContaining({ audit_type: 'full_chain', subject: { id: 'case', type: 'workflow', version: 'v1' }, rules: [{ id: 'missing', text: '规则内容' }] }))
})

it('更换令牌后忽略尚未结束的旧分析响应', async () => {
  await start(); await setField('分析正文', '旧令牌输入')
  let finish!: (value: unknown) => void
  mock.analyzeScenario.mockReturnValue(new Promise(resolve => { finish = resolve }))
  await button('提交分析').trigger('click'); await flushPromises()
  session.setBearer('new-owner'); await flushPromises()
  finish(record); await flushPromises()
  expect(wrapper.text()).not.toContain('分析完成'); expect(wrapper.text()).not.toContain('analysis-1')
})

it('连续查询记录时较早返回的旧请求不会覆盖最新选择', async () => {
  await start('records')
  let finish!: (value: unknown) => void
  mock.analysisRecord.mockReturnValueOnce(new Promise(resolve => { finish = resolve })).mockResolvedValueOnce({ ...record, id: 'new-record' })
  const input = wrapper.find('input[placeholder="输入分析记录 ID"]')
  await input.setValue('old-record'); await button('按 ID 查询').trigger('click'); await flushPromises()
  await input.setValue('new-record'); await button('按 ID 查询').trigger('click'); await flushPromises()
  finish({ ...record, id: 'old-record' }); await flushPromises()
  expect(wrapper.find('.detail-list').text()).toContain('new-record')
  expect(wrapper.find('.detail-list').text()).not.toContain('old-record')
})
