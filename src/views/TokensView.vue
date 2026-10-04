<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '@/api'
import { ApiError, errorMessage } from '@/api/client'
import type { BusinessUser, Page, Token } from '@/types/api'
import { required, validExpiry, validToken } from '@/utils/forms'

const rows = ref<Token[]>([])
const error = ref('')
const loading = ref(false)

const usersOpen = ref(false)
const users = ref<Page<BusinessUser> | null>(null)
const usersLoading = ref(false)
const usersError = ref('')
const keywordInput = ref('')
const searchedKeyword = ref('')
const userPage = ref(1)
let userRequestId = 0

const createOpen = ref(false)
const selectedUser = ref<BusinessUser | null>(null)
const creating = ref(false)
const createError = ref('')
const shownToken = ref('')
const newToken = ref('')
const expires = ref('')
const label = ref('')

const actionBusyId = ref('')
const labelOpen = ref(false)
const labelId = ref('')
const labelText = ref('')

function generate() {
  if (creating.value) return
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  newToken.value = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}
async function load(): Promise<boolean> {
  loading.value = true
  error.value = ''
  try { rows.value = await api.tokens(); return true }
  catch (e) { rows.value = []; error.value = errorMessage(e); return false }
  finally { loading.value = false }
}

async function loadUsers() {
  const requestId = ++userRequestId
  usersLoading.value = true
  usersError.value = ''
  users.value = null
  try {
    const params = { page: userPage.value, page_size: 20, ...(searchedKeyword.value ? { keyword: searchedKeyword.value } : {}) }
    const page = await api.businessUsers(params)
    if (requestId === userRequestId && usersOpen.value) users.value = page
  } catch (e) {
    if (requestId === userRequestId && usersOpen.value) usersError.value = errorMessage(e)
  } finally {
    if (requestId === userRequestId) usersLoading.value = false
  }
}
function openUsers() {
  keywordInput.value = ''
  searchedKeyword.value = ''
  userPage.value = 1
  usersOpen.value = true
  void loadUsers()
}
function searchUsers() { searchedKeyword.value = keywordInput.value.trim(); userPage.value = 1; void loadUsers() }
function changeUserPage(page: number) { userPage.value = page; void loadUsers() }
function closeUsers() { ++userRequestId; users.value = null; usersError.value = ''; usersLoading.value = false }
function selectUser(user: BusinessUser) {
  if (usersLoading.value || !user.enabled) return
  selectedUser.value = user
  newToken.value = ''
  expires.value = ''
  label.value = ''
  createError.value = ''
  shownToken.value = ''
  generate()
  usersOpen.value = false
  createOpen.value = true
}
function openManual() {
  selectedUser.value = null
  newToken.value = ''
  expires.value = ''
  label.value = ''
  createError.value = ''
  shownToken.value = ''
  createOpen.value = true
}
function closeCreate() {
  shownToken.value = ''
  newToken.value = ''
  expires.value = ''
  label.value = ''
  selectedUser.value = null
  createError.value = ''
}
async function create() {
  if (creating.value || shownToken.value) return
  const user = selectedUser.value
  if (!validToken(newToken.value) || !validExpiry(expires.value) || (!user && label.value.length > 100) ||
      (user && (!user.enabled || !/^[0-9a-f]{64}$/.test(newToken.value)))) {
    createError.value = '请检查令牌、未来过期时间及标签；业务用户令牌须为系统生成的 64 位十六进制值'
    return
  }
  creating.value = true
  createError.value = ''
  const submittedToken = newToken.value
  let created = false
  try {
    await api.createToken({ token: submittedToken, expires_at: new Date(expires.value).toISOString(), label: user ? `business-user:${user.id}` : label.value.trim() })
    created = true
    shownToken.value = submittedToken
    newToken.value = ''
    expires.value = ''
    label.value = ''
  } catch (e) {
    createError.value = e instanceof ApiError && e.status === 409
      ? '令牌已存在，请检查现有登记状态；不要重复创建'
      : errorMessage(e)
  } finally { creating.value = false }
  if (!created) return
  ElMessage.success(user ? '已为该用户创建模型令牌，请立即复制' : '令牌已创建，请立即复制')
  if (!await load()) ElMessage.warning('令牌已创建，但列表刷新失败。请保存原文后重试刷新列表，不要重新创建。')
}
async function copy() { try { await navigator.clipboard.writeText(shownToken.value); ElMessage.success('已复制') } catch { ElMessage.error('复制失败，请手动复制') } }
async function changeStatus(row: Token) {
  if (actionBusyId.value) return
  const enabled = !row.enabled
  actionBusyId.value = row.id
  try {
    await ElMessageBox.confirm(`确定${enabled ? '启用' : '禁用'}令牌 ${row.label || row.id}？${enabled ? '已过期的令牌启用后仍不可用。' : '禁用后该令牌无法访问接口。'}`, '修改令牌状态', { type: 'warning', confirmButtonText: '确认修改' })
    error.value = ''
    const updated = await api.tokenStatusById(row.id, enabled)
    rows.value = rows.value.map(item => item.id === updated.id ? updated : item)
    ElMessage.success('令牌状态已更新')
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') error.value = errorMessage(e)
  } finally { actionBusyId.value = '' }
}
async function deleteToken(row: Token) {
  if (actionBusyId.value) return
  actionBusyId.value = row.id
  try {
    await ElMessageBox.confirm(`确定删除令牌 ${row.label || row.id}（ID：${row.id}）？删除后立即失效并从列表消失，不能重新启用或用相同原文重新创建；历史调用记录仍保留。`, '删除令牌', { type: 'warning', confirmButtonText: '确认删除' })
    error.value = ''
    await api.deleteToken(row.id)
    rows.value = rows.value.filter(item => item.id !== row.id)
    ElMessage.success('令牌已删除')
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') error.value = errorMessage(e)
  } finally { actionBusyId.value = '' }
}
async function bulk(enabled: boolean) {
  try { await ElMessageBox.confirm(`将${enabled ? '启用' : '禁用'}当前全部令牌。${enabled ? '' : '禁用后这些令牌无法访问接口。'}确定继续？`, '批量修改令牌状态', { type: 'warning', confirmButtonText: '确认修改' }); const result = await api.allTokenStatus(enabled); await load(); ElMessage.success(`已更新 ${result.updated_count} 枚令牌`) } catch (e) { if (e !== 'cancel' && e !== 'close') error.value = errorMessage(e) }
}
async function saveLabel() { if (!required(labelText.value) || labelText.value.length > 100) { error.value = '标签须为 1–100 字符'; return } try { await api.labelToken(labelId.value, labelText.value.trim()); labelOpen.value = false; labelText.value = ''; await load() } catch (e) { error.value = errorMessage(e) } }
function expired(row: Token) { return new Date(row.expires_at).getTime() <= Date.now() }
onMounted(load)
onBeforeUnmount(() => { ++userRequestId })
</script>

<template>
  <div class="page-header">
    <div><h1>访问令牌</h1><p class="muted">管理员密钥负责令牌管理；业务用户使用独立模型令牌访问模型接口。</p></div>
    <div class="row"><el-button @click="openManual">手动创建令牌</el-button><el-button type="primary" @click="openUsers">获取业务用户并授权</el-button></div>
  </div>
  <div class="section">
    <div class="section-header"><h2>模型令牌列表</h2><div class="row"><el-button @click="load">刷新</el-button><el-dropdown trigger="click"><el-button>批量操作</el-button><template #dropdown><el-dropdown-menu><el-dropdown-item @click="bulk(true)">启用全部</el-dropdown-item><el-dropdown-item @click="bulk(false)">禁用全部</el-dropdown-item></el-dropdown-menu></template></el-dropdown></div></div>
    <p v-if="error" class="error">{{ error }}</p>
    <el-table :data="rows" v-loading="loading" empty-text="暂无令牌，或尚未输入管理员密钥" class="data-table">
      <el-table-column prop="id" label="令牌 ID" min-width="220"><template #default="{ row }"><span class="mono">{{ row.id }}</span></template></el-table-column>
      <el-table-column label="持有人 / 用途标签" min-width="180"><template #default="{ row }">{{ row.label || '未标注' }} <el-button v-if="!row.label" link type="primary" @click="labelId = row.id; labelOpen = true">补充标签</el-button></template></el-table-column>
      <el-table-column prop="created_at" label="创建时间" min-width="175" /><el-table-column prop="expires_at" label="过期时间" min-width="175" />
      <el-table-column label="状态" width="145"><template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '禁用' }}</el-tag><span v-if="expired(row)" class="muted" style="margin-left:6px">已过期</span></template></el-table-column>
      <el-table-column label="操作" width="150"><template #default="{ row }"><el-button link :type="row.enabled ? 'warning' : 'primary'" :disabled="!!actionBusyId" @click="changeStatus(row)">{{ row.enabled ? '禁用' : '启用' }}</el-button><el-button link type="danger" :disabled="!!actionBusyId" @click="deleteToken(row)">删除</el-button></template></el-table-column>
    </el-table>
    <p class="field-hint">标签仅标记持有人，不代表该用户整体放行。业务账号停用不会自动禁用模型令牌；过期令牌重新启用后仍不可用。可在列表中按令牌 ID 启停单枚令牌。</p>
  </div>

  <el-dialog v-model="usersOpen" title="选择业务用户" width="min(760px, 96vw)" :close-on-click-modal="false" @closed="closeUsers">
    <p class="muted">用户目录由模型服务查询业务后端。选择启用用户后会创建一枚独立模型令牌。</p>
    <div class="toolbar" style="margin-top:16px"><el-input v-model="keywordInput" placeholder="搜索账号或姓名" clearable @keyup.enter="searchUsers" /><el-button :disabled="usersLoading" @click="searchUsers">搜索</el-button><el-button :disabled="usersLoading" @click="loadUsers">重试 / 刷新</el-button></div>
    <el-alert v-if="usersError" :title="usersError" type="error" :closable="false" style="margin-bottom:16px" />
    <el-table v-if="!usersError" :data="users?.items || []" v-loading="usersLoading" :empty-text="usersLoading ? '正在查询' : '没有匹配的业务用户'" class="data-table">
      <el-table-column prop="username" label="账号" min-width="150" /><el-table-column prop="display_name" label="姓名" min-width="120" /><el-table-column prop="role" label="角色" min-width="120" />
      <el-table-column label="业务账号状态" width="130"><template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</el-tag></template></el-table-column>
      <el-table-column label="操作" width="90"><template #default="{ row }"><el-button link type="primary" :disabled="usersLoading || !row.enabled" @click="selectUser(row)">选择</el-button></template></el-table-column>
    </el-table>
    <el-pagination v-if="!usersError && users" style="margin-top:16px;justify-content:flex-end" background layout="prev, pager, next, total" :current-page="userPage" :page-size="20" :total="users.total" :disabled="usersLoading" @current-change="changeUserPage" />
  </el-dialog>

  <el-dialog v-model="createOpen" :title="selectedUser ? '为业务用户创建模型令牌' : '创建访问令牌'" width="min(560px, 94vw)" :close-on-click-modal="false" :close-on-press-escape="!creating" :show-close="!creating" @closed="closeCreate">
    <div v-if="selectedUser" class="warning" style="margin-bottom:16px">账号：{{ selectedUser.username }} · 姓名：{{ selectedUser.display_name }} · 业务 ID：{{ selectedUser.id }}<br />本次会创建独立模型令牌；业务账号状态不参与模型令牌鉴权。</div>
    <template v-if="shownToken"><el-alert :title="selectedUser ? '已为该用户创建模型令牌。请交给对应用户使用；关闭后无法再次查看原文。' : '创建成功。关闭后无法再次查看令牌原文。'" type="warning" :closable="false" /><pre class="pre mono">{{ shownToken }}</pre><el-button type="primary" @click="copy">复制令牌原文</el-button></template>
    <template v-else>
      <div class="field"><label>令牌原文</label><div class="row"><el-input v-model="newToken" type="password" show-password autocomplete="off" :disabled="creating || !!selectedUser" style="flex:1" /><el-button :disabled="creating" @click="generate">{{ selectedUser ? '重新生成' : '安全随机生成' }}</el-button></div><p class="field-hint">{{ selectedUser ? '使用浏览器安全随机数生成 64 位十六进制令牌。' : '至少 32 字符。提交前请确认可妥善保存。' }}</p></div>
      <div class="field" style="margin-top:14px"><label>过期时间</label><el-input v-model="expires" type="datetime-local" :disabled="creating" /></div>
      <div class="field" style="margin-top:14px"><label>持有人 / 用途标签</label><el-input v-if="selectedUser" :model-value="`business-user:${selectedUser.id}`" disabled /><el-input v-else v-model="label" maxlength="100" :disabled="creating" placeholder="可选，建议创建时填写" /></div>
      <p v-if="createError" class="error">{{ createError }}</p><div class="row end"><el-button type="primary" :loading="creating" :disabled="creating" @click="create">创建</el-button></div>
    </template>
  </el-dialog>
  <el-dialog v-model="labelOpen" title="补充旧令牌标签" width="min(480px, 94vw)"><p class="muted">标签只能补充一次，已有标签不能修改。</p><el-input v-model="labelText" maxlength="100" style="margin-top:14px" /><p v-if="error" class="error">{{ error }}</p><template #footer><el-button @click="labelOpen = false">取消</el-button><el-button type="primary" @click="saveLabel">保存</el-button></template></el-dialog>
</template>
