import type { H3Event } from 'h3'

/**
 * Directory configuration for local assets
 */
export interface LocalAssetsDirConfig {
	/** Unique identifier for this directory */
	name: string
	/** Absolute path to the directory in production */
	path: string
	/** URL route prefix (e.g., '/files' -> /files/...) */
	route: string
	/** Path to use in development (relative to project root) */
	devPath?: string
}

/**
 * Cache-Control cacheability directive
 */
export type CacheDirective = CacheDirective

/**
 * Cache rule configuration
 */
export interface CacheRule {
	/** Regex pattern to match file paths */
	match: RegExp
	/** Cache-Control max-age in seconds */
	maxAge: number
	/** Add must-revalidate directive */
	mustRevalidate?: boolean
	/** Add immutable directive */
	immutable?: boolean
	/** Override cacheability for this rule ('private' or 'public') */
	cacheability?: CacheDirective
}

/**
 * Module options
 */
export interface LocalAssetsOptions {
	/** Directory configurations */
	dirs: LocalAssetsDirConfig[]

	/** Authentication configuration */
	auth?: {
		/** Require authentication for all requests */
		required?: boolean
		/** Path to authorization function (e.g., '~/server/utils/authorize') */
		authorize?: string
		/** Path to custom user extractor function (e.g., '~/server/utils/get-user')
		 * Function signature: (event: H3Event) => unknown | null | Promise<unknown | null>
		 * If not provided, falls back to checking event.context.user, event.context.auth.user, event.context.session.user
		 */
		userExtractor?: string
	}

	/** Audit logging configuration */
	audit?: {
		/** Enable audit logging */
		enabled?: boolean
		/** Path to audit handler function */
		handler?: string
	}

	/** Security configuration */
	security?: {
		/** Allowed MIME types (e.g., ['image/*', 'application/pdf']) */
		allowedMimeTypes?: string[]
		/** Blocked file extensions */
		blockedExtensions?: string[]
		/** Maximum file size (e.g., '100mb') */
		maxFileSize?: string
	}

	/** Cache configuration */
	cache?: {
		/** Enable ETag generation */
		etag?: boolean
		/** Enable Last-Modified header */
		lastModified?: boolean
		/** Cache rules by file pattern */
		rules?: CacheRule[]
		/** Default cacheability directive: 'private' (default) or 'public'
		 * Use 'private' for auth-protected content, 'public' to allow CDN caching
		 * Can be overridden per rule via CacheRule.cacheability
		 */
		cacheability?: CacheDirective
	}

	/** Compression configuration */
	compression?: {
		/** Enable response compression */
		enabled?: boolean
		/** MIME types to compress */
		types?: string[]
		/** Minimum size to compress */
		threshold?: string
	}

	/** Range request configuration */
	rangeRequest?: {
		/** Enable range requests (for resume downloads) */
		enabled?: boolean
		/** Maximum chunk size per request */
		maxChunkSize?: string
	}

	/** Redirect configuration */
	redirect?: {
		/** Path to redirect function (e.g., '~/server/utils/redirect') */
		handler?: string
	}
}

/**
 * Context passed to authorization function
 */
export interface FileAccessContext {
	/** Authenticated user (null if not authenticated) */
	user: unknown | null
	/** Requested file path (relative to directory) */
	filePath: string
	/** Full resolved file path */
	fullPath: string
	/** File metadata (if file exists) */
	fileMeta?: {
		size: number
		mtime: Date
		mimeType: string
	}
	/** H3 event object */
	event: H3Event
	/** Directory configuration that matched */
	dirConfig: LocalAssetsDirConfig
}

/**
 * Audit log entry
 */
export interface AuditLogEntry {
	/** Timestamp of the access attempt */
	timestamp: Date
	/** User ID (null if not authenticated) */
	idUser: string | null
	/** Action result */
	action: 'access' | 'denied' | 'not_found' | 'error'
	/** Requested file path */
	filePath: string
	/** Client IP address */
	ipAddress: string
	/** Client user agent */
	userAgent: string
	/** Denial reason (if denied) */
	reason?: string
	/** Directory name */
	dirName: string
}

/**
 * Authorization function type
 */
export type AuthorizeFunction = (ctx: FileAccessContext) => boolean | Promise<boolean>

/**
 * User extractor function type
 * Extracts user from H3 event - override if your auth middleware stores user in a non-standard location
 */
export type UserExtractorFunction = (event: H3Event) => unknown | null | Promise<unknown | null>

/**
 * Audit handler function type
 */
export type AuditHandler = (entry: AuditLogEntry) => void | Promise<void>

/**
 * Context passed to redirect function
 */
export interface RedirectContext {
	/** Requested file path (relative to directory) */
	filePath: string
	/** Full URL path */
	urlPath: string
	/** Authenticated user (null if not authenticated) */
	user: unknown | null
	/** H3 event object */
	event: H3Event
	/** Directory configuration that matched */
	dirConfig: LocalAssetsDirConfig
}

/**
 * Redirect result
 */
export interface RedirectResult {
	/** URL to redirect to */
	url: string
	/** HTTP status code (301 or 302, default 302) */
	statusCode?: 301 | 302
}

/**
 * Redirect function type
 * Return string URL, RedirectResult object, or null/undefined to continue normal processing
 */
export type RedirectFunction = (ctx: RedirectContext) => string | RedirectResult | null | undefined | Promise<string | RedirectResult | null | undefined>

/**
 * Parsed range request
 */
export interface ParsedRange {
	start: number
	end: number
}

// Extend Nuxt runtime config
declare module 'nuxt/schema' {
	interface RuntimeConfig {
		localAssets?: LocalAssetsOptions
	}
}

declare module '@nuxt/schema' {
	interface RuntimeConfig {
		localAssets?: LocalAssetsOptions
	}
}
