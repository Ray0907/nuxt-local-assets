import { createGzip, createBrotliCompress, constants } from 'zlib'
import type { Transform } from 'stream'

/**
 * Compression encoding types supported
 */
export type CompressionEncoding = 'gzip' | 'br' | 'identity'

/**
 * V8 optimization: Pre-compiled regex for parsing Accept-Encoding
 */
const QUALITY_REGEX = /;q=([0-9.]+)/

/**
 * V8 optimization: Reusable compression options objects
 */
const BROTLI_OPTIONS = {
	params: {
		[constants.BROTLI_PARAM_QUALITY]: 4, // Balance speed/compression
	},
} as const

const GZIP_OPTIONS = {
	level: 6, // Default compression level
} as const

/**
 * Parse Accept-Encoding header and return best supported encoding
 * V8 optimization: Fast path for common cases, avoid allocations
 *
 * @param accept_encoding - Accept-Encoding header value
 * @returns Best supported encoding
 */
export function parseAcceptEncoding(accept_encoding: string | undefined): CompressionEncoding {
	if (!accept_encoding) {
		return 'identity'
	}

	const lower = accept_encoding.toLowerCase()

	// Fast path: simple common cases without quality values
	if (lower === 'gzip' || lower === 'gzip, deflate') {
		return 'gzip'
	}
	if (lower === 'br' || lower === 'br, gzip' || lower === 'br, gzip, deflate') {
		return 'br'
	}

	// Check if quality values are present
	const has_quality = lower.includes(';q=')

	if (!has_quality) {
		// No quality values - prefer br > gzip based on position
		if (lower.includes('br')) {
			return 'br'
		}
		if (lower.includes('gzip')) {
			return 'gzip'
		}
		return 'identity'
	}

	// Parse with quality values
	let best_encoding: CompressionEncoding = 'identity'
	let best_quality = 0

	const parts = lower.split(',')
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i].trim()
		const encoding = part.split(';')[0].trim()

		// Only process supported encodings
		if (encoding !== 'br' && encoding !== 'gzip') {
			continue
		}

		// Extract quality value
		const match = part.match(QUALITY_REGEX)
		const q = match ? parseFloat(match[1]) : 1

		if (q <= 0) {
			continue
		}

		// Update best if higher quality, or same quality but br preferred
		if (q > best_quality || (q === best_quality && encoding === 'br')) {
			best_quality = q
			best_encoding = encoding as CompressionEncoding
		}
	}

	return best_encoding
}

/**
 * Create compression stream for the given encoding
 * V8 optimization: Use pre-defined options objects
 *
 * @param encoding - Compression encoding type
 * @returns Compression transform stream or null for identity
 */
export function createCompressionStream(encoding: CompressionEncoding): Transform | null {
	switch (encoding) {
		case 'br':
			return createBrotliCompress(BROTLI_OPTIONS)
		case 'gzip':
			return createGzip(GZIP_OPTIONS)
		default:
			return null
	}
}

/**
 * Check if a MIME type should be compressed
 *
 * @param mime_type - MIME type to check
 * @param compressible_patterns - Array of compressible MIME type patterns
 * @returns True if should compress
 */
export function shouldCompress(
	mime_type: string,
	compressible_patterns: string[],
): boolean {
	if (!compressible_patterns || compressible_patterns.length === 0) {
		return false
	}

	const [type] = mime_type.split('/')

	for (const pattern of compressible_patterns) {
		// Exact match
		if (pattern === mime_type) {
			return true
		}

		// Wildcard match (e.g., 'text/*')
		if (pattern.endsWith('/*')) {
			const pattern_type = pattern.slice(0, -2)
			if (type === pattern_type) {
				return true
			}
		}

		// Type-only match (e.g., 'text')
		if (!pattern.includes('/') && type === pattern) {
			return true
		}
	}

	return false
}
