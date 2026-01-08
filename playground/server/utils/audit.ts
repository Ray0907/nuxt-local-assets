import type { AuditLogEntry } from '../../../src/types'

/**
 * Example audit log handler
 * In production, you would write this to a database or log aggregation service
 */
export default async function auditHandler(entry: AuditLogEntry): Promise<void> {
	const log_line = [
		`[${entry.timestamp.toISOString()}]`,
		`[${entry.action.toUpperCase()}]`,
		`[${entry.dirName}]`,
		entry.filePath,
		entry.idUser ? `user:${entry.idUser}` : 'anonymous',
		`ip:${entry.ipAddress}`,
		entry.reason ? `reason:${entry.reason}` : '',
	].filter(Boolean).join(' ')

	console.log('[AUDIT]', log_line)

	// In production, you might do:
	// await db.audit_log.create({ data: entry })
	// or
	// await sendToLogAggregator(entry)
}
