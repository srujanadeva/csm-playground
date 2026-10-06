/**
 * File uploads (OWASP A04/A08).
 *
 * - Size and count limits are enforced while receiving (multer).
 * - The type is decided by the file's first bytes, never its name or the browser's claim.
 * - Files are stored under a random name outside any web root, readable only by the server.
 * - Downloads use the stored type and `Content-Disposition`; images can be shown inline but
 *   inside a sandbox CSP, everything else is always an attachment.
 */
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Response } from 'express'
import multer from 'multer'
import { badRequest } from './errors.ts'
import { randomToken } from './crypto.ts'

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024
export type AllowedMime = 'image/jpeg' | 'image/png' | 'application/pdf'

/** Receives one file in the "file" field into memory, at most 2 MB. */
export const singleUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 },
}).single('file')

/** Detects JPEG, PNG or PDF from magic bytes. Returns null for anything else. */
export function sniffMime(buf: Buffer): AllowedMime | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'image/png'
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf'
  return null
}

/** Keeps a display name safe: no paths, no control characters, at most 100 characters. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file'
  const cleaned = base.replace(/[^\p{L}\p{N} ._()-]/gu, '_').trim()
  return (cleaned || 'file').slice(0, 100)
}

/** Validates and stores an uploaded file; returns what to record about it. */
export async function storeUpload(
  uploadDir: string,
  file: Express.Multer.File | undefined,
): Promise<{ storageKey: string; mime: AllowedMime; size: number; fileName: string }> {
  if (!file)
    throw badRequest('Choose a file to upload.', [
      { path: 'file', code: 'required', message: 'Choose a file.' },
    ])
  const mime = sniffMime(file.buffer)
  if (!mime) {
    throw badRequest("This file type isn't accepted. Use JPG, PNG or PDF.", [
      { path: 'file', code: 'invalid', message: 'Use JPG, PNG or PDF.' },
    ])
  }
  await mkdir(uploadDir, { recursive: true, mode: 0o700 })
  const storageKey = randomToken(24)
  await writeFile(resolve(uploadDir, storageKey), file.buffer, { mode: 0o600 })
  return { storageKey, mime, size: file.size, fileName: safeFileName(file.originalname) }
}

/** Sends a stored file. Images may be inline (sandboxed); PDFs always download. */
export async function sendUpload(
  res: Response,
  uploadDir: string,
  doc: { storageKey: string; mime: string; fileName: string },
  inline: boolean,
): Promise<void> {
  if (!/^[A-Za-z0-9_-]+$/.test(doc.storageKey)) throw badRequest('Invalid file reference.')
  const data = await readFile(resolve(uploadDir, doc.storageKey))
  const showInline = inline && doc.mime.startsWith('image/')
  res.setHeader('Content-Type', doc.mime)
  res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self'")
  res.setHeader(
    'Content-Disposition',
    `${showInline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
  )
  res.setHeader('Cache-Control', 'private, no-store')
  res.send(data)
}

/** Deletes a stored file; a missing file is not an error. */
export async function deleteUpload(uploadDir: string, storageKey: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]+$/.test(storageKey)) return
  await unlink(resolve(uploadDir, storageKey)).catch(() => undefined)
}
