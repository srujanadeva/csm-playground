// What the mock OCR "reads" from each sample ID card in testresources/ocr/ (copied from
// test-playground). Uploads are matched by sha256, so the images must not be edited; any other
// image is reported as unreadable. Confidence is 0–1; the KYC step flags fields below 0.8.

export interface OcrField {
  key: 'fullName' | 'idNumber' | 'dateOfBirth' | 'city' | 'expiryDate'
  value: string
  confidence: number
}

export interface OcrResult {
  sample: string
  documentType: string
  fields: OcrField[]
}

/** The threshold below which a field must be confirmed by the user. */
export const OCR_LOW_CONFIDENCE = 0.8

// sha256 of the image file -> what OCR returns for it.
export const OCR_FIXTURES: Record<string, OcrResult> = {
  d62cf8e9722971790ff00c1c4227ec72ff391e9289e4ce22c13dab5cdbf1f2ce: {
    sample: 'id-clean.png',
    documentType: 'Sample ID card',
    fields: [
      { key: 'fullName', value: 'Layla Haddad', confidence: 0.98 },
      { key: 'idNumber', value: 'PG-4821-7730', confidence: 0.99 },
      { key: 'dateOfBirth', value: '1994-03-12', confidence: 0.97 },
      { key: 'city', value: 'Amman', confidence: 0.96 },
      { key: 'expiryDate', value: '2031-08-30', confidence: 0.98 },
    ],
  },
  // Blurred photo: low confidence everywhere, and the ID number has a zero misread as "O".
  '24ca80363a6da296d489a8ae797a3b814e53ea1ab4bf3c2b881b26f66f99ef70': {
    sample: 'id-blurry.png',
    documentType: 'Sample ID card',
    fields: [
      { key: 'fullName', value: 'Arjun Rao', confidence: 0.71 },
      { key: 'idNumber', value: 'PG-5O93-1182', confidence: 0.58 },
      { key: 'dateOfBirth', value: '1988-11-05', confidence: 0.66 },
      { key: 'city', value: 'Bengaluru', confidence: 0.82 },
      { key: 'expiryDate', value: '2029-02-14', confidence: 0.62 },
    ],
  },
  // A sticker hides the expiry date, so it comes back empty.
  '0275ffe2265d34ba2201e6521640f518bf92a719eb6414be36ef84d831e225a0': {
    sample: 'id-partial.png',
    documentType: 'Sample ID card',
    fields: [
      { key: 'fullName', value: 'Mei Tanaka', confidence: 0.97 },
      { key: 'idNumber', value: 'PG-3307-6419', confidence: 0.96 },
      { key: 'dateOfBirth', value: '1991-07-23', confidence: 0.95 },
      { key: 'city', value: 'Osaka', confidence: 0.93 },
      { key: 'expiryDate', value: '', confidence: 0 },
    ],
  },
}
