import { defineNuxtModule, addServerHandler, createResolver, addServerImports, useNuxt } from '@nuxt/kit'
import { resolve, join } from 'path'
import { defu } from 'defu'
import type { LocalAssetsOptions, LocalAssetsDirConfig } from './types'

export type { LocalAssetsOptions, LocalAssetsDirConfig }

/**
 * Resolve a user path (~/xxx or relative) to absolute path
 */
function resolveUserPath(user_path: string | undefined, root_dir: string): string | undefined {
	if (!user_path) {
		return undefined
	}

	let resolved: string

	// Handle ~/ alias (relative to project root)
	if (user_path.startsWith('~/')) {
		resolved = resolve(root_dir, user_path.slice(2))
	}
	// Handle relative paths
	else if (!user_path.startsWith('/')) {
		resolved = resolve(root_dir, user_path)
	}
	// Absolute path
	else {
		resolved = user_path
	}

	// Add .ts extension if not present (for TypeScript files)
	if (!resolved.endsWith('.ts') && !resolved.endsWith('.js') && !resolved.endsWith('.mjs')) {
		resolved = resolved + '.ts'
	}

	return resolved
}

export default defineNuxtModule<LocalAssetsOptions>({
	meta: {
		name: 'nuxt-local-assets',
		configKey: 'localAssets',
		compatibility: {
			nuxt: '>=3.0.0',
		},
	},
	defaults: {
		dirs: [],
		auth: {
			required: false,
		},
		audit: {
			enabled: false,
		},
		security: {
			allowedMimeTypes: [],
			blockedExtensions: ['.exe', '.sh', '.bat', '.cmd', '.ps1'],
			maxFileSize: '100mb',
		},
		cache: {
			etag: true,
			lastModified: true,
			rules: [],
		},
		compression: {
			enabled: true,
			types: ['text/*', 'application/json', 'application/xml', 'application/javascript'],
			threshold: '1kb',
		},
		rangeRequest: {
			enabled: true,
		},
	},
	setup(options, nuxt) {
		const resolver = createResolver(import.meta.url)
		const root_dir = nuxt.options.rootDir

		// Validate configuration
		if (!options.dirs || options.dirs.length === 0) {
			console.warn('[nuxt-local-assets] No directories configured. Module will be inactive.')
			return
		}

		// Resolve handler paths to absolute paths
		const resolved_auth = options.auth ? {
			...options.auth,
			authorize: resolveUserPath(options.auth.authorize, root_dir),
		} : options.auth

		const resolved_audit = options.audit ? {
			...options.audit,
			handler: resolveUserPath(options.audit.handler, root_dir),
		} : options.audit

		const resolved_redirect = options.redirect ? {
			...options.redirect,
			handler: resolveUserPath(options.redirect.handler, root_dir),
		} : options.redirect

		// Inject runtime config
		nuxt.options.runtimeConfig.localAssets = defu(
			nuxt.options.runtimeConfig.localAssets || {},
			{
				isDev: nuxt.options.dev,
				dirs: options.dirs,
				auth: resolved_auth,
				audit: resolved_audit,
				redirect: resolved_redirect,
				security: options.security,
				cache: options.cache,
				compression: options.compression,
				rangeRequest: options.rangeRequest,
			}
		)

		// Add server utilities as imports
		addServerImports([
			{
				name: 'sanitizePath',
				from: resolver.resolve('./runtime/server/utils/path'),
			},
			{
				name: 'resolveFilePath',
				from: resolver.resolve('./runtime/server/utils/path'),
			},
			{
				name: 'computeETag',
				from: resolver.resolve('./runtime/server/utils/cache'),
			},
			{
				name: 'parseRangeHeader',
				from: resolver.resolve('./runtime/server/utils/range'),
			},
			{
				name: 'getCacheHeaders',
				from: resolver.resolve('./runtime/server/utils/cache'),
			},
		])

		// Register server handlers for each configured directory
		for (const dir of options.dirs) {
			const route_base = dir.route.startsWith('/') ? dir.route : `/${dir.route}`
			const route_pattern = `${route_base}/**`

			addServerHandler({
				route: route_pattern,
				method: 'get',
				handler: resolver.resolve('./runtime/server/handler'),
			})

			console.log(`[nuxt-local-assets] Registered handler for ${route_pattern}`)
		}

		// Hook to ensure directories are not included in public assets
		nuxt.hook('nitro:config', (nitro_config) => {
			// Ensure our runtime is transpiled
			nitro_config.externals = nitro_config.externals || {}
			nitro_config.externals.inline = nitro_config.externals.inline || []
			nitro_config.externals.inline.push(resolver.resolve('./runtime'))
		})
	},
})
