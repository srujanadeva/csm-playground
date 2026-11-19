/** Service request rules that don't need a server: callback hours in IST, tags, rich-text length. */
import { describe, expect, it } from 'vitest'
import { richTextTextLength } from '../src/richText.ts'
import { callbackProblem, tagsSchema } from '../src/schemas/serviceRequest.ts'

// Wednesday 18 Nov 2026, 10:00 IST.
const now = new Date('2026-11-18T04:30:00Z')
const ist = (isoLocal: string) => new Date(`${isoLocal}+05:30`)

describe('callbackProblem', () => {
  it('allows Monday–Saturday 09:00–18:00 IST within 30 days', () => {
    expect(callbackProblem(ist('2026-11-19T09:00:00'), now)).toBeNull()
    expect(callbackProblem(ist('2026-11-21T18:00:00'), now)).toBeNull() // Saturday, closing minute
  })

  it('refuses the past, Sundays, out-of-hours and more than 30 days ahead', () => {
    expect(callbackProblem(ist('2026-11-18T09:59:00'), now)).toBe('callbackFuture')
    expect(callbackProblem(ist('2026-11-22T11:00:00'), now)).toBe('callbackHours') // Sunday
    expect(callbackProblem(ist('2026-11-19T08:59:00'), now)).toBe('callbackHours')
    expect(callbackProblem(ist('2026-11-19T18:01:00'), now)).toBe('callbackHours')
    expect(callbackProblem(ist('2026-12-19T11:00:00'), now)).toBe('callbackRange')
  })
})

describe('tags and rich text', () => {
  it('limits tags to 10 distinct values of 2–20 characters', () => {
    expect(tagsSchema.safeParse(['VIP', 'Branch visit']).success).toBe(true)
    expect(tagsSchema.safeParse(['VIP', 'vip']).success).toBe(false)
    expect(tagsSchema.safeParse(['x']).success).toBe(false)
    expect(tagsSchema.safeParse(Array.from({ length: 11 }, (_, i) => `tag ${i}`)).success).toBe(false)
  })

  it('counts visible characters only', () => {
    expect(richTextTextLength('<p>Card <b>reissued</b>&nbsp;ok</p>')).toBe(16)
  })
})
