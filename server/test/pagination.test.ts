import { describe, expect, it } from 'vitest'
import { Types } from 'mongoose'
import { AppError } from '../src/lib/errors.ts'
import { clampPageSize, decodeCursor, encodeCursor, parseSort, toCursorPage } from '../src/lib/pagination.ts'

describe('pagination helpers', () => {
  it('clamps page size to the screen maximum', () => {
    expect(clampPageSize(500, 100)).toBe(100)
    expect(clampPageSize(0, 100)).toBe(1)
  })

  it('parses whitelisted sorts with an _id tie-breaker', () => {
    expect(parseSort('-createdAt', ['createdAt', 'cif'], { cif: 1 })).toEqual({ createdAt: -1, _id: -1 })
    expect(parseSort(undefined, ['cif'], { cif: 1 })).toEqual({ cif: 1 })
    expect(() => parseSort('passwordHash', ['cif'], { cif: 1 })).toThrow(AppError)
  })

  it('round-trips cursors and rejects garbage', () => {
    const id = new Types.ObjectId()
    expect(decodeCursor(encodeCursor(id)).equals(id)).toBe(true)
    expect(() => decodeCursor('not-a-cursor')).toThrow(AppError)
  })

  it('reports a next cursor only when there are more rows', () => {
    const rows = Array.from({ length: 3 }, () => ({ _id: new Types.ObjectId() }))
    expect(toCursorPage(rows, 2).nextCursor).toBe(encodeCursor(rows[1]!._id))
    expect(toCursorPage(rows, 3).nextCursor).toBeNull()
  })
})
