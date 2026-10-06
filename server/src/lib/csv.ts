/**
 * CSV export with formula-injection protection (OWASP A05). A cell starting with = + - @
 * (or tab / carriage return) could run as a formula when the file is opened in a
 * spreadsheet, so such cells get a leading apostrophe.
 */

const DANGEROUS_START = /^[=+\-@\t\r]/

/** Escapes one value for a CSV cell. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value)
  if (DANGEROUS_START.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Builds a CSV document (with a BOM so Excel reads UTF-8 Kannada correctly). */
export function toCsv(headers: string[], rows: unknown[][]): string {
  return '﻿' + [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
