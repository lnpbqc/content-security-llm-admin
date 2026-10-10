import type { AuditInput, Material, ScenarioInput } from '@/types/api'

export function jsonObject(value: string, label: string): Record<string, unknown> {
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { throw new Error(`${label}必须是有效 JSON`) }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${label}必须是 JSON 对象`)
  return parsed as Record<string, unknown>
}

export function jsonArray<T>(value: string, label: string): T[] {
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { throw new Error(`${label}必须是有效 JSON`) }
  if (!Array.isArray(parsed)) throw new Error(`${label}必须是 JSON 数组`)
  return parsed as T[]
}

const text = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max
const language = (value: string) => /^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{2,8})*$/.test(value)

export function validateMaterials(items: Material[], reservedInput = false) {
  if (items.length > 50 || items.some(item => !item || !text(item.id, 128) || !text(item.content, 50000) || (item.title != null && !text(item.title, 128)) || (item.time != null && !text(item.time, 128)))) throw new Error('材料最多 50 项，每项须有 ID 和 1–50000 字正文，ID／标题／时间最长 128 字')
  const ids = items.map(item => item.id.trim())
  if (new Set(ids).size !== ids.length || (reservedInput && ids.includes('input'))) throw new Error('材料 ID 必须唯一，input 为正文保留 ID')
}

export function validateScenario(input: ScenarioInput) {
  if (!text(input.model_id, 128) || !text(input.content, 50000) || !language(input.language)) throw new Error('请选择模型，输入 1–50000 字正文和有效语种（如 zh、en-US）')
  validateMaterials(input.materials, true)
  if (input.content.trim().length + input.materials.reduce((total, item) => total + item.content.trim().length, 0) > 200000) throw new Error('正文与材料合计不能超过 200000 字符')
  if (input.target_language && (input.scenario_code !== 'cross_cultural' || !language(input.target_language))) throw new Error('目标语言仅用于跨文化场景，须为有效语种代码')
}

export function validateAudit(input: AuditInput) {
  if (!text(input.model_id, 128) || Object.values(input.subject).some(value => !text(value, 128))) throw new Error('请选择模型并填写完整审计对象，标识最长 128 字')
  validateMaterials(input.evidence)
  if (input.steps.length > 100 || input.steps.some(step => !step || !text(step.id, 128) || !text(step.label, 128) || !text(step.detail, 50000))) throw new Error('审计步骤最多 100 项，每项包含 id、label、detail')
  if (input.rules.length > 100 || input.rules.some(rule => !rule || !text(rule.id, 128) || !text(rule.text, 50000))) throw new Error('规则最多 100 项，每项包含 id 和 text')
  for (const rows of [input.steps, input.rules]) if (new Set(rows.map(row => row.id.trim())).size !== rows.length) throw new Error('步骤和规则各自的 ID 必须唯一')
  const evidence = new Set(input.evidence.map(item => item.id.trim()))
  const rules = new Set(input.rules.map(item => item.id.trim()))
  const total = input.steps.reduce((sum, step) => sum + step.detail.trim().length, 0) + input.evidence.reduce((sum, item) => sum + item.content.trim().length, 0) + input.rules.reduce((sum, rule) => sum + rule.text.trim().length, 0)
  if (total > 200000) throw new Error('步骤、证据及规则合计不能超过 200000 字符')
  for (const step of input.steps) {
    if (step.evidence_refs && (!Array.isArray(step.evidence_refs) || step.evidence_refs.length > 50 || step.evidence_refs.some(id => typeof id !== 'string' || !evidence.has(id.trim())))) throw new Error('步骤 evidence_refs 必须引用已填写的证据 ID，最多 50 项')
    if (step.rule_refs && (!Array.isArray(step.rule_refs) || step.rule_refs.length > 100 || step.rule_refs.some(id => typeof id !== 'string' || !rules.has(id.trim())))) throw new Error('步骤 rule_refs 必须引用已填写的规则 ID，最多 100 项')
  }
}
