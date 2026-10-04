import { describe, expect, it } from 'vitest'
import { taskPayload, validDatabase, validExpiry, validModel, validScope, validToken } from '@/utils/forms'

describe('关键表单', () => {
  it('校验令牌长度与未来过期时间', () => { expect(validToken('a'.repeat(32))).toBe(true); expect(validToken('short')).toBe(false); expect(validExpiry(new Date(Date.now() + 60000).toISOString())).toBe(true); expect(validExpiry(new Date(Date.now() - 60000).toISOString())).toBe(false) })
  it('模型要求上游 ID、名称、HTTP 地址及新密钥', () => { const input = { upstream_model_id: 'u', name: 'n', base_url: 'https://example.com/v1', api_key: 'k' }; expect(validModel(input)).toBe(true); expect(validModel({ ...input, api_key: '' })).toBe(false); expect(validModel({ ...input, base_url: 'file:///tmp' })).toBe(false) })
  it('业务库保存必须重新输入密码，范围必须完整', () => { expect(validDatabase({ host: 'localhost', port: 3306, database: 'data', username: 'u', password: '' })).toBe(false); expect(validScope({ dataset_id: 1, version_id: '', language: 'zh', scheme_id: 'general-v1' })).toBe(false) })
  it('任务请求只包含 kind、name 和四元组 input', () => { const scope = { dataset_id: 3, version_id: 'v1', language: 'zh', scheme_id: 'risk-v1' }; expect(taskPayload('governance-risk', ' 检查 ', scope)).toEqual({ kind: 'governance-risk', name: '检查', input: scope }) })
})
