import type { ParsedRange } from '../../../types'

/**
 * Pre-compiled regex for parsing Range header (V8 optimization)
 */
const RANGE_REGEX = /^bytes=(\d*)-(\d*)$/

/**
 * Parse HTTP Range header
 *
 * Supports formats:
 * - bytes=0-499 (first 500 bytes)
 * - bytes=500-999 (second 500 bytes)
 * - bytes=-500 (last 500 bytes)
 * - bytes=500- (from byte 500 to end)
 *
 * @param header - Range header value
 * @param file_size - Total file size
 * @returns Parsed range or null if invalid
 */
export function parseRangeHeader(header: string, file_size: number): ParsedRange | null {
	if (!header || typeof header !== 'string') {
		return null
	}

	const match = RANGE_REGEX.exec(header)
	if (!match) {
		return null
	}

	const [, start_str, end_str] = match

	let start: number
	let end: number

	if (start_str === '' && end_str !== '') {
		// bytes=-500 (last N bytes)
		const suffix_length = parseInt(end_str, 10)
		if (isNaN(suffix_length) || suffix_length <= 0) {
			return null
		}
		start = Math.max(0, file_size - suffix_length)
		end = file_size - 1
	}
	else if (start_str !== '' && end_str === '') {
		// bytes=500- (from byte N to end)
		start = parseInt(start_str, 10)
		if (isNaN(start)) {
			return null
		}
		end = file_size - 1
	}
	else if (start_str !== '' && end_str !== '') {
		// bytes=0-499 (specific range)
		start = parseInt(start_str, 10)
		end = parseInt(end_str, 10)
		if (isNaN(start) || isNaN(end)) {
			return null
		}
	}
	else {
		// bytes=- is invalid
		return null
	}

	// Validate range
	if (start < 0 || end < 0) {
		return null
	}

	if (start > end) {
		return null
	}

	if (start >= file_size) {
		return null
	}

	// Clamp end to file size
	if (end >= file_size) {
		end = file_size - 1
	}

	return { start, end }
}

/**
 * Format Content-Range header value
 *
 * @param range - Parsed range
 * @param file_size - Total file size
 * @returns Content-Range header value
 */
export function formatContentRange(range: ParsedRange, file_size: number): string {
	return `bytes ${range.start}-${range.end}/${file_size}`
}

/**
 * Calculate content length for a range
 *
 * @param range - Parsed range
 * @returns Number of bytes in the range
 */
export function getRangeContentLength(range: ParsedRange): number {
	return range.end - range.start + 1
}

/**
 * Check if range is satisfiable
 *
 * @param start - Requested start byte
 * @param file_size - Total file size
 * @returns True if the range can be satisfied
 */
export function isRangeSatisfiable(start: number, file_size: number): boolean {
	return start >= 0 && start < file_size
}
