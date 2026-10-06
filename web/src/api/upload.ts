/**
 * File upload with progress. fetch() can't report upload progress, so this uses
 * XMLHttpRequest, with the same CSRF header and problem+json error handling as `api()`.
 */
import type { Problem } from '@csm/shared'
import { ApiError, ensureCsrf } from './client.ts'

/** POSTs one file (plus extra fields) and reports progress from 0 to 100. */
export async function uploadFile<T>(
  path: string,
  file: File,
  fields: Record<string, string>,
  onProgress: (percent: number) => void,
): Promise<T> {
  const token = await ensureCsrf()
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  form.append('file', file)
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/v1${path}`)
    xhr.withCredentials = true
    xhr.setRequestHeader('X-CSRF-Token', token)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      let body: unknown
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        body = null
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T)
      else
        reject(
          new ApiError(
            (body as Problem) ?? { type: 'about:blank', title: 'Upload failed', status: xhr.status },
          ),
        )
    }
    xhr.onerror = () => reject(new ApiError({ type: 'about:blank', title: 'Network error', status: 0 }))
    xhr.send(form)
  })
}
