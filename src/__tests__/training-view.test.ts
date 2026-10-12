// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus, { ElInputNumber, ElMessageBox, ElRadioGroup, ElSelect, ElSwitch } from 'element-plus'
import TrainingView from '@/views/TrainingView.vue'
import { session } from '@/stores/session'

const mock = vi.hoisted(() => ({ trainingDefaults: vi.fn(), trainingTasks: vi.fn(), trainingTask: vi.fn(), trainingMetrics: vi.fn(), trainingArtifacts: vi.fn(), createTraining: vi.fn(), cancelTraining: vi.fn(), downloadTraining: vi.fn(), trainingScripts: vi.fn(), createScriptTraining: vi.fn(), trainingLogs: vi.fn() }))
vi.mock('@/api', () => ({ api: mock }))
const input = { name: '分类示例', dataset_id: 1, version_id: 'v1', python_source: 'def build_model(params): pass', contract: { inputs: { x: { dtype: 'float32', shape: [null, 2] } }, targets: { dtype: 'int64', shape: [null] }, outputs: { dtype: 'float32', shape: [null, 2] } }, model_params: { classes: 2 }, loss: 'auto' }
const task = { ...input, id: 'training-1', status: 'running', progress: 25, epoch: 1, step: 3, elapsed: '3 秒', created_at: '2026-10-10', error_message: null, latest_metrics: { loss: 0.5 }, config: {}, runtime: {} }
let wrapper: VueWrapper
function button(text: string) { return wrapper.findAll('button').find(item => item.text().trim() === text)! }
async function start() { wrapper = mount(TrainingView, { global: { plugins: [ElementPlus] } }); await flushPromises() }

beforeEach(() => {
  for (const fn of Object.values(mock)) fn.mockReset()
  session.setBearer('owner'); session.setAdmin('setup')
  mock.trainingDefaults.mockResolvedValue({ defaults: { epochs: 10, batch_size: 8, learning_rate: 0.0002, task_type: 'multiclass' }, supported: { task_types: ['multiclass'] }, example_request: input, custom_example_request: { ...input, loss: 'custom' }, example_record: {} })
  mock.trainingTasks.mockResolvedValue({ items: [task], total: 1 })
  mock.trainingTask.mockResolvedValue(task)
  mock.trainingMetrics.mockResolvedValue({ items: [{ id: 1, epoch: 1, step: 3, phase: 'train', metrics: { loss: 0.5 } }], next_after_id: 1, has_more: false })
  mock.trainingArtifacts.mockResolvedValue([])
  mock.createTraining.mockResolvedValue(task)
  mock.trainingScripts.mockResolvedValue([{ id: 'cifar100-cnn', name: 'CNN', description: '登记脚本', inputs_schema: { properties: { download: { default: true } } }, parameters_schema: { properties: { epochs: { default: 3 } } } }])
  mock.trainingLogs.mockResolvedValue({ text: '', next_after_offset: 0, has_more: false })
})
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); vi.restoreAllMocks(); document.body.innerHTML = '' })

it('服务端示例填表后创建，不发送展示专用字段', async () => {
  await start(); await button('载入分类示例').trigger('click'); await button('提交训练任务').trigger('click'); await flushPromises()
  expect(mock.createTraining).toHaveBeenCalledWith({ ...input, epochs: 10, batch_size: 8, learning_rate: 0.0002, task_type: 'multiclass' })
  expect(mock.trainingTask).toHaveBeenCalledWith('training-1')
  expect(mock.trainingMetrics).toHaveBeenCalledWith('training-1', 0)
})

it('缺少管理员密钥时阻止训练创建', async () => {
  await start(); session.setAdmin(''); await button('载入分类示例').trigger('click'); await button('提交训练任务').trigger('click'); await flushPromises()
  expect(mock.createTraining).not.toHaveBeenCalled(); expect(wrapper.text()).toContain('同时录入访问令牌和管理员密钥')
})

it('增量指标使用游标，取消中仍轮询直到已取消后停止', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  await start(); await button('查看').trigger('click'); await flushPromises()
  mock.cancelTraining.mockResolvedValue({ ...task, status: 'canceling' })
  mock.trainingTask.mockResolvedValue({ ...task, status: 'canceling' })
  mock.trainingMetrics.mockResolvedValue({ items: [], next_after_id: 1, has_more: false })
  vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm')
  await button('取消任务').trigger('click'); await flushPromises()
  expect(mock.cancelTraining).toHaveBeenCalledWith('training-1')
  expect(wrapper.text()).toContain('取消中')
  expect(mock.trainingMetrics).toHaveBeenLastCalledWith('training-1', 1)
  mock.trainingTask.mockResolvedValue({ ...task, status: 'canceled' })
  await vi.advanceTimersByTimeAsync(3000); await flushPromises()
  expect(wrapper.text()).toContain('已取消')
  const count = mock.trainingTask.mock.calls.length
  await vi.advanceTimersByTimeAsync(6000); await flushPromises()
  expect(mock.trainingTask).toHaveBeenCalledTimes(count)
})

it('令牌切换清除旧任务详情且忽略旧查询响应', async () => {
  await start()
  let finish!: (value: unknown) => void
  mock.trainingTask.mockReturnValue(new Promise(resolve => { finish = resolve }))
  await button('查看').trigger('click'); await flushPromises()
  mock.trainingTasks.mockResolvedValue({ items: [], total: 0 })
  session.setBearer('other-owner'); await flushPromises()
  finish(task); await flushPromises()
  expect(wrapper.text()).not.toContain('training-1'); expect(mock.trainingMetrics).not.toHaveBeenCalled()
})

it('登记脚本不要求业务数据或源码，仅发送脚本输入与参数', async () => {
  await start()
  wrapper.findComponent(ElRadioGroup).vm.$emit('update:modelValue', 'script'); await flushPromises()
  wrapper.findComponent(ElSelect).vm.$emit('update:modelValue', 'cifar100-cnn'); await flushPromises()
  await wrapper.find('input[placeholder="脚本任务名称"]').setValue('真实脚本')
  await button('载入脚本默认参数').trigger('click')
  mock.createScriptTraining.mockResolvedValue({ ...task, runner: 'script', script_id: 'cifar100-cnn' })
  await button('提交训练任务').trigger('click'); await flushPromises()
  expect(mock.createScriptTraining).toHaveBeenCalledWith({ name: '真实脚本', script_id: 'cifar100-cnn', inputs: { download: true }, parameters: { epochs: 3 } })
  expect(mock.createTraining).not.toHaveBeenCalled()
})

it('任意指标完整显示，空进度不伪造百分比；日志沿用后端字节游标', async () => {
  const script = { ...task, runner: 'script', epoch: null, step: null, progress: null, elapsed: undefined, elapsed_seconds: 17 }
  mock.trainingTask.mockResolvedValue(script)
  mock.trainingMetrics.mockResolvedValue({ items: [{ id: 7, metrics: { 'score.v1': 0.82 }, created_at: 'now' }], next_after_id: 7, has_more: false })
  mock.trainingLogs.mockResolvedValueOnce({ text: '中文日志\r\n', next_after_offset: 1234, has_more: true }).mockResolvedValue({ text: '结束', next_after_offset: 1240, has_more: false })
  await start(); await button('查看').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('score.v1'); expect(wrapper.text()).toContain('0.82')
  expect(wrapper.text()).toContain('未上报进度'); expect(wrapper.find('.el-progress').exists()).toBe(false)
  expect(wrapper.text()).toContain('17 秒'); expect(wrapper.text()).toContain('中文日志')
  await button('加载更多日志').trigger('click'); await flushPromises()
  expect(mock.trainingLogs).toHaveBeenLastCalledWith('training-1', 1234, 65536)
  expect(wrapper.find('pre.training-log').text()).toContain('中文日志\r\n结束')
})

it('日志读取失败保留指标并允许增大字节预算重试，令牌切换忽略旧日志', async () => {
  mock.trainingLogs.mockRejectedValueOnce(new Error('请增大 limit 以容纳完整日志行'))
  await start(); await button('查看').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('请增大 limit'); expect(wrapper.text()).toContain('0.5')
  let finish!: (value: unknown) => void
  mock.trainingLogs.mockReturnValue(new Promise(resolve => { finish = resolve }))
  wrapper.findAllComponents(ElSelect).at(-1)!.vm.$emit('update:modelValue', 1048576)
  await button('刷新日志').trigger('click'); await flushPromises()
  expect(mock.trainingLogs).toHaveBeenLastCalledWith('training-1', 0, 1048576)
  session.setBearer('new-owner'); await flushPromises()
  finish({ text: '旧日志不可泄漏', next_after_offset: 99, has_more: false }); await flushPromises()
  expect(wrapper.text()).not.toContain('旧日志不可泄漏')
})

it('脚本输入不是 JSON 对象时不建单', async () => {
  await start()
  wrapper.findComponent(ElRadioGroup).vm.$emit('update:modelValue', 'script'); await flushPromises()
  wrapper.findComponent(ElSelect).vm.$emit('update:modelValue', 'cifar100-cnn'); await flushPromises()
  await wrapper.find('input[placeholder="脚本任务名称"]').setValue('脚本任务')
  await wrapper.findAll('textarea')[0]!.setValue('[]')
  await button('提交训练任务').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('脚本输入必须是 JSON 对象'); expect(mock.createScriptTraining).not.toHaveBeenCalled()
})

it('建单后刷新列表期间切换令牌，不用新令牌读取旧任务', async () => {
  await start(); await button('载入分类示例').trigger('click')
  let finish!: (value: unknown) => void
  mock.trainingTasks.mockReturnValueOnce(new Promise(resolve => { finish = resolve })).mockResolvedValue({ items: [], total: 0 })
  await button('提交训练任务').trigger('click'); await flushPromises()
  session.setBearer('new-owner'); await flushPromises()
  finish({ items: [task], total: 1 }); await flushPromises()
  expect(mock.trainingTask).not.toHaveBeenCalled(); expect(wrapper.text()).not.toContain('training-1')
})

it('选择 CIFAR 脚本自动填默认值，中文表单修改后按原契约提交', async () => {
  mock.trainingScripts.mockResolvedValue([{ id: 'cifar100-cnn', name: 'CNN', description: '登记脚本', inputs_schema: { properties: { download: { type: 'boolean', default: true } } }, parameters_schema: { properties: { epochs: { type: 'integer', default: 3, minimum: 1 }, batch_size: { type: 'integer', default: 128, minimum: 1 }, learning_rate: { type: 'number', default: 0.001, exclusiveMinimum: 0 }, seed: { type: 'integer', default: 42, minimum: 0, maximum: 4294967295 }, device: { type: 'string', enum: ['cuda', 'cpu'], default: 'cuda' }, train_samples: { type: 'integer', default: 10000, minimum: 100, maximum: 49900 }, validation_samples: { type: 'integer', default: 2000, minimum: 100, maximum: 49900 } } } }])
  await start()
  wrapper.findComponent(ElRadioGroup).vm.$emit('update:modelValue', 'script'); await flushPromises()
  wrapper.findComponent(ElSelect).vm.$emit('update:modelValue', 'cifar100-cnn'); await flushPromises()
  expect(wrapper.text()).toContain('日志和指标由脚本自动上报，无需填写')
  expect(wrapper.text()).toContain('训练样本数'); expect(wrapper.text()).toContain('首次运行')
  expect(wrapper.findAllComponents(ElInputNumber)[0]!.props('modelValue')).toBe(3)
  wrapper.findAllComponents(ElInputNumber)[0]!.vm.$emit('update:modelValue', 1)
  wrapper.findComponent(ElSwitch).vm.$emit('update:modelValue', false)
  await wrapper.find('input[placeholder="脚本任务名称"]').setValue('一轮实验')
  await button('提交训练任务').trigger('click'); await flushPromises()
  expect(mock.createScriptTraining).toHaveBeenCalledWith({ name: '一轮实验', script_id: 'cifar100-cnn', inputs: { download: false }, parameters: { epochs: 1, batch_size: 128, learning_rate: 0.001, seed: 42, device: 'cuda', train_samples: 10000, validation_samples: 2000 } })
})

it('切换登记脚本时清理上一脚本参数，并仍可通过高级 JSON 编辑', async () => {
  await start()
  wrapper.findComponent(ElRadioGroup).vm.$emit('update:modelValue', 'script'); await flushPromises()
  wrapper.findComponent(ElSelect).vm.$emit('update:modelValue', 'cifar100-cnn'); await flushPromises()
  await wrapper.findAll('textarea')[0]!.setValue('{"download":false}')
  wrapper.findComponent(ElSelect).vm.$emit('update:modelValue', ''); await flushPromises()
  expect((wrapper.findAll('textarea')[0]!.element as HTMLTextAreaElement).value).toBe('{}')
  wrapper.findComponent(ElSelect).vm.$emit('update:modelValue', 'cifar100-cnn'); await flushPromises()
  expect((wrapper.findAll('textarea')[0]!.element as HTMLTextAreaElement).value).toContain('true')
})
