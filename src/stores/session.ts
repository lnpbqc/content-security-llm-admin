import { ref } from 'vue'

const bearer = ref(sessionStorage.getItem('cs-bearer') || '')
const admin = ref(sessionStorage.getItem('cs-admin') || '')
const bearerRevision = ref(0)

function setBearer(value: string) {
  bearer.value = value.trim()
  if (bearer.value) sessionStorage.setItem('cs-bearer', bearer.value)
  else sessionStorage.removeItem('cs-bearer')
  bearerRevision.value++
}

function setAdmin(value: string) {
  admin.value = value.trim()
  if (admin.value) sessionStorage.setItem('cs-admin', admin.value)
  else sessionStorage.removeItem('cs-admin')
}

export const session = { bearer, admin, bearerRevision, setBearer, setAdmin }
