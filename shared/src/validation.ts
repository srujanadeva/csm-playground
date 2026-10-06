/**
 * Validation message codes.
 *
 * Schemas use these short codes instead of sentences, so the same rule can be shown in
 * English or Kannada: the API returns `{ code, message }` (message in English), and the web
 * app translates the code with i18next (`validation:<code>`).
 */
import { z } from 'zod'

export const VALIDATION_MESSAGES = {
  required: 'This field is required.',
  invalid: 'Enter a valid value.',
  tooLong: 'This is too long.',
  staffIdFormat: 'Staff IDs look like csr001.',
  passwordMin: 'Use at least 12 characters.',
  passwordMax: 'Use at most 128 characters.',
  passwordBreached: 'This password is too common. Choose another.',
  passwordContainsId: "Don't include your staff ID or name in the password.",
  passwordSame: 'Choose a different password from your current one.',
  passwordMismatch: "The passwords don't match.",
  nameFormat: 'Use letters, spaces, dots, apostrophes or hyphens.',
  dobAdult: 'The customer must be 18 or older.',
  incomeRange: 'Enter an amount between ₹0 and ₹1,00,00,000.',
  mobileFormat: 'Enter a 10-digit mobile number starting with 6, 7, 8 or 9.',
  emailFormat: 'Enter a valid email address.',
  pincodeFormat: 'Enter a 6-digit PIN code.',
  commPrefsMin: 'Choose at least one way to contact the customer.',
  idNumberFormat: "This doesn't match the format for the selected ID type.",
  expiryRequired: 'Enter the expiry date for this ID type.',
  expiryAfterIssue: 'Expiry date must be after the issue date.',
  issueNotFuture: "Issue date can't be in the future.",
  idExpired: 'This ID has expired. Ask the customer for a valid one.',
  pepDetailsRequired: 'Enter the PEP details.',
  declarationRequired: 'Tick this box to continue.',
  subjectLength: 'Use 5 to 120 characters.',
  descriptionLength: 'Use 10 to 1000 characters.',
  slaFuture: 'The SLA due time must be in the future.',
  resolutionRequired: 'Enter at least 10 characters of resolution notes.',
  commentLength: 'Use 1 to 1000 characters.',
  remarksLength: 'Use 10 to 500 characters.',
  labelLength: 'Use 2 to 40 characters.',
  pageSizeOrder: "The default page size can't be more than the maximum.",
  viewRequired: 'Every screen must offer View.',
  currentPasswordWrong: 'Your current password is incorrect.',
} as const

export type ValidationCode = keyof typeof VALIDATION_MESSAGES

/** English text for a code; unknown codes (e.g. from a library) are returned unchanged. */
export function validationMessage(code: string): string {
  return (VALIDATION_MESSAGES as Record<string, string>)[code] ?? code
}

// Issues without an explicit code (type mismatches, bad enums) still get a translatable code.
z.config({
  customError: (issue) =>
    issue.input === undefined || issue.input === null || issue.input === '' ? 'required' : 'invalid',
})
