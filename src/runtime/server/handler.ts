import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { pipeline } from 'stream/promises'
import { defineEventHandler, getHeader, setHeader, setHeaders, setResponseStatus, sendStream, createError, getRequestURL, sendRedirect } from 'h3'
import { useRuntimeConfig } from '#imports'
import { sanitizePath, resolveFilePath, extractRelativePath, isPathWithinBase } from './utils/path'
import { computeETag, getCacheHeaders, isClientCacheValid } from './utils/cache'
import { parseRangeHeader, formatContentRange, getRangeContentLength } from './utils/range'
import { getContentType, isMimeTypeAllowed, isExtensionBlocked, parseFileSize } from './utils/mime'
import { parseAcceptEncoding, createCompressionStream, shouldCompress } from './utils/compress'
import type { LocalAssetsOptions, LocalAssetsDirConfig, FileAccessContext, AuditLogEntry, RedirectContext, RedirectResult } from '../../types'

/**
 * Base headers applied to all responses (V8 optimization: reuse object)
 * Security headers based on OWASP recommendations
 */
const BASE_HEADERS = {
	'Accept-Ranges': 'bytes',
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'DENY',
	'X-Download-Options': 'noopen',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
} as const

/**
 * Find matching directory config for a URL path
 */
function findMatchingDir(url_path: string, dirs: LocalAssetsDirConfig[]): LocalAssetsDirConfig | null {
	for (const dir of dirs) {
		const route = dir.route.startsWith('/') ? dir.route : `/${dir.route}`
		if (url_path.startsWith(route + '/') || url_path === route) {
			return dir
		}
	}
	return null
}

/**
 * Get user from event (placeholder - should be overridden by auth integration)
 */
async function getUserFromEvent(event: any): Promise<unknown | null> {
	// Try common auth patterns
	if (event.context?.user) {
		return event.context.user
	}
	if (event.context?.auth?.user) {
		return event.context.auth.user
	}
	// nuxt-auth-utils pattern
	if (typeof event.context?.session?.user !== 'undefined') {
		return event.context.session.user
	}
	return null
}

/**
 * Validate redirect URL to prevent open redirect attacks
 * Only allows relative URLs (same origin)
 */
function isValidRedirectUrl(url: string): boolean {
	// Block empty URLs
	if (!url || typeof url !== 'string') {
		return false
	}

	// Block protocol-relative URLs (//example.com)
	if (url.startsWith('//')) {
		return false
	}

	// Block absolute URLs with protocols
	if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
		return false
	}

	// Allow relative URLs starting with /
	if (url.startsWith('/')) {
		return true
	}

	// Block everything else (could be interpreted as relative by browser)
	return false
}

/**
 * Get client IP address
 */
function getClientIP(event: any): string {
	return getHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim()
		|| getHeader(event, 'x-real-ip')
		|| event.node?.req?.socket?.remoteAddress
		|| 'unknown'
}

/**
 * Main file handler
 */
export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig().localAssets as LocalAssetsOptions
	const url = getRequestURL(event)
	const url_path = url.pathname

	// Find matching directory configuration
	const dir_config = findMatchingDir(url_path, config.dirs)
	if (!dir_config) {
		throw createError({ statusCode: 404, message: 'Not Found' })
	}

	// Extract relative path from URL
	const relative_path = extractRelativePath(url_path, dir_config.route)

	// Check for redirects (before any file system operations)
	if (config.redirect?.handler) {
		const user = await getUserFromEvent(event)
		const redirect_fn = await loadRedirectFunction(config.redirect.handler)
		if (redirect_fn) {
			const redirect_ctx: RedirectContext = {
				filePath: relative_path,
				urlPath: url_path,
				user,
				event,
				dirConfig: dir_config,
			}
			const redirect_result = await redirect_fn(redirect_ctx)
			if (redirect_result) {
				const redirect_url = typeof redirect_result === 'string' ? redirect_result : redirect_result.url
				const status_code = typeof redirect_result === 'object' ? (redirect_result.statusCode || 302) : 302

				// Validate redirect URL to prevent open redirect attacks
				if (!isValidRedirectUrl(redirect_url)) {
					console.warn(`[nuxt-local-assets] Blocked potentially malicious redirect URL: ${redirect_url}`)
					throw createError({ statusCode: 403, message: 'Access denied' })
				}

				return sendRedirect(event, redirect_url, status_code)
			}
		}
	}

	// Sanitize the path (security: prevent directory traversal)
	const safe_path = sanitizePath(relative_path)
	if (!safe_path) {
		await logAudit(event, config, dir_config, safe_path || relative_path, 'denied', 'invalid_path')
		throw createError({ statusCode: 400, message: 'Invalid path' })
	}

	// Check blocked extensions
	if (config.security?.blockedExtensions && isExtensionBlocked(safe_path, config.security.blockedExtensions)) {
		await logAudit(event, config, dir_config, safe_path, 'denied', 'blocked_extension')
		throw createError({ statusCode: 403, message: 'Access denied' })
	}

	// Resolve full file path
	const is_dev = (config as any).isDev ?? false
	const full_path = resolveFilePath(safe_path, dir_config.path, dir_config.devPath, is_dev)

	// Security: ensure resolved path is within base directory
	const base_path = is_dev && dir_config.devPath ? dir_config.devPath : dir_config.path
	if (!isPathWithinBase(full_path, base_path)) {
		await logAudit(event, config, dir_config, safe_path, 'denied', 'path_escape')
		throw createError({ statusCode: 403, message: 'Access denied' })
	}

	// Check if file exists and get stats
	let file_stat
	try {
		file_stat = await stat(full_path)
	}
	catch {
		await logAudit(event, config, dir_config, safe_path, 'not_found')
		throw createError({ statusCode: 404, message: 'File not found' })
	}

	// Ensure it's a file, not a directory
	if (!file_stat.isFile()) {
		await logAudit(event, config, dir_config, safe_path, 'denied', 'not_a_file')
		throw createError({ statusCode: 403, message: 'Access denied' })
	}

	// Check file size limit
	if (config.security?.maxFileSize) {
		const max_size = parseFileSize(config.security.maxFileSize)
		if (max_size > 0 && file_stat.size > max_size) {
			await logAudit(event, config, dir_config, safe_path, 'denied', 'file_too_large')
			throw createError({ statusCode: 403, message: 'Access denied' })
		}
	}

	// Get MIME type and check whitelist
	const mime_type = getContentType(safe_path)
	const base_mime = mime_type.split(';')[0].trim()

	if (config.security?.allowedMimeTypes && config.security.allowedMimeTypes.length > 0) {
		if (!isMimeTypeAllowed(base_mime, config.security.allowedMimeTypes)) {
			await logAudit(event, config, dir_config, safe_path, 'denied', 'mime_not_allowed')
			throw createError({ statusCode: 403, message: 'Access denied' })
		}
	}

	// Authentication check
	const user = await getUserFromEvent(event)

	if (config.auth?.required && !user) {
		await logAudit(event, config, dir_config, safe_path, 'denied', 'unauthenticated')
		throw createError({ statusCode: 401, message: 'Authentication required' })
	}

	// Authorization check
	if (config.auth?.authorize) {
		const authorize_fn = await loadAuthorizeFunction(config.auth.authorize)
		if (authorize_fn) {
			const context: FileAccessContext = {
				user,
				filePath: safe_path,
				fullPath: full_path,
				fileMeta: {
					size: file_stat.size,
					mtime: file_stat.mtime,
					mimeType: base_mime,
				},
				event,
				dirConfig: dir_config,
			}

			const authorized = await authorize_fn(context)
			if (!authorized) {
				await logAudit(event, config, dir_config, safe_path, 'denied', 'unauthorized')
				throw createError({ statusCode: 403, message: 'Access denied' })
			}
		}
	}

	// Compute ETag
	const etag = computeETag(file_stat)

	// Check client cache (304 Not Modified)
	const request_headers = {
		'if-none-match': getHeader(event, 'if-none-match'),
		'if-modified-since': getHeader(event, 'if-modified-since'),
	}

	if (isClientCacheValid(request_headers, etag, file_stat.mtime)) {
		await logAudit(event, config, dir_config, safe_path, 'access')
		setResponseStatus(event, 304)
		return ''
	}

	// Get cache headers
	const cache_headers = getCacheHeaders(file_stat, safe_path, config.cache)

	// Handle Range request
	const range_header = getHeader(event, 'range')
	let range = null

	if (config.rangeRequest?.enabled !== false && range_header) {
		// Check If-Range (only serve partial if file hasn't changed)
		const if_range = getHeader(event, 'if-range')
		const file_changed = if_range && if_range !== etag && if_range !== file_stat.mtime.toUTCString()

		if (!file_changed) {
			range = parseRangeHeader(range_header, file_stat.size)

			// Enforce maxChunkSize if configured
			if (range && config.rangeRequest?.maxChunkSize) {
				const max_chunk = parseFileSize(config.rangeRequest.maxChunkSize)
				if (max_chunk > 0) {
					const requested_size = range.end - range.start + 1
					if (requested_size > max_chunk) {
						// Limit the range to maxChunkSize
						range.end = range.start + max_chunk - 1
					}
				}
			}
		}
	}

	// Log successful access
	await logAudit(event, config, dir_config, safe_path, 'access')

	// Determine if compression should be applied
	const compression_config = config.compression
	const accept_encoding = getHeader(event, 'accept-encoding')
	const compression_encoding = parseAcceptEncoding(accept_encoding)

	// Check if we should compress this response
	const compression_threshold = compression_config?.threshold
		? parseFileSize(compression_config.threshold)
		: 1024 // Default 1kb
	const can_compress = compression_config?.enabled !== false
		&& compression_encoding !== 'identity'
		&& !range // Don't compress range requests
		&& file_stat.size >= compression_threshold
		&& shouldCompress(base_mime, compression_config?.types || [])

	// Set response headers
	setHeaders(event, {
		...BASE_HEADERS,
		...cache_headers,
		'Content-Type': mime_type,
	})

	// Add Vary header if compression is possible for this content type
	if (compression_config?.enabled !== false && shouldCompress(base_mime, compression_config?.types || [])) {
		setHeader(event, 'Vary', 'Accept-Encoding')
	}

	// Serve partial content (206) or full content (200)
	if (range) {
		setResponseStatus(event, 206)
		setHeader(event, 'Content-Range', formatContentRange(range, file_stat.size))
		setHeader(event, 'Content-Length', String(getRangeContentLength(range)))

		return sendStream(event, createReadStream(full_path, {
			start: range.start,
			end: range.end,
		}))
	}

	// Apply compression if applicable
	if (can_compress) {
		const compression_stream = createCompressionStream(compression_encoding)
		if (compression_stream) {
			setHeader(event, 'Content-Encoding', compression_encoding)
			// Remove Content-Length as compressed size is unknown
			// Transfer-Encoding: chunked will be used automatically

			const file_stream = createReadStream(full_path)
			return sendStream(event, file_stream.pipe(compression_stream))
		}
	}

	// Full file response (uncompressed)
	setHeader(event, 'Content-Length', String(file_stat.size))
	return sendStream(event, createReadStream(full_path))
})

/**
 * Dynamic import helper that handles TypeScript files
 */
async function dynamicImport(path: string): Promise<any> {
	// For .ts files, use jiti for runtime transpilation
	if (path.endsWith('.ts')) {
		const { createJiti } = await import('jiti')
		const jiti = createJiti(import.meta.url, { interopDefault: true })
		return jiti.import(path)
	}
	// For .js/.mjs files, use native import
	return import(path)
}

/**
 * Load authorization function from path
 * Path is already resolved to absolute path by module setup
 */
async function loadAuthorizeFunction(path: string): Promise<((ctx: FileAccessContext) => boolean | Promise<boolean>) | null> {
	try {
		const module = await dynamicImport(path)
		return module.default || module
	}
	catch (error) {
		console.warn(`[nuxt-local-assets] Failed to load authorize function from ${path}:`, error)
		return null
	}
}

/**
 * Load redirect function from path
 * Path is already resolved to absolute path by module setup
 */
async function loadRedirectFunction(path: string): Promise<((ctx: RedirectContext) => string | RedirectResult | null | undefined | Promise<string | RedirectResult | null | undefined>) | null> {
	try {
		const module = await dynamicImport(path)
		return module.default || module
	}
	catch (error) {
		console.warn(`[nuxt-local-assets] Failed to load redirect function from ${path}:`, error)
		return null
	}
}

/**
 * Log audit entry
 * Handler path is already resolved to absolute path by module setup
 */
async function logAudit(
	event: any,
	config: LocalAssetsOptions,
	dir_config: LocalAssetsDirConfig,
	file_path: string,
	action: AuditLogEntry['action'],
	reason?: string,
): Promise<void> {
	if (!config.audit?.enabled || !config.audit?.handler) {
		return
	}

	try {
		const module = await dynamicImport(config.audit.handler)
		const handler = module.default || module

		if (typeof handler === 'function') {
			const user = await getUserFromEvent(event)

			const entry: AuditLogEntry = {
				timestamp: new Date(),
				idUser: user && typeof user === 'object' && 'id' in user ? String((user as any).id) : null,
				action,
				filePath: file_path,
				ipAddress: getClientIP(event),
				userAgent: getHeader(event, 'user-agent') || 'unknown',
				reason,
				dirName: dir_config.name,
			}

			await handler(entry)
		}
	}
	catch (error) {
		console.warn('[nuxt-local-assets] Failed to log audit:', error)
	}
}
