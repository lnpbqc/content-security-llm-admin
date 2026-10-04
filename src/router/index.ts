import { createRouter, createWebHistory } from 'vue-router'

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/tokens' },
    { path: '/tokens', component: () => import('@/views/TokensView.vue') },
    { path: '/models', component: () => import('@/views/ModelsView.vue') },
    { path: '/governance-config', component: () => import('@/views/GovernanceConfigView.vue') },
    { path: '/invoke', component: () => import('@/views/InvokeView.vue') },
    { path: '/calls', component: () => import('@/views/CallsView.vue') },
    { path: '/governance/:area', component: () => import('@/views/GovernanceWorkspace.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/tokens' },
  ],
})
