import { describe, it, expect } from 'vitest'
import { computeETagFromValues, getCacheControl, isClientCacheValid } from '../src/runtime/server/utils/cache'

describe('computeETagFromValues', () => {
	it('generates consistent ETags', () => {
		const etag1 = computeETagFromValues(12345, 1700000000000, 1024)
		const etag2 = computeETagFromValues(12345, 1700000000000, 1024)
		expect(etag1).toBe(etag2)
	})

	it('generates different ETags for different values', () => {
		const etag1 = computeETagFromValues(12345, 1700000000000, 1024)
		const etag2 = computeETagFromValues(12345, 1700000000001, 1024) // different mtime
		expect(etag1).not.toBe(etag2)
	})

	it('formats ETag with quotes', () => {
		const etag = computeETagFromValues(12345, 1700000000000, 1024)
		expect(etag).toMatch(/^"[A-Za-z0-9_-]+"$/)
	})
})

describe('getCacheControl', () => {
	it('returns default cache control', () => {
		expect(getCacheControl('file.txt', [])).toBe('private, no-cache, must-revalidate')
	})

	it('applies matching rules', () => {
		const rules = [
			{ match: /\.jpg$/i, maxAge: 86400 },
			{ match: /\.pdf$/i, maxAge: 3600 },
		]

		expect(getCacheControl('image.jpg', rules)).toBe('private, max-age=86400')
		expect(getCacheControl('doc.pdf', rules)).toBe('private, max-age=3600')
		expect(getCacheControl('file.txt', rules)).toBe('private, no-cache, must-revalidate')
	})

	it('handles mustRevalidate option', () => {
		const rules = [
			{ match: /\.jpg$/i, maxAge: 86400, mustRevalidate: true },
		]

		expect(getCacheControl('image.jpg', rules)).toBe('private, max-age=86400, must-revalidate')
	})

	it('handles immutable option', () => {
		const rules = [
			{ match: /\.jpg$/i, maxAge: 86400, immutable: true },
		]

		expect(getCacheControl('image.jpg', rules)).toBe('private, max-age=86400, immutable')
	})
})

describe('isClientCacheValid', () => {
	const etag = '"abc123"'
	const mtime = new Date('2024-01-01T00:00:00Z')

	it('returns true for matching ETag', () => {
		expect(isClientCacheValid({ 'if-none-match': '"abc123"' }, etag, mtime)).toBe(true)
	})

	it('returns false for non-matching ETag', () => {
		expect(isClientCacheValid({ 'if-none-match': '"xyz789"' }, etag, mtime)).toBe(false)
	})

	it('handles wildcard ETag', () => {
		expect(isClientCacheValid({ 'if-none-match': '*' }, etag, mtime)).toBe(true)
	})

	it('returns true for valid If-Modified-Since', () => {
		const client_date = new Date('2024-01-02T00:00:00Z') // after mtime
		expect(isClientCacheValid(
			{ 'if-modified-since': client_date.toUTCString() },
			etag,
			mtime,
		)).toBe(true)
	})

	it('returns false for stale If-Modified-Since', () => {
		const client_date = new Date('2023-12-01T00:00:00Z') // before mtime
		expect(isClientCacheValid(
			{ 'if-modified-since': client_date.toUTCString() },
			etag,
			mtime,
		)).toBe(false)
	})

	it('prefers ETag over If-Modified-Since', () => {
		// Even with valid If-Modified-Since, non-matching ETag should return false
		const client_date = new Date('2024-01-02T00:00:00Z')
		expect(isClientCacheValid(
			{
				'if-none-match': '"wrong"',
				'if-modified-since': client_date.toUTCString(),
			},
			etag,
			mtime,
		)).toBe(false)
	})
})
