import { describe, it, expect } from 'vitest'
import { sanitizePath, extractRelativePath, isPathWithinBase } from '../src/runtime/server/utils/path'

describe('sanitizePath', () => {
	it('allows valid paths', () => {
		expect(sanitizePath('file.txt')).toBe('file.txt')
		expect(sanitizePath('folder/file.txt')).toBe('folder/file.txt')
		expect(sanitizePath('a/b/c/file.txt')).toBe('a/b/c/file.txt')
	})

	it('blocks directory traversal', () => {
		expect(sanitizePath('../etc/passwd')).toBeNull()
		// foo/../bar normalizes to 'bar' which is safe (stays within base)
		expect(sanitizePath('foo/../bar')).toBe('bar')
		// foo/../../etc/passwd escapes the base directory
		expect(sanitizePath('foo/../../etc/passwd')).toBeNull()
		expect(sanitizePath('..%2Fetc%2Fpasswd')).toBeNull()
		expect(sanitizePath('....//....//etc/passwd')).toBeNull()
	})

	it('blocks null bytes', () => {
		expect(sanitizePath('file.txt\0.exe')).toBeNull()
		expect(sanitizePath('file\0')).toBeNull()
	})

	it('blocks absolute paths', () => {
		expect(sanitizePath('/etc/passwd')).toBeNull()
		expect(sanitizePath('\\windows\\system32')).toBeNull()
	})

	it('handles URL encoding', () => {
		expect(sanitizePath('file%20name.txt')).toBe('file name.txt')
		expect(sanitizePath('%2e%2e/etc/passwd')).toBeNull() // ../ encoded
	})

	it('normalizes paths', () => {
		expect(sanitizePath('foo//bar')).toBe('foo/bar')
		expect(sanitizePath('foo/./bar')).toBe('foo/bar')
	})

	it('handles empty and invalid input', () => {
		expect(sanitizePath('')).toBeNull()
		expect(sanitizePath(null as any)).toBeNull()
		expect(sanitizePath(undefined as any)).toBeNull()
	})
})

describe('extractRelativePath', () => {
	it('extracts path after route prefix', () => {
		expect(extractRelativePath('/files/doc.pdf', '/files')).toBe('doc.pdf')
		expect(extractRelativePath('/files/folder/doc.pdf', '/files')).toBe('folder/doc.pdf')
	})

	it('handles trailing slashes', () => {
		expect(extractRelativePath('/files/doc.pdf', '/files/')).toBe('doc.pdf')
	})
})

describe('isPathWithinBase', () => {
	it('returns true for paths within base', () => {
		expect(isPathWithinBase('/data/uploads/file.txt', '/data/uploads')).toBe(true)
		expect(isPathWithinBase('/data/uploads/sub/file.txt', '/data/uploads')).toBe(true)
	})

	it('returns false for paths outside base', () => {
		expect(isPathWithinBase('/etc/passwd', '/data/uploads')).toBe(false)
		expect(isPathWithinBase('/data/other/file.txt', '/data/uploads')).toBe(false)
	})
})
