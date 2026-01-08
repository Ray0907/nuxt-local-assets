import type { FileAccessContext } from '../../../src/types'

/**
 * Example authorization function
 * Customize this based on your permission model
 */
export default function authorize(ctx: FileAccessContext): boolean {
	const { user, filePath } = ctx

	// No user = deny (if auth is required)
	if (!user) {
		return false
	}

	// Type assertion for user object
	const typed_user = user as { id?: string; role?: string }

	// Admin can access everything
	if (typed_user.role === 'admin') {
		return true
	}

	// Users can only access their own files
	// Assuming path structure: /users/{user_id}/...
	if (filePath.startsWith(`users/${typed_user.id}/`)) {
		return true
	}

	// Public folder accessible to all authenticated users
	if (filePath.startsWith('public/')) {
		return true
	}

	// Deny by default
	return false
}
