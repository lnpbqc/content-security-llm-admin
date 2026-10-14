import type { ModelInput, Scope, TaskCreate } from '@/types/api'

export function required(value: string): boolean { return value.trim().length > 0 }
export function validToken(value: string): boolean { return value.length >= 32 }
export function validExpiry(value: string): boolean { const date = new Date(value); return !Number.isNaN(date.getTime()) && date.getTime() > Date.now() }
export function validModel(value: ModelInput): boolean { try { const url = new URL(value.base_url); return required(value.upstream_model_id) && required(value.name) && required(value.api_key) && ['http:', 'https:'].includes(url.protocol) } catch { return false } }
export function validScope(value: Scope): boolean { return Number.isInteger(value.dataset_id) && value.dataset_id >= 1 && required(value.version_id) && required(value.language) && required(value.scheme_id) }
export function taskPayload(kind: TaskCreate['kind'], name: string, scope: Scope): TaskCreate { return { kind, name: name.trim(), input: { dataset_id: scope.dataset_id, version_id: scope.version_id.trim(), language: scope.language.trim(), scheme_id: scope.scheme_id } } }
