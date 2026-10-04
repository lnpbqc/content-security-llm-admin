import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTaskPoller, shouldPoll } from '@/utils/polling'

afterEach(() => vi.useRealTimers())

describe('任务轮询', () => {
  it('仅 pending 与 running 继续', () => { expect(shouldPoll('pending')).toBe(true); expect(shouldPoll('running')).toBe(true); expect(shouldPoll('succeeded')).toBe(false); expect(shouldPoll('failed')).toBe(false) })
  it.each(['succeeded', 'failed'] as const)('%s 后停止轮询', async status => {
    vi.useFakeTimers()
    const load = vi.fn().mockResolvedValueOnce('running').mockResolvedValueOnce(status)
    const poller = createTaskPoller(load, 3000)
    poller.start()
    await vi.advanceTimersByTimeAsync(9000)
    expect(load).toHaveBeenCalledTimes(2)
    expect(poller.active).toBe(false)
  })
  it('离页调用 stop 后不再请求', async () => { vi.useFakeTimers(); const load = vi.fn().mockResolvedValue('pending'); const poller = createTaskPoller(load, 3000); poller.start(); poller.stop(); await vi.advanceTimersByTimeAsync(9000); expect(load).not.toHaveBeenCalled() })
  it('查询出错时停止', async () => { vi.useFakeTimers(); const load = vi.fn().mockRejectedValue(new Error('401')); const poller = createTaskPoller(load, 3000); poller.start(); await vi.advanceTimersByTimeAsync(9000); expect(load).toHaveBeenCalledTimes(1); expect(poller.active).toBe(false) })
})
