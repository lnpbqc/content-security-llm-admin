import { describe, expect, it } from 'vitest'
import type { AuditInput, ScenarioInput } from '@/types/api'
import { jsonArray, jsonObject, validateAudit, validateScenario } from '@/utils/analysis'

const scenario: ScenarioInput = { model_id: 'm1', scenario_code: 'public_opinion', content: '待分析正文', language: 'zh', materials: [] }
const audit: AuditInput = { model_id: 'm1', audit_type: 'full_chain', subject: { id: 'case', type: 'workflow', version: 'v1' }, steps: [{ id: 's1', label: '检查', detail: '观测日志', evidence_refs: ['e1'], rule_refs: ['r1'] }], evidence: [{ id: 'e1', content: '证据原文' }], rules: [{ id: 'r1', text: '规则要求' }] }

describe('分析输入契约', () => {
  it('JSON 格式和结构错误在提交前提示', () => {
    expect(() => jsonObject('{', '参数')).toThrow('有效 JSON')
    expect(() => jsonObject('[]', '参数')).toThrow('JSON 对象')
    expect(() => jsonArray('{}', '材料')).toThrow('JSON 数组')
  })
  it('正文长度、语种、保留 ID 和重复材料均校验', () => {
    expect(() => validateScenario(scenario)).not.toThrow()
    expect(() => validateScenario({ ...scenario, content: 'x'.repeat(50001) })).toThrow('50000')
    expect(() => validateScenario({ ...scenario, language: 'all' })).not.toThrow()
    expect(() => validateScenario({ ...scenario, language: '中文' })).toThrow('语种')
    expect(() => validateScenario({ ...scenario, materials: [{ id: 'input', content: '材料' }] })).toThrow('保留')
    expect(() => validateScenario({ ...scenario, materials: [{ id: 'm1', content: '一' }, { id: ' m1 ', content: '二' }] })).toThrow('唯一')
  })
  it('仅跨文化支持目标语言，材料合计长度有限制', () => {
    expect(() => validateScenario({ ...scenario, target_language: 'en' })).toThrow('跨文化')
    expect(() => validateScenario({ ...scenario, scenario_code: 'cross_cultural', target_language: 'en-US' })).not.toThrow()
    expect(() => validateScenario({ ...scenario, content: 'x'.repeat(50000), materials: Array.from({ length: 4 }, (_, index) => ({ id: String(index), content: 'x'.repeat(50000) })) })).toThrow('200000')
  })
  it('审计仅允许引用已有证据与规则', () => {
    expect(() => validateAudit(audit)).not.toThrow()
    expect(() => validateAudit({ ...audit, evidence: [] })).toThrow('evidence_refs')
    expect(() => validateAudit({ ...audit, rules: [] })).toThrow('rule_refs')
    expect(() => validateAudit({ ...audit, steps: [...audit.steps, ...audit.steps] })).toThrow('唯一')
  })
  it('保留后端支持的空步骤审计，并检查对象版本与总长度', () => {
    expect(() => validateAudit({ ...audit, steps: [], evidence: [], rules: [] })).not.toThrow()
    expect(() => validateAudit({ ...audit, subject: { ...audit.subject, version: '' } })).toThrow('完整审计对象')
    expect(() => validateAudit({ ...audit, steps: [], evidence: Array.from({ length: 5 }, (_, i) => ({ id: String(i), content: 'x'.repeat(50000) })) })).toThrow('200000')
  })
})
