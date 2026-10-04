<script setup lang="ts">
import type { TaskStatus } from '@/types/api'
defineProps<{ status: TaskStatus }>()
const labels = { pending: '等待中', running: '运行中', succeeded: '已完成', failed: '失败' }
const types = { pending: 'info', running: 'warning', succeeded: 'success', failed: 'danger' } as const
</script>
<template><el-tag :type="types[status]" effect="light">{{ labels[status] }}</el-tag></template>
