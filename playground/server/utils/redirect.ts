import type { RedirectContext, RedirectResult } from '../../../src/types'

/**
 * Example redirect handler
 *
 * Use cases:
 * - File moved to new location
 * - Short URLs / aliases
 * - Version-based redirects
 * - User-specific redirects
 */
export default async (ctx: RedirectContext): Promise<string | RedirectResult | null> => {
	const { filePath, urlPath, user, dirConfig } = ctx

	// Example 1: Redirect old file paths to new locations
	const path_redirects: Record<string, string> = {
		'old-document.pdf': '/files/documents/new-document.pdf',
		'legacy/report.pdf': '/files/reports/annual-2024.pdf',
	}
	if (path_redirects[filePath]) {
		return {
			url: path_redirects[filePath],
			statusCode: 301, // Permanent redirect
		}
	}

	// Example 2: Redirect based on file pattern (e.g., short URLs)
	if (filePath.startsWith('s/')) {
		const short_code = filePath.slice(2)
		// In real app, lookup short code in database
		const resolved_path = await lookupShortCode(short_code)
		if (resolved_path) {
			return resolved_path // 302 temporary redirect
		}
	}

	// Example 3: Redirect "latest" to specific version
	if (filePath.includes('/latest/')) {
		const versioned_path = filePath.replace('/latest/', '/v2.0/')
		return `${dirConfig.route}/${versioned_path}`
	}

	// No redirect - continue normal file serving
	return null
}

/**
 * Example: Lookup short code (replace with database query in real app)
 */
async function lookupShortCode(code: string): Promise<string | null> {
	const short_urls: Record<string, string> = {
		'abc123': '/files/documents/important-file.pdf',
		'xyz789': '/files/images/logo.png',
	}
	return short_urls[code] || null
}
