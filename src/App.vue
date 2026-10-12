<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api } from '@/api'
import { session } from '@/stores/session'

const route = useRoute()
const reachable = ref<boolean | null>(null)
const credentialOpen = ref(false)
const bearerDraft = ref('')
const adminDraft = ref('')
const nav = [
  { path: '/tokens', label: '访问令牌', group: '系统管理' },
  { path: '/models', label: '模型配置', group: '系统管理' },
  { path: '/governance-config', label: '治理任务配置', group: '系统管理' },
  { path: '/invoke', label: '通用模型调用', group: '模型调用' },
  { path: '/calls', label: '调用记录', group: '模型调用' },
  { path: '/training', label: '模型训练', group: '训练与分析' },
  { path: '/neural-trace', label: '神经因果溯源', group: '训练与分析' },
  { path: '/analysis/scenario', label: '场景分析', group: '训练与分析' },
  { path: '/analysis/governance', label: '模型治理', group: '训练与分析' },
  { path: '/analysis/audit', label: '推理与全链路审计', group: '训练与分析' },
  { path: '/analysis/records', label: '分析记录', group: '训练与分析' },
  { path: '/governance/value', label: '价值分析', group: '数据治理' },
  { path: '/governance/anomaly', label: '异常治理', group: '数据治理' },
  { path: '/governance/risk', label: '风险分级', group: '数据治理' },
]
async function checkHealth() { try { await api.health(); reachable.value = true } catch { reachable.value = false } }
function saveBearer() { session.setBearer(bearerDraft.value); bearerDraft.value = ''; ElMessage.success('访问令牌已保存于当前会话') }
function saveAdmin() { session.setAdmin(adminDraft.value); adminDraft.value = ''; ElMessage.success('管理员密钥已保存于当前会话') }
onMounted(checkHealth)
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">CS</span><div><strong>内容安全管理端</strong><small>Content Security LLM</small></div></div>
      <template v-for="group in ['系统管理', '模型调用', '训练与分析', '数据治理']" :key="group">
        <p class="nav-group">{{ group }}</p>
        <router-link v-for="item in nav.filter(entry => entry.group === group)" :key="item.path" :to="item.path" class="nav-link" :class="{ active: route.path === item.path }">{{ item.label }}</router-link>
      </template>
      <div class="sidebar-foot">所有任务与结果按访问令牌隔离</div>
    </aside>
    <div class="main-area">
      <header class="topbar">
        <div class="topbar-status">
          <el-tag :type="reachable === true ? 'success' : reachable === false ? 'danger' : 'info'" effect="plain">API {{ reachable === true ? '可达' : reachable === false ? '不可达' : '检测中' }}</el-tag>
          <el-button link @click="checkHealth">重新检查</el-button>
          <span class="divider"></span>
          <span>Bearer：{{ session.bearer.value ? '已输入' : '未输入' }}</span>
          <span>管理员密钥：{{ session.admin.value ? '已输入' : '未输入' }}</span>
        </div>
        <el-button @click="credentialOpen = true">会话凭据</el-button>
      </header>
      <main class="workspace"><RouterView /></main>
    </div>
    <el-dialog v-model="credentialOpen" title="会话凭据" width="min(520px, 94vw)" :close-on-click-modal="false" @closed="bearerDraft = ''; adminDraft = ''">
      <p class="muted">两套凭据分别使用。仅保存在当前浏览器标签页会话中。</p>
      <div class="credential-block"><label>Bearer 访问令牌</label><el-input v-model="bearerDraft" type="password" show-password autocomplete="off" placeholder="输入访问令牌" /><div class="row end"><el-button @click="session.setBearer('')">清除</el-button><el-button type="primary" :disabled="!bearerDraft.trim()" @click="saveBearer">保存访问令牌</el-button></div></div>
      <div class="credential-block"><label>管理员密钥 X-Setup-Secret</label><el-input v-model="adminDraft" type="password" show-password autocomplete="off" placeholder="输入管理员密钥" /><div class="row end"><el-button @click="session.setAdmin('')">清除</el-button><el-button type="primary" :disabled="!adminDraft.trim()" @click="saveAdmin">保存管理员密钥</el-button></div></div>
    </el-dialog>
  </div>
</template>
