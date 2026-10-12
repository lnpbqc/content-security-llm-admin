// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus, { ElDialog, ElMessageBox } from 'element-plus'
import ModelsView from '@/views/ModelsView.vue'
import { session } from '@/stores/session'

const mock = vi.hoisted(() => ({ models: vi.fn(), model: vi.fn(), createModel: vi.fn(), updateModel: vi.fn(), deleteModel: vi.fn() }))
vi.mock('@/api', () => ({ api: mock }))
const model = { model_id: 'm1', upstream_model_id: 'upstream', name: '模型', base_url: 'http://localhost/v1', description: '', created_at: 'now', updated_at: 'now' }
let wrapper: VueWrapper
function button(text: string) { return wrapper.findAll('button').find(item => item.text().trim() === text)! }
beforeEach(() => { for (const fn of Object.values(mock)) fn.mockReset(); session.setBearer('owner'); session.setAdmin(''); mock.models.mockResolvedValue([model]); mock.model.mockResolvedValue(model) })
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); document.body.innerHTML = '' })
it('模型可查询，缺少管理员密钥阻止新增、保存和删除', async () => {
  wrapper = mount(ModelsView, { global: { plugins: [ElementPlus] } }); await flushPromises()
  expect(mock.models).toHaveBeenCalled()
  await button('新增模型').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('同时录入访问令牌与管理员密钥')
  expect(wrapper.findComponent(ElDialog).props('modelValue')).toBe(false)
  await button('删除').trigger('click'); await flushPromises(); expect(mock.deleteModel).not.toHaveBeenCalled()
  await button('编辑').trigger('click'); await flushPromises()
  const dialog = wrapper.findComponent(ElDialog)
  await dialog.findAll('button').find(item => item.text().trim() === '保存')!.trigger('click'); await flushPromises()
  expect(mock.updateModel).not.toHaveBeenCalled()
})
it('双凭据编辑保留旧 API Key；删除确认后再次检查凭据', async () => {
  session.setAdmin('setup')
  wrapper = mount(ModelsView, { global: { plugins: [ElementPlus] } }); await flushPromises()
  await button('编辑').trigger('click'); await flushPromises()
  await wrapper.findComponent(ElDialog).findAll('button').find(item => item.text().trim() === '保存')!.trigger('click'); await flushPromises()
  expect(mock.updateModel).toHaveBeenCalledWith('m1', { upstream_model_id: 'upstream', name: '模型', base_url: 'http://localhost/v1', description: '' })
  vi.spyOn(ElMessageBox, 'confirm').mockImplementation(async () => { session.setAdmin(''); return 'confirm' })
  await button('删除').trigger('click'); await flushPromises()
  expect(mock.deleteModel).not.toHaveBeenCalled()
})
