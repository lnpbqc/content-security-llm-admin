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
  it('切换任务后旧轮询的完成不会产生重复定时器', async () => {
    vi.useFakeTimers()
    let finish!: (status: 'running') => void
    const load = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue('running')
    const poller = createTaskPoller(load)
    poller.start(); await vi.advanceTimersByTimeAsync(3000)
    poller.stop(); poller.start(); finish('running'); await Promise.resolve()
    await vi.advanceTimersByTimeAsync(3000)
    expect(load).toHaveBeenCalledTimes(2)
    poller.stop()
  })
  it('旧轮询失败不会停止新任务的轮询', async () => {
    vi.useFakeTimers()
    let fail!: (error: Error) => void
    const load = vi.fn().mockImplementationOnce(() => new Promise((_, reject) => { fail = reject })).mockResolvedValue('running')
    const poller = createTaskPoller(load)
    poller.start(); await vi.advanceTimersByTimeAsync(3000)
    poller.stop(); poller.start(); fail(new Error('旧请求失败')); await Promise.resolve()
    await vi.advanceTimersByTimeAsync(3000)
    expect(load).toHaveBeenCalledTimes(2); expect(poller.active).toBe(true)
    poller.stop()
  })
})
