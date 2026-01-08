import { describe, it, expect } from 'vitest'
import { parseAcceptEncoding, shouldCompress } from '../src/runtime/server/utils/compress'

describe('parseAcceptEncoding', () => {
	it('returns identity when no header', () => {
		expect(parseAcceptEncoding(undefined)).toBe('identity')
		expect(parseAcceptEncoding('')).toBe('identity')
	})

	it('parses simple encodings', () => {
		expect(parseAcceptEncoding('gzip')).toBe('gzip')
		expect(parseAcceptEncoding('br')).toBe('br')
	})

	it('prefers brotli over gzip', () => {
		expect(parseAcceptEncoding('gzip, br')).toBe('br')
		expect(parseAcceptEncoding('br, gzip')).toBe('br')
	})

	it('respects quality values', () => {
		expect(parseAcceptEncoding('gzip;q=1, br;q=0.5')).toBe('gzip')
		expect(parseAcceptEncoding('br;q=0.8, gzip;q=0.9')).toBe('gzip')
	})

	it('ignores unsupported encodings', () => {
		expect(parseAcceptEncoding('deflate, identity')).toBe('identity')
		expect(parseAcceptEncoding('compress')).toBe('identity')
	})

	it('handles q=0 (disabled)', () => {
		expect(parseAcceptEncoding('br;q=0, gzip')).toBe('gzip')
		expect(parseAcceptEncoding('gzip;q=0, br;q=0')).toBe('identity')
	})

	it('handles wildcard', () => {
		// Wildcard should not match our specific encodings
		expect(parseAcceptEncoding('*')).toBe('identity')
	})

	it('handles complex Accept-Encoding headers', () => {
		expect(parseAcceptEncoding('gzip, deflate, br')).toBe('br')
		expect(parseAcceptEncoding('gzip;q=0.8, deflate;q=0.6, br;q=1.0')).toBe('br')
	})
})

describe('shouldCompress', () => {
	it('returns false when no patterns', () => {
		expect(shouldCompress('text/html', [])).toBe(false)
	})

	it('matches exact MIME types', () => {
		const patterns = ['text/html', 'application/json']
		expect(shouldCompress('text/html', patterns)).toBe(true)
		expect(shouldCompress('application/json', patterns)).toBe(true)
		expect(shouldCompress('image/png', patterns)).toBe(false)
	})

	it('matches wildcard patterns', () => {
		const patterns = ['text/*']
		expect(shouldCompress('text/html', patterns)).toBe(true)
		expect(shouldCompress('text/css', patterns)).toBe(true)
		expect(shouldCompress('text/plain', patterns)).toBe(true)
		expect(shouldCompress('image/png', patterns)).toBe(false)
	})

	it('matches type-only patterns', () => {
		const patterns = ['text']
		expect(shouldCompress('text/html', patterns)).toBe(true)
		expect(shouldCompress('text/css', patterns)).toBe(true)
		expect(shouldCompress('application/json', patterns)).toBe(false)
	})

	it('handles default compression types', () => {
		const default_types = ['text/*', 'application/json', 'application/xml', 'application/javascript']
		expect(shouldCompress('text/html', default_types)).toBe(true)
		expect(shouldCompress('text/css', default_types)).toBe(true)
		expect(shouldCompress('application/json', default_types)).toBe(true)
		expect(shouldCompress('application/javascript', default_types)).toBe(true)
		expect(shouldCompress('image/png', default_types)).toBe(false)
	})
})
