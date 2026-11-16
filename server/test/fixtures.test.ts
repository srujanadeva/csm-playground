import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { OCR_FIXTURES } from '../src/fixtures/ocr.ts'

const ocrDir = resolve(import.meta.dirname, '../../testresources/ocr')

describe('OCR fixtures', () => {
  it('match the sample images byte for byte', () => {
    for (const [hash, fixture] of Object.entries(OCR_FIXTURES)) {
      const actual = createHash('sha256')
        .update(readFileSync(resolve(ocrDir, fixture.sample)))
        .digest('hex')
      expect(actual, fixture.sample).toBe(hash)
    }
  })
})
