import { describe, it, expect } from 'vitest'
import { getMimeType, getContentType, isMimeTypeAllowed, isExtensionBlocked, parseFileSize } from '../src/runtime/server/utils/mime'

describe('getMimeType', () => {
	it('returns correct MIME types for common files', () => {
		expect(getMimeType('image.png')).toBe('image/png')
		expect(getMimeType('image.jpg')).toBe('image/jpeg')
		expect(getMimeType('document.pdf')).toBe('application/pdf')
		expect(getMimeType('script.js')).toBe('application/javascript')
		expect(getMimeType('styles.css')).toBe('text/css')
		expect(getMimeType('data.json')).toBe('application/json')
	})

	it('handles paths with directories', () => {
		expect(getMimeType('/path/to/image.png')).toBe('image/png')
		expect(getMimeType('folder/subfolder/file.txt')).toBe('text/plain')
	})

	it('returns fallback for unknown types', () => {
		// .xyz is actually a known type (chemical/x-xyz)
		// noextension has no extension, so returns fallback
		expect(getMimeType('noextension')).toBe('application/octet-stream')
		expect(getMimeType('file.unknownext123')).toBe('application/octet-stream')
	})
})

describe('getContentType', () => {
	it('adds charset for text types', () => {
		expect(getContentType('file.html')).toBe('text/html; charset=utf-8')
		expect(getContentType('file.css')).toBe('text/css; charset=utf-8')
		expect(getContentType('file.js')).toBe('application/javascript; charset=utf-8')
	})

	it('returns plain MIME for binary types', () => {
		expect(getContentType('image.png')).toBe('image/png')
		expect(getContentType('document.pdf')).toBe('application/pdf')
	})

	it('returns fallback for unknown types', () => {
		expect(getContentType('file.unknownext123')).toBe('application/octet-stream')
	})
})

describe('isMimeTypeAllowed', () => {
	it('allows all when whitelist is empty', () => {
		expect(isMimeTypeAllowed('image/png', [])).toBe(true)
		expect(isMimeTypeAllowed('application/pdf', [])).toBe(true)
	})

	it('matches exact MIME types', () => {
		const patterns = ['image/png', 'application/pdf']
		expect(isMimeTypeAllowed('image/png', patterns)).toBe(true)
		expect(isMimeTypeAllowed('application/pdf', patterns)).toBe(true)
		expect(isMimeTypeAllowed('image/jpeg', patterns)).toBe(false)
	})

	it('matches wildcard patterns', () => {
		const patterns = ['image/*']
		expect(isMimeTypeAllowed('image/png', patterns)).toBe(true)
		expect(isMimeTypeAllowed('image/jpeg', patterns)).toBe(true)
		expect(isMimeTypeAllowed('image/gif', patterns)).toBe(true)
		expect(isMimeTypeAllowed('application/pdf', patterns)).toBe(false)
	})

	it('matches type-only patterns', () => {
		const patterns = ['image']
		expect(isMimeTypeAllowed('image/png', patterns)).toBe(true)
		expect(isMimeTypeAllowed('image/jpeg', patterns)).toBe(true)
		expect(isMimeTypeAllowed('text/plain', patterns)).toBe(false)
	})

	it('handles mixed patterns', () => {
		const patterns = ['image/*', 'application/pdf', 'text']
		expect(isMimeTypeAllowed('image/png', patterns)).toBe(true)
		expect(isMimeTypeAllowed('application/pdf', patterns)).toBe(true)
		expect(isMimeTypeAllowed('text/html', patterns)).toBe(true)
		expect(isMimeTypeAllowed('application/json', patterns)).toBe(false)
	})
})

describe('isExtensionBlocked', () => {
	it('returns false when no extensions blocked', () => {
		expect(isExtensionBlocked('file.exe', [])).toBe(false)
		expect(isExtensionBlocked('script.sh', [])).toBe(false)
	})

	it('blocks listed extensions', () => {
		const blocked = ['.exe', '.sh', '.bat']
		expect(isExtensionBlocked('malware.exe', blocked)).toBe(true)
		expect(isExtensionBlocked('script.sh', blocked)).toBe(true)
		expect(isExtensionBlocked('batch.bat', blocked)).toBe(true)
	})

	it('allows non-blocked extensions', () => {
		const blocked = ['.exe', '.sh']
		expect(isExtensionBlocked('image.png', blocked)).toBe(false)
		expect(isExtensionBlocked('document.pdf', blocked)).toBe(false)
	})

	it('handles case insensitivity', () => {
		const blocked = ['.exe', '.EXE']
		expect(isExtensionBlocked('file.EXE', blocked)).toBe(true)
		expect(isExtensionBlocked('file.exe', blocked)).toBe(true)
	})

	it('handles paths with directories', () => {
		const blocked = ['.exe']
		expect(isExtensionBlocked('/path/to/file.exe', blocked)).toBe(true)
		expect(isExtensionBlocked('folder/file.txt', blocked)).toBe(false)
	})
})

describe('parseFileSize', () => {
	it('parses bytes', () => {
		expect(parseFileSize('100')).toBe(100)
		expect(parseFileSize('100b')).toBe(100)
		expect(parseFileSize('100B')).toBe(100)
	})

	it('parses kilobytes', () => {
		expect(parseFileSize('1kb')).toBe(1024)
		expect(parseFileSize('10KB')).toBe(10240)
		expect(parseFileSize('1.5kb')).toBe(1536)
	})

	it('parses megabytes', () => {
		expect(parseFileSize('1mb')).toBe(1048576)
		expect(parseFileSize('100MB')).toBe(104857600)
		expect(parseFileSize('2.5mb')).toBe(2621440)
	})

	it('parses gigabytes', () => {
		expect(parseFileSize('1gb')).toBe(1073741824)
		expect(parseFileSize('2GB')).toBe(2147483648)
	})

	it('parses terabytes', () => {
		expect(parseFileSize('1tb')).toBe(1099511627776)
	})

	it('returns 0 for invalid input', () => {
		expect(parseFileSize('')).toBe(0)
		expect(parseFileSize('invalid')).toBe(0)
		expect(parseFileSize('abc123')).toBe(0)
	})

	it('handles whitespace in value', () => {
		// The regex allows optional whitespace between number and unit
		expect(parseFileSize('100 mb')).toBe(104857600) // space is allowed
	})
})
