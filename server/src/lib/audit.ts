import type { Request } from 'express'
import { AuditLogModel } from '../modules/audit/auditLog.model.ts'

export interface AuditEntry {
  category: 'data' | 'security' | 'admin'
  action: string
  outcome?: 'success' | 'denied' | 'failure'
  actor: string
  entityType?: string
  entityId?: string
  changes?: { field: string; from: unknown; to: unknown }[]
}

/** Records an audit entry with the request's IP and id. Never throws into the caller. */
export async function audit(entry: AuditEntry, req?: Request): Promise<void> {
  try {
    await AuditLogModel.create({ ...entry, ip: req?.ip, requestId: req?.id })
  } catch (err) {
    req?.log?.error({ err, action: entry.action }, 'failed to write audit entry')
  }
}

/** Field-level diff of two flat objects, for the `changes` array. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  return Object.keys(after)
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((field) => ({ field, from: before[field], to: after[field] }))
}
