import { describe, it, expect } from 'vitest'
import { parseRangeHeader, formatContentRange, getRangeContentLength } from '../src/runtime/server/utils/range'

describe('parseRangeHeader', () => {
	const FILE_SIZE = 1000

	it('parses standard range', () => {
		expect(parseRangeHeader('bytes=0-499', FILE_SIZE)).toEqual({ start: 0, end: 499 })
		expect(parseRangeHeader('bytes=500-999', FILE_SIZE)).toEqual({ start: 500, end: 999 })
	})

	it('parses suffix range (last N bytes)', () => {
		expect(parseRangeHeader('bytes=-100', FILE_SIZE)).toEqual({ start: 900, end: 999 })
		expect(parseRangeHeader('bytes=-500', FILE_SIZE)).toEqual({ start: 500, end: 999 })
	})

	it('parses open-ended range', () => {
		expect(parseRangeHeader('bytes=500-', FILE_SIZE)).toEqual({ start: 500, end: 999 })
		expect(parseRangeHeader('bytes=0-', FILE_SIZE)).toEqual({ start: 0, end: 999 })
	})

	it('clamps end to file size', () => {
		expect(parseRangeHeader('bytes=0-9999', FILE_SIZE)).toEqual({ start: 0, end: 999 })
	})

	it('returns null for invalid ranges', () => {
		expect(parseRangeHeader('bytes=', FILE_SIZE)).toBeNull()
		expect(parseRangeHeader('bytes=-', FILE_SIZE)).toBeNull()
		expect(parseRangeHeader('bytes=500-100', FILE_SIZE)).toBeNull() // start > end
		expect(parseRangeHeader('bytes=1500-2000', FILE_SIZE)).toBeNull() // start > file_size
		expect(parseRangeHeader('invalid', FILE_SIZE)).toBeNull()
		expect(parseRangeHeader('', FILE_SIZE)).toBeNull()
	})
})

describe('formatContentRange', () => {
	it('formats content range correctly', () => {
		expect(formatContentRange({ start: 0, end: 499 }, 1000)).toBe('bytes 0-499/1000')
		expect(formatContentRange({ start: 500, end: 999 }, 1000)).toBe('bytes 500-999/1000')
	})
})

describe('getRangeContentLength', () => {
	it('calculates content length correctly', () => {
		expect(getRangeContentLength({ start: 0, end: 499 })).toBe(500)
		expect(getRangeContentLength({ start: 0, end: 0 })).toBe(1)
		expect(getRangeContentLength({ start: 100, end: 199 })).toBe(100)
	})
})
