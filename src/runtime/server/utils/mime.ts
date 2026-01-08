import { lookup, contentType } from 'mime-types'
import { extname } from 'path'

/**
 * Common MIME type patterns for matching
 */
const MIME_PATTERN_CACHE = new Map<string, RegExp>()

/**
 * Get MIME type for a file path
 *
 * @param file_path - File path or name
 * @returns MIME type string or 'application/octet-stream' as fallback
 */
export function getMimeType(file_path: string): string {
	const mime = lookup(file_path)
	return mime || 'application/octet-stream'
}

/**
 * Get full Content-Type header value including charset for text types
 *
 * @param file_path - File path or name
 * @returns Content-Type header value
 */
export function getContentType(file_path: string): string {
	const mime = lookup(file_path)
	if (!mime) {
		return 'application/octet-stream'
	}

	// contentType adds charset for text types
	return contentType(mime) || mime
}

/**
 * Check if a MIME type matches any pattern in the whitelist
 *
 * Supports:
 * - Exact match: 'image/png'
 * - Wildcard: 'image/*'
 * - Type only: 'image'
 *
 * @param mime_type - MIME type to check
 * @param patterns - Array of allowed patterns
 * @returns True if MIME type is allowed
 */
export function isMimeTypeAllowed(mime_type: string, patterns: string[]): boolean {
	if (!patterns || patterns.length === 0) {
		// Empty whitelist = allow all
		return true
	}

	const [type, subtype] = mime_type.split('/')

	for (const pattern of patterns) {
		// Exact match
		if (pattern === mime_type) {
			return true
		}

		// Wildcard match (e.g., 'image/*')
		if (pattern.endsWith('/*')) {
			const pattern_type = pattern.slice(0, -2)
			if (type === pattern_type) {
				return true
			}
		}

		// Type-only match (e.g., 'image')
		if (!pattern.includes('/') && type === pattern) {
			return true
		}
	}

	return false
}

/**
 * Check if a file extension is blocked
 *
 * @param file_path - File path or name
 * @param blocked_extensions - Array of blocked extensions (e.g., ['.exe', '.sh'])
 * @returns True if extension is blocked
 */
export function isExtensionBlocked(file_path: string, blocked_extensions: string[]): boolean {
	if (!blocked_extensions || blocked_extensions.length === 0) {
		return false
	}

	const ext = extname(file_path).toLowerCase()
	return blocked_extensions.some(blocked => blocked.toLowerCase() === ext)
}

/**
 * Check if a MIME type is compressible
 *
 * @param mime_type - MIME type to check
 * @param compressible_types - Array of compressible type patterns
 * @returns True if the type should be compressed
 */
export function isCompressible(mime_type: string, compressible_types: string[]): boolean {
	return isMimeTypeAllowed(mime_type, compressible_types)
}

/**
 * Parse file size string to bytes
 *
 * @param size - Size string (e.g., '100mb', '1gb', '500kb')
 * @returns Size in bytes
 */
export function parseFileSize(size: string): number {
	const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb)?$/)
	if (!match) {
		return 0
	}

	const value = parseFloat(match[1])
	const unit = match[2] || 'b'

	const multipliers: Record<string, number> = {
		b: 1,
		kb: 1024,
		mb: 1024 * 1024,
		gb: 1024 * 1024 * 1024,
		tb: 1024 * 1024 * 1024 * 1024,
	}

	return Math.floor(value * (multipliers[unit] || 1))
}
