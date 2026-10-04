import type { TaskStatus } from '@/types/api'

export function shouldPoll(status: TaskStatus): boolean { return status === 'pending' || status === 'running' }

export function createTaskPoller(load: () => Promise<TaskStatus>, interval = 3000) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let active = false
  const tick = async () => {
    if (!active) return
    try {
      const status = await load()
      if (active && shouldPoll(status)) timer = setTimeout(tick, interval)
      else active = false
    } catch { active = false }
  }
  return {
    start() { if (active) return; active = true; timer = setTimeout(tick, interval) },
    stop() { active = false; if (timer) clearTimeout(timer) },
    get active() { return active },
  }
}
