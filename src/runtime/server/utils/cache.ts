import type { Stats } from 'fs'
import type { CacheRule } from '../../../types'

/**
 * Pre-allocated buffer for ETag computation (V8 optimization)
 */
const ETAG_BUFFER = new ArrayBuffer(24)
const ETAG_VIEW = new DataView(ETAG_BUFFER)

/**
 * Compute ETag from file stats
 * Uses TypedArray for better V8 optimization
 *
 * @param stat - File stats object
 * @returns ETag string
 */
export function computeETag(stat: Stats): string {
	// Use ino + mtime + size for uniqueness
	ETAG_VIEW.setFloat64(0, stat.ino)
	ETAG_VIEW.setFloat64(8, stat.mtimeMs)
	ETAG_VIEW.setFloat64(16, stat.size)

	// Convert to base64url for URL-safe ETag
	const hash = Buffer.from(ETAG_BUFFER).toString('base64url')
	return `"${hash}"`
}

/**
 * Compute ETag from individual values
 *
 * @param ino - Inode number
 * @param mtime_ms - Modification time in milliseconds
 * @param size - File size
 * @returns ETag string
 */
export function computeETagFromValues(ino: number, mtime_ms: number, size: number): string {
	ETAG_VIEW.setFloat64(0, ino)
	ETAG_VIEW.setFloat64(8, mtime_ms)
	ETAG_VIEW.setFloat64(16, size)

	const hash = Buffer.from(ETAG_BUFFER).toString('base64url')
	return `"${hash}"`
}

/**
 * Convert a match pattern to a testable function
 * Handles RegExp, string patterns, and serialized RegExp objects
 */
function createMatcher(match: RegExp | string | { source?: string; flags?: string }): (path: string) => boolean {
	// Already a RegExp
	if (match instanceof RegExp) {
		return (path: string) => match.test(path)
	}

	// String pattern - treat as regex source
	if (typeof match === 'string') {
		const regex = new RegExp(match)
		return (path: string) => regex.test(path)
	}

	// Serialized RegExp object (from runtime config)
	if (match && typeof match === 'object' && 'source' in match) {
		const regex = new RegExp(match.source, match.flags || '')
		return (path: string) => regex.test(path)
	}

	// Fallback - never match
	return () => false
}

/**
 * Get Cache-Control header value based on rules and file path
 *
 * @param file_path - File path to match against rules
 * @param rules - Array of cache rules
 * @param default_max_age - Default max-age if no rule matches
 * @returns Cache-Control header value
 */
export function getCacheControl(
	file_path: string,
	rules: CacheRule[] = [],
	default_max_age: number = 0,
): string {
	// Find matching rule
	const matched_rule = rules.find((rule) => {
		const matcher = createMatcher(rule.match)
		return matcher(file_path)
	})

	const max_age = matched_rule?.maxAge ?? default_max_age
	const directives: string[] = ['private']

	if (max_age > 0) {
		directives.push(`max-age=${max_age}`)
	}
	else {
		directives.push('no-cache')
	}

	if (matched_rule?.mustRevalidate || max_age === 0) {
		directives.push('must-revalidate')
	}

	if (matched_rule?.immutable) {
		directives.push('immutable')
	}

	return directives.join(', ')
}

/**
 * Get all cache-related headers for a file
 *
 * @param stat - File stats
 * @param file_path - File path for rule matching
 * @param options - Cache options
 * @returns Object with cache headers
 */
export function getCacheHeaders(
	stat: Stats,
	file_path: string,
	options: {
		etag?: boolean
		lastModified?: boolean
		rules?: CacheRule[]
	} = {},
): Record<string, string> {
	const headers: Record<string, string> = {}

	if (options.etag !== false) {
		headers['ETag'] = computeETag(stat)
	}

	if (options.lastModified !== false) {
		headers['Last-Modified'] = stat.mtime.toUTCString()
	}

	headers['Cache-Control'] = getCacheControl(file_path, options.rules)

	return headers
}

/**
 * Check if client cache is still valid
 *
 * @param request_headers - Request headers object
 * @param etag - Current file ETag
 * @param mtime - Current file modification time
 * @returns True if client cache is valid (should return 304)
 */
export function isClientCacheValid(
	request_headers: {
		'if-none-match'?: string
		'if-modified-since'?: string
	},
	etag: string,
	mtime: Date,
): boolean {
	// Check If-None-Match (ETag)
	const if_none_match = request_headers['if-none-match']
	if (if_none_match) {
		// Handle multiple ETags (e.g., "etag1", "etag2")
		const client_etags = if_none_match.split(',').map(e => e.trim())
		if (client_etags.includes(etag) || client_etags.includes('*')) {
			return true
		}
	}

	// Check If-Modified-Since
	const if_modified_since = request_headers['if-modified-since']
	if (if_modified_since && !if_none_match) {
		const client_time = new Date(if_modified_since)
		if (!isNaN(client_time.getTime()) && mtime <= client_time) {
			return true
		}
	}

	return false
}
