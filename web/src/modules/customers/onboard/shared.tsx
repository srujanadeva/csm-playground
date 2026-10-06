/**
 * Helpers shared by the onboarding steps: the step contract, empty-value cleanup for draft
 * saves, server-error mapping, and the documents panel (also used by Customer 360).
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import type { CustomerDraftForm, DocumentDTO } from '@csm/shared'
import { ApiError, api } from '../../../api/client.ts'
import { uploadFile } from '../../../api/upload.ts'
import { FileDropzone, precheck } from '../../../components/FileDropzone.tsx'
import { Icon } from '../../../components/Icon.tsx'
import { useToast } from '../../../components/Toast.tsx'
import { formatDate } from '../../../lib/format.ts'

export type Section = 'personal' | 'contact' | 'kyc'

/** What each step receives from the wizard. */
export interface StepProps {
  draft: CustomerDraftForm | null
  /** Saves the step. `next` = full validation passed, move on; `draft` = partial save. */
  save: (section: Section, data: Record<string, unknown>, mode: 'next' | 'draft') => Promise<void>
  /** Registers the function the header's "Save draft" button calls. */
  bindSaveDraft: (fn: () => Promise<void>) => void
  back: () => void
}

/** Removes "", null and empty objects so a partial draft only carries what was typed. */
export function cleanEmpty<T>(value: T): T {
  if (Array.isArray(value)) return value as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      const cleaned = cleanEmpty(v)
      if (cleaned === '' || cleaned === null || cleaned === undefined) continue
      if (typeof cleaned === 'number' && Number.isNaN(cleaned)) continue
      if (
        cleaned &&
        typeof cleaned === 'object' &&
        !Array.isArray(cleaned) &&
        Object.keys(cleaned).length === 0
      )
        continue
      out[k] = cleaned
    }
    return out as T
  }
  return value
}

/** Puts server field errors ("personal.firstName") onto a step's form fields. */
export function applyServerErrors<T extends FieldValues>(
  err: unknown,
  section: string,
  setError: UseFormSetError<T>,
): boolean {
  if (!(err instanceof ApiError) || !err.problem.errors?.length) return false
  for (const e of err.problem.errors) {
    const path = e.path.startsWith(`${section}.`) ? e.path.slice(section.length + 1) : e.path
    setError(path as Path<T>, { message: e.code ?? e.message })
  }
  return true
}

interface Upload {
  id: string
  name: string
  progress: number
  error?: string
}

/** Lists a customer's documents with thumbnails, and uploads new ones with progress. */
export function DocumentsPanel({
  customerRef,
  documents,
  canUpload,
  canDelete,
  onChanged,
  idPrefix,
}: {
  customerRef: string
  documents: DocumentDTO[]
  canUpload: boolean
  canDelete: boolean
  onChanged: () => void
  idPrefix: string
}) {
  const { t, i18n } = useTranslation('customers')
  const toast = useToast()
  const [kind, setKind] = useState('id_front')
  const [uploads, setUploads] = useState<Upload[]>([])

  const start = (files: File[]) => {
    for (const file of files) {
      const id = `${file.name}-${Math.random()}`
      const bad = precheck(file)
      setUploads((u) => [
        ...u,
        { id, name: file.name, progress: 0, ...(bad ? { error: t(`common:${bad}`) } : {}) },
      ])
      if (bad) continue
      uploadFile<DocumentDTO>(`/customers/${customerRef}/documents`, file, { kind }, (p) =>
        setUploads((u) => u.map((x) => (x.id === id ? { ...x, progress: p } : x))),
      )
        .then(() => {
          setUploads((u) => u.filter((x) => x.id !== id))
          onChanged()
        })
        .catch((err: unknown) => {
          // Known upload problems get translated text; anything else shows the server's message.
          const message =
            err instanceof ApiError && err.status === 413
              ? t('common:upload.tooLarge')
              : err instanceof ApiError && err.problem.errors?.[0]?.path === 'file'
                ? t('common:upload.badType')
                : err instanceof ApiError
                  ? err.message
                  : t('common:error.generic')
          setUploads((u) => u.map((x) => (x.id === id ? { ...x, error: message } : x)))
        })
    }
  }

  const remove = async (doc: DocumentDTO) => {
    try {
      await api(`/customers/${customerRef}/documents/${doc.id}`, { method: 'DELETE' })
      onChanged()
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('common:error.generic'), 'error')
    }
  }

  return (
    <div className="f span-all" data-testid={`${idPrefix}-documents`}>
      {canUpload ? (
        <div className="grid" style={{ gridTemplateColumns: '220px minmax(0,1fr)', alignItems: 'end' }}>
          <div className="f">
            <label htmlFor={`${idPrefix}-doc-kind`}>{t('docs.kind')}</label>
            <select
              id={`${idPrefix}-doc-kind`}
              data-testid={`${idPrefix}-doc-kind`}
              className="in"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {['id_front', 'id_back', 'photo', 'address_proof', 'other'].map((k) => (
                <option key={k} value={k}>
                  {t(`docs.kinds.${k}`)}
                </option>
              ))}
            </select>
          </div>
          <FileDropzone
            id={`${idPrefix}-doc-file`}
            multiple
            title={t('docs.drop')}
            hint={t('docs.hint')}
            onFiles={start}
          />
        </div>
      ) : null}
      <div className="files" style={{ marginTop: 10 }} data-testid={`${idPrefix}-doc-list`}>
        {documents.map((d) => (
          <div className="file" key={d.id} data-testid={`${idPrefix}-doc`} data-doc-id={d.id}>
            {d.mime.startsWith('image/') ? (
              <img
                className="thumb"
                loading="lazy"
                alt=""
                src={`/api/v1/customers/${customerRef}/documents/${d.id}/content?inline=1`}
              />
            ) : (
              <span className="thumb">PDF</span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <a
                href={`/api/v1/customers/${customerRef}/documents/${d.id}/content`}
                data-testid={`${idPrefix}-doc-download`}
              >
                {d.fileName}
              </a>
              <div className="meta">
                {t(`docs.kinds.${d.kind}`)} · {Math.round(d.size / 1024)} KB ·{' '}
                {formatDate(d.uploadedAt, i18n.language)}
              </div>
            </div>
            <span className="pill ok">{t('docs.uploaded')}</span>
            {canDelete ? (
              <button
                type="button"
                className="btn icon ghost sm"
                aria-label={t('docs.remove', { name: d.fileName })}
                data-testid={`${idPrefix}-doc-remove`}
                onClick={() => void remove(d)}
              >
                <Icon name="trash" />
              </button>
            ) : null}
          </div>
        ))}
        {uploads.map((u) => (
          <div
            className={`file ${u.error ? 'bad' : ''}`}
            key={u.id}
            data-testid={`${idPrefix}-upload`}
            data-state={u.error ? 'error' : 'uploading'}
          >
            <span className="thumb">…</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {u.name}
              {u.error ? (
                <div className="meta bad" role="alert" data-testid={`${idPrefix}-upload-error`}>
                  {u.error}
                </div>
              ) : (
                <div
                  className="bar"
                  role="progressbar"
                  aria-valuenow={u.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <b style={{ width: `${u.progress}%` }} />
                </div>
              )}
            </div>
            {u.error ? (
              <button
                type="button"
                className="btn icon ghost sm"
                aria-label={t('common:dismiss')}
                onClick={() => setUploads((all) => all.filter((x) => x.id !== u.id))}
              >
                ✕
              </button>
            ) : (
              <span className="help num">{u.progress}%</span>
            )}
          </div>
        ))}
        {documents.length === 0 && uploads.length === 0 ? (
          <span className="help" data-testid={`${idPrefix}-doc-empty`}>
            {t('docs.none')}
          </span>
        ) : null}
      </div>
    </div>
  )
}
