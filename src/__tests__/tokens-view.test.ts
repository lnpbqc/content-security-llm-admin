// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import TokensView from '@/views/TokensView.vue'
import { ApiError } from '@/api/client'

const mock = vi.hoisted(() => ({
  tokens: vi.fn(),
  businessUsers: vi.fn(),
  createToken: vi.fn(),
  tokenStatusById: vi.fn(),
  deleteToken: vi.fn(),
}))
vi.mock('@/api', () => ({ api: mock }))

const firstPage = { items: [
  { id: 12, username: 'zhangsan', display_name: '张三', role: '普通用户', enabled: true },
  { id: 13, username: 'lisi', display_name: '李四', role: '普通用户', enabled: false },
], total: 21, page: 1, page_size: 20, total_pages: 2 }

function button(text: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll('button')].find(item => item.textContent?.includes(text))
  if (!found) throw new Error(`找不到按钮：${text}`)
  return found
}
function click(text: string) { button(text).click() }
function exactButton(text: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll('button')].find(item => item.textContent?.trim() === text && !item.closest('[style*="display: none"]'))
  if (!found) throw new Error(`找不到按钮：${text}`)
  return found
}
async function chooseFirstUser() {
  click('获取业务用户并授权')
  await flushPromises()
  exactButton('选择').click()
  await flushPromises()
}
function setExpiry() {
  const input = document.body.querySelector('input[type="datetime-local"]') as HTMLInputElement
  input.value = new Date(Date.now() + 86_400_000).toISOString().slice(0, 16)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => {
  mock.tokens.mockReset().mockResolvedValue([])
  mock.businessUsers.mockReset().mockResolvedValue(firstPage)
  mock.createToken.mockReset().mockResolvedValue({ created_at: '', expires_at: '', enabled: true })
  mock.tokenStatusById.mockReset()
  mock.deleteToken.mockReset()
})
afterEach(() => { document.body.innerHTML = '' })

it('按行删除须确认，成功后只移除目标令牌', async () => {
  const first = { id: 'token-1', label: '甲', created_at: '2026-01-01', expires_at: '2030-01-01', enabled: true }
  const second = { ...first, id: 'token-2', label: '乙' }
  mock.tokens.mockResolvedValue([first, second])
  mock.deleteToken.mockResolvedValue({ id: first.id, deleted: true })
  const wrapper = mount(TokensView, { attachTo: document.body, global: { plugins: [ElementPlus] } })
  await flushPromises()
  exactButton('删除').click()
  await flushPromises()
  expect(document.body.textContent).toContain('删除后立即失效')
  expect(mock.deleteToken).not.toHaveBeenCalled()
  exactButton('确认删除').click()
  await flushPromises()
  expect(mock.deleteToken).toHaveBeenCalledWith('token-1')
  expect(document.body.querySelector('.el-table__body')?.textContent).not.toContain('token-1')
  expect(document.body.querySelector('.el-table__body')?.textContent).toContain('token-2')
  wrapper.unmount()
})

it('删除失败保留令牌并显示接口错误', async () => {
  const token = { id: 'token-1', label: '甲', created_at: '2026-01-01', expires_at: '2030-01-01', enabled: true }
  mock.tokens.mockResolvedValue([token])
  mock.deleteToken.mockRejectedValue(new ApiError(403, '管理员密钥错误，请重新输入', 'trace-403'))
  const wrapper = mount(TokensView, { attachTo: document.body, global: { plugins: [ElementPlus] } })
  await flushPromises()
  exactButton('删除').click()
  await flushPromises()
  exactButton('确认删除').click()
  await flushPromises()
  expect(document.body.textContent).toContain('管理员密钥错误，请重新输入')
  expect(document.body.textContent).toContain('trace-403')
  expect(document.body.querySelector('.el-table__body')?.textContent).toContain('token-1')
  wrapper.unmount()
})

it('从令牌列表按 ID 禁用，确认后更新状态且不要求原文', async () => {
  const token = { id: 'token-1', label: '测试', created_at: '2026-01-01', expires_at: '2030-01-01', enabled: true }
  mock.tokens.mockResolvedValue([token])
  mock.tokenStatusById.mockResolvedValue({ ...token, enabled: false })
  const wrapper = mount(TokensView, { attachTo: document.body, global: { plugins: [ElementPlus] } })
  await flushPromises()
  exactButton('禁用').click()
  await flushPromises()
  expect(document.body.textContent).toContain('确定禁用令牌 测试')
  expect(mock.tokenStatusById).not.toHaveBeenCalled()
  exactButton('确认修改').click()
  await flushPromises()
  expect(mock.tokenStatusById).toHaveBeenCalledWith('token-1', false)
  expect(document.body.querySelector('input[autocomplete="off"][type="password"]')).toBeNull()
  expect(exactButton('启用')).toBeTruthy()
  mock.tokenStatusById.mockResolvedValue({ ...token, enabled: true })
  exactButton('启用').click()
  await flushPromises()
  exactButton('确认修改').click()
  await flushPromises()
  expect(mock.tokenStatusById).toHaveBeenLastCalledWith('token-1', true)
  expect(exactButton('禁用')).toBeTruthy()
  wrapper.unmount()
})

it('查询业务用户、阻止选择停用用户，并在搜索时重置分页', async () => {
  mock.businessUsers.mockImplementation(async ({ page }: { page: number }) => ({ ...firstPage, page }))
  const wrapper = mount(TokensView, { attachTo: document.body, global: { plugins: [ElementPlus] } })
  await flushPromises()
  click('获取业务用户并授权')
  await flushPromises()
  expect(mock.businessUsers).toHaveBeenCalledWith({ page: 1, page_size: 20 })
  expect(document.body.textContent).toContain('张三')
  const selectionButtons = [...document.body.querySelectorAll('button')].filter(item => item.textContent?.trim() === '选择')
  expect(selectionButtons).toHaveLength(2)
  expect(selectionButtons[1]?.disabled).toBe(true)
  ;(document.body.querySelector('.el-pagination .btn-next') as HTMLButtonElement).click()
  await flushPromises()
  expect(mock.businessUsers).toHaveBeenLastCalledWith({ page: 2, page_size: 20 })
  const input = document.body.querySelector('input[placeholder="搜索账号或姓名"]') as HTMLInputElement
  input.value = ' 张 '
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
  click('搜索')
  await flushPromises()
  expect(mock.businessUsers).toHaveBeenLastCalledWith({ page: 1, page_size: 20, keyword: '张' })
  wrapper.unmount()
})

it('空列表与查询失败分别展示，失败后可重试', async () => {
  mock.businessUsers.mockRejectedValueOnce(new ApiError(504, '业务用户查询超时，请重试', 'trace-504')).mockResolvedValueOnce({ ...firstPage, items: [], total: 0, total_pages: 0 })
  const wrapper = mount(TokensView, { attachTo: document.body, global: { plugins: [ElementPlus] } })
  await flushPromises()
  click('获取业务用户并授权')
  await flushPromises()
  expect(document.body.textContent).toContain('业务用户查询超时，请重试')
  expect(document.body.textContent).toContain('trace-504')
  expect([...document.body.querySelectorAll('button')].filter(item => item.textContent?.trim() === '选择')).toHaveLength(0)
  click('重试 / 刷新')
  await flushPromises()
  expect(document.body.textContent).toContain('没有匹配的业务用户')
  wrapper.unmount()
})

it('关闭授权创建弹窗后清除用户选择与待提交原文', async () => {
  const wrapper = mount(TokensView, { attachTo: document.body, global: { plugins: [ElementPlus] } })
  await flushPromises()
  await chooseFirstUser()
  const dialog = [...document.body.querySelectorAll('.el-dialog')].find(item => item.textContent?.includes('为业务用户创建模型令牌'))
  expect(dialog).toBeTruthy()
  const generated = (dialog?.querySelector('input[type="password"]') as HTMLInputElement).value
  expect(generated).toMatch(/^[0-9a-f]{64}$/)
  ;(dialog?.querySelector('.el-dialog__headerbtn') as HTMLButtonElement).click()
  await new Promise(resolve => setTimeout(resolve, 350))
  await flushPromises()
  click('手动创建令牌')
  await flushPromises()
  const manual = [...document.body.querySelectorAll('.el-dialog')].find(item => item.textContent?.includes('创建访问令牌'))
  expect(manual?.textContent).not.toContain('业务 ID：12')
  expect((manual?.querySelector('input[type="password"]') as HTMLInputElement).value).toBe('')
  expect(manual?.querySelector('input[placeholder="可选，建议创建时填写"]')).toBeTruthy()
  wrapper.unmount()
})

it('为启用用户生成固定标签，提交期间拒绝重复创建', async () => {
  let finish!: (value: unknown) => void
  mock.createToken.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const wrapper = mount(TokensView, { attachTo: document.body, global: { plugins: [ElementPlus] } })
  await flushPromises()
  await chooseFirstUser()
  expect([...document.body.querySelectorAll('input')].some(input => input.value === 'business-user:12' && input.disabled)).toBe(true)
  setExpiry()
  await flushPromises()
  exactButton('创建').click()
  await flushPromises()
  expect(mock.createToken).toHaveBeenCalledTimes(1)
  const body = mock.createToken.mock.calls[0]?.[0] as { token: string; expires_at: string; label: string }
  expect(body.token).toMatch(/^[0-9a-f]{64}$/)
  expect(body.label).toBe('business-user:12')
  expect(body.expires_at).toContain('T')
  expect(exactButton('创建').disabled).toBe(true)
  exactButton('创建').click()
  expect(mock.createToken).toHaveBeenCalledTimes(1)
  finish({ created_at: '', expires_at: '', enabled: true })
  await flushPromises()
  expect(document.body.textContent).toContain('请交给对应用户使用')
  expect(mock.tokens).toHaveBeenCalledTimes(2)
  wrapper.unmount()
})

it('创建失败保留同一令牌重试；成功但列表刷新失败仍显示创建成功', async () => {
  mock.createToken.mockRejectedValueOnce(new Error('提交失败')).mockResolvedValueOnce({ created_at: '', expires_at: '', enabled: true })
  mock.tokens.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('列表刷新失败'))
  const wrapper = mount(TokensView, { attachTo: document.body, global: { plugins: [ElementPlus] } })
  await flushPromises()
  await chooseFirstUser()
  setExpiry()
  await flushPromises()
  exactButton('创建').click()
  await flushPromises()
  expect(document.body.textContent).toContain('提交失败')
  exactButton('创建').click()
  await flushPromises()
  expect(mock.createToken).toHaveBeenCalledTimes(2)
  expect(mock.createToken.mock.calls[1]?.[0].token).toBe(mock.createToken.mock.calls[0]?.[0].token)
  expect(document.body.textContent).toContain('请交给对应用户使用')
  expect(document.body.textContent).toContain('列表刷新失败')
  wrapper.unmount()
})

it('原手动创建仍可填写自定义标签', async () => {
  const wrapper = mount(TokensView, { attachTo: document.body, global: { plugins: [ElementPlus] } })
  await flushPromises()
  click('手动创建令牌')
  await flushPromises()
  const tokenInput = document.body.querySelector('input[type="password"]') as HTMLInputElement
  tokenInput.value = 'm'.repeat(32)
  tokenInput.dispatchEvent(new Event('input', { bubbles: true }))
  const labelInput = document.body.querySelector('input[placeholder="可选，建议创建时填写"]') as HTMLInputElement
  labelInput.value = ' 验证用途 '
  labelInput.dispatchEvent(new Event('input', { bubbles: true }))
  setExpiry()
  await flushPromises()
  exactButton('创建').click()
  await flushPromises()
  expect(mock.createToken).toHaveBeenCalledWith(expect.objectContaining({ token: 'm'.repeat(32), label: '验证用途' }))
  wrapper.unmount()
})

it('令牌已存在时不显示创建成功，也不丢失本次令牌', async () => {
  mock.createToken.mockRejectedValueOnce(new ApiError(409, 'token_already_exists'))
  const wrapper = mount(TokensView, { attachTo: document.body, global: { plugins: [ElementPlus] } })
  await flushPromises()
  await chooseFirstUser()
  setExpiry()
  await flushPromises()
  const token = (document.body.querySelector('input[type="password"]') as HTMLInputElement).value
  exactButton('创建').click()
  await flushPromises()
  expect(document.body.textContent).toContain('令牌已存在，请检查现有登记状态')
  expect(document.body.textContent).not.toContain('请交给对应用户使用')
  expect((document.body.querySelector('input[type="password"]') as HTMLInputElement).value).toBe(token)
  wrapper.unmount()
})
