/**
 * Phase 4 sections of the request panel: tags (chips; the same tag text also appears in the board's
 * tag filter, so tests must scope by the surrounding group), the scheduled callback (fields found by
 * name: callbackAt, windowStart, windowEnd), the customer's rating, and the supervisor's quality score
 * (a half-star slider found by role and name).
 */
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { SR_STANDARD_TAGS, type ServiceRequestDetail } from '@csm/shared'
import { ApiError } from '../../api/client.ts'
import { useCan, useMe } from '../../app/auth.tsx'
import { useErrorText } from '../../components/Field.tsx'
import { LocatorBadge } from '../../components/LocatorBadge.tsx'
import { useToast } from '../../components/Toast.tsx'
import { ChipSelect } from '../../components/selection/ChipSelect.tsx'
import { StarDisplay, StarSlider } from '../../components/selection/StarRating.tsx'
import { formatDateTime, toIso, toLocalInputs } from '../../lib/format.ts'
import { saveCsat, saveQuality, updateRequest, type CsatInput, type RequestPatch } from './api.ts'
import { CsatFields, csatComplete } from './CsatFields.tsx'

/** Saves a change to a request and refreshes everything that shows it. */
function useSave<V>(sr: ServiceRequestDetail, fn: (v: V) => Promise<ServiceRequestDetail>) {
  const { t } = useTranslation('requests')
  const toast = useToast()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (next) => {
      qc.setQueryData(['sr', sr.srNo], next)
      void qc.invalidateQueries({ queryKey: ['board'] })
      void qc.invalidateQueries({ queryKey: ['service-requests'] })
      toast(t('drawer.saved'))
    },
    onError: (err) => {
      if (!(err instanceof ApiError && err.problem.errors)) {
        toast(err instanceof ApiError ? err.message : t('common:error.generic'), 'error')
      }
      if (err instanceof ApiError && err.code === 'stale_version')
        void qc.invalidateQueries({ queryKey: ['sr', sr.srNo] })
    },
  })
}

/** The first server field error for `path`, as a validation code. */
const fieldError = (err: unknown, path: string) =>
  err instanceof ApiError ? err.problem.errors?.find((e) => e.path === path)?.code : undefined

/** Tags as removable chips; standard tags are suggested, others can be typed. */
export function TagsSection({ sr, editable }: { sr: ServiceRequestDetail; editable: boolean }) {
  const { t } = useTranslation('requests')
  const save = useSave(sr, (tags: string[]) => updateRequest(sr.srNo, sr.version, { tags }))
  return (
    <section className="sr-section" aria-label={t('tags.title')}>
      <h3>
        {t('tags.title')} <LocatorBadge style="DUP" />
      </h3>
      {editable ? (
        <ChipSelect
          label={t('tags.title')}
          options={SR_STANDARD_TAGS.map((v) => ({ value: v, label: v }))}
          value={sr.tags}
          allowCreate
          max={10}
          onChange={(tags) => save.mutate(tags)}
        />
      ) : sr.tags.length ? (
        <span className="chips">
          {sr.tags.map((x) => (
            <span key={x} className="chip">
              {x}
            </span>
          ))}
        </span>
      ) : (
        <span className="help">{t('tags.none')}</span>
      )}
    </section>
  )
}

/** Schedule, change or clear the callback (Monday–Saturday, 09:00–18:00 IST, within 30 days). */
export function CallbackSection({ sr, editable }: { sr: ServiceRequestDetail; editable: boolean }) {
  const { t, i18n } = useTranslation('requests')
  const errorText = useErrorText()
  const initial = sr.callbackAt ? toLocalInputs(new Date(sr.callbackAt)) : { date: '', time: '' }
  const [at, setAt] = useState(initial.date ? `${initial.date}T${initial.time}` : '')
  const [start, setStart] = useState(sr.windowStart ?? '')
  const [end, setEnd] = useState(sr.windowEnd ?? '')
  const save = useSave(sr, (p: RequestPatch) => updateRequest(sr.srNo, sr.version, p))
  const [now] = useState(() => Date.now())
  const overdue =
    !!sr.callbackAt && Date.parse(sr.callbackAt) < now && !['resolved', 'closed'].includes(sr.status)

  const submit = (clear: boolean) =>
    save.mutate(
      clear
        ? { callbackAt: null, windowStart: null, windowEnd: null }
        : {
            callbackAt: at ? toIso(at.slice(0, 10), at.slice(11, 16)) : null,
            windowStart: start || null,
            windowEnd: end || null,
          },
    )

  return (
    <section className="sr-section" aria-label={t('callback.title')}>
      <h3>
        {t('callback.title')} <LocatorBadge style="NAME" />
      </h3>
      {sr.callbackAt ? (
        <p className={overdue ? 'errmsg' : 'help'} data-overdue={overdue}>
          {t(overdue ? 'callback.overdue' : 'callback.scheduled', {
            when: formatDateTime(sr.callbackAt, i18n.language),
          })}
          {sr.windowStart ? ` · ${t('callback.window', { start: sr.windowStart, end: sr.windowEnd })}` : ''}
        </p>
      ) : null}
      {editable ? (
        <form
          className="callback-form"
          onSubmit={(e) => {
            e.preventDefault()
            submit(false)
          }}
        >
          <label className="f">
            <span className="lbl">{t('callback.at')}</span>
            <input
              type="datetime-local"
              name="callbackAt"
              className="in"
              value={at}
              onChange={(e) => setAt(e.target.value)}
            />
            {fieldError(save.error, 'callbackAt') ? (
              <span className="errmsg" role="alert">
                {errorText(fieldError(save.error, 'callbackAt'))}
              </span>
            ) : null}
          </label>
          <label className="f">
            <span className="lbl">{t('callback.from')}</span>
            <input
              type="time"
              name="windowStart"
              className="in"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="f">
            <span className="lbl">{t('callback.to')}</span>
            <input
              type="time"
              name="windowEnd"
              className="in"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
            {fieldError(save.error, 'windowEnd') || fieldError(save.error, 'windowStart') ? (
              <span className="errmsg" role="alert">
                {errorText(fieldError(save.error, 'windowEnd') ?? fieldError(save.error, 'windowStart'))}
              </span>
            ) : null}
          </label>
          <div className="actions">
            <button type="submit" className="btn sm pri" disabled={save.isPending}>
              {t('callback.save')}
            </button>
            {sr.callbackAt ? (
              <button
                type="button"
                className="btn sm ghost"
                disabled={save.isPending}
                onClick={() => submit(true)}
              >
                {t('callback.clear')}
              </button>
            ) : null}
          </div>
        </form>
      ) : null}
    </section>
  )
}

/** The customer's rating: shown read-only, or recorded when a resolved request has none. */
export function CsatSection({ sr, editable }: { sr: ServiceRequestDetail; editable: boolean }) {
  const { t } = useTranslation('requests')
  const [value, setValue] = useState<CsatInput>({ declined: false })
  const [error, setError] = useState<string>()
  const save = useSave(sr, (c: CsatInput) => saveCsat(sr.srNo, sr.version, c))
  if (!['resolved', 'closed'].includes(sr.status)) return null
  return (
    <section className="sr-section" aria-label={t('csat.title')}>
      <h3>{t('csat.title')}</h3>
      {sr.csat ? (
        <p>
          {sr.csat.declined ? t('csat.wasDeclined') : <StarDisplay value={sr.csat.rating ?? 0} />}
          {sr.csatComment ? <span className="help"> “{sr.csatComment}”</span> : null}
        </p>
      ) : editable ? (
        <>
          <CsatFields value={value} onChange={setValue} error={error} />
          <button
            type="button"
            className="btn sm pri"
            disabled={save.isPending}
            onClick={() => (csatComplete(value) ? save.mutate(value) : setError('csatRequired'))}
          >
            {t('csat.save')}
          </button>
        </>
      ) : (
        <span className="help">{t('csat.none')}</span>
      )}
    </section>
  )
}

/** Supervisor quality review: 0.5–5 in half stars, a note below 3, once per request, not on their own. */
export function QualitySection({ sr }: { sr: ServiceRequestDetail }) {
  const { t, i18n } = useTranslation('requests')
  const me = useMe()
  const errorText = useErrorText()
  const canApprove = useCan('serviceRequests.board', 'approve')
  const [score, setScore] = useState(3)
  const [note, setNote] = useState('')
  const save = useSave(sr, () => saveQuality(sr.srNo, sr.version, score, note))
  if (!['resolved', 'closed'].includes(sr.status)) return null
  const own = sr.assignedTo === me.user.staffId || sr.createdBy === me.user.staffId
  if (!sr.quality && (!canApprove || own)) return null
  const noteError = fieldError(save.error, 'note')
  return (
    <section className="sr-section" aria-label={t('quality.title')}>
      <h3>
        {t('quality.title')} <LocatorBadge style="ARIA" />
      </h3>
      {sr.quality ? (
        <p>
          <StarDisplay value={sr.quality.score} />{' '}
          <span className="help">
            {t('quality.by', { by: sr.quality.by, at: formatDateTime(sr.quality.at, i18n.language) })}
          </span>
          {sr.quality.note ? <span className="help"> — {sr.quality.note}</span> : null}
        </p>
      ) : (
        <>
          <StarSlider label={t('quality.slider')} value={score} onChange={setScore} />
          <label className="f">
            <span className={`lbl ${score < 3 ? 'req' : ''}`}>{t('quality.note')}</span>
            <textarea className="in" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            {noteError ? (
              <span className="errmsg" role="alert">
                {errorText(noteError)}
              </span>
            ) : null}
          </label>
          <button
            type="button"
            className="btn sm pri"
            disabled={save.isPending}
            onClick={() => save.mutate(undefined)}
          >
            {t('quality.save')}
          </button>
        </>
      )}
    </section>
  )
}
