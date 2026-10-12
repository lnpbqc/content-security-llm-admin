import type { TaskStatus } from '@/types/api'

export function shouldPoll(status: TaskStatus): boolean { return status === 'pending' || status === 'running' }

export function createTaskPoller(load: () => Promise<TaskStatus>, interval = 3000) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let active = false
  let revision = 0
  const tick = async (current: number) => {
    if (!active || current !== revision) return
    try {
      const status = await load()
      if (current !== revision) return
      if (active && shouldPoll(status)) timer = setTimeout(() => tick(current), interval)
      else active = false
    } catch { if (current === revision) active = false }
  }
  return {
    start() { if (active) return; active = true; const current = ++revision; timer = setTimeout(() => tick(current), interval) },
    stop() { revision++; active = false; if (timer) clearTimeout(timer) },
    get active() { return active },
  }
}
