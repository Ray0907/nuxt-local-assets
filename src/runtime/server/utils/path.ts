import { normalize, join, resolve } from 'path'

/**
 * Pre-compiled patterns for security checks
 */
const TRAVERSAL_PATTERN = /(?:^|[\\/])\.\.(?:[\\/]|$)/
const NULL_BYTE_PATTERN = /\0/
const ABSOLUTE_PATH_PATTERN = /^[\\/]/
const WINDOWS_DRIVE_PATTERN = /^[a-zA-Z]:/

/**
 * Sanitize a user-provided path to prevent directory traversal attacks
 *
 * @param input - Raw user input path
 * @returns Sanitized path or null if invalid
 */
export function sanitizePath(input: string): string | null {
	if (!input || typeof input !== 'string') {
		return null
	}

	// Decode URL encoding (handle double encoding attacks)
	let decoded: string
	try {
		decoded = decodeURIComponent(input)
		// Check for double encoding
		if (decoded !== input && decoded.includes('%')) {
			decoded = decodeURIComponent(decoded)
		}
	}
	catch {
		// Invalid URL encoding
		return null
	}

	// Check for null bytes (can bypass security in some systems)
	if (NULL_BYTE_PATTERN.test(decoded)) {
		return null
	}

	// Normalize the path
	const normalized = normalize(decoded)

	// Check for directory traversal
	if (TRAVERSAL_PATTERN.test(normalized)) {
		return null
	}

	// Check for absolute paths
	if (ABSOLUTE_PATH_PATTERN.test(normalized)) {
		return null
	}

	// Check for Windows drive letters
	if (WINDOWS_DRIVE_PATTERN.test(normalized)) {
		return null
	}

	// Remove leading slashes after normalization
	const clean_path = normalized.replace(/^[\\/]+/, '')

	// Final safety check: ensure the path doesn't escape the base
	if (clean_path.startsWith('..') || clean_path.includes('/..') || clean_path.includes('\\..')) {
		return null
	}

	return clean_path
}

/**
 * Resolve a file path based on environment and configuration
 *
 * @param relative_path - Sanitized relative path
 * @param base_path - Base directory path (production)
 * @param dev_path - Development directory path (optional)
 * @param is_dev - Whether running in development mode
 * @returns Full resolved file path
 */
export function resolveFilePath(
	relative_path: string,
	base_path: string,
	dev_path?: string,
	is_dev: boolean = false,
): string {
	const base_dir = is_dev && dev_path ? dev_path : base_path

	// Use resolve for absolute paths, join for relative
	const full_path = base_dir.startsWith('/')
		? join(base_dir, relative_path)
		: resolve(process.cwd(), base_dir, relative_path)

	return full_path
}

/**
 * Extract the relative path from URL based on route prefix
 *
 * @param url_path - Full URL path
 * @param route_prefix - Route prefix to remove
 * @returns Relative file path
 */
export function extractRelativePath(url_path: string, route_prefix: string): string {
	const prefix = route_prefix.endsWith('/') ? route_prefix : `${route_prefix}/`
	const normalized_url = url_path.startsWith('/') ? url_path : `/${url_path}`

	if (normalized_url.startsWith(prefix)) {
		return normalized_url.slice(prefix.length)
	}

	// Handle case where prefix doesn't have trailing slash
	const prefix_no_slash = route_prefix.replace(/\/$/, '')
	if (normalized_url.startsWith(prefix_no_slash + '/')) {
		return normalized_url.slice(prefix_no_slash.length + 1)
	}

	return normalized_url
}

/**
 * Check if a path is within the allowed base directory
 *
 * @param full_path - Resolved full path
 * @param base_path - Base directory path
 * @returns True if path is within base directory
 */
export function isPathWithinBase(full_path: string, base_path: string): boolean {
	const resolved_full = resolve(full_path)
	const resolved_base = resolve(base_path)

	return resolved_full.startsWith(resolved_base + '/') || resolved_full === resolved_base
}
