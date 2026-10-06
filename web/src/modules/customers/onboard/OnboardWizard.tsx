/**
 * Onboard customer wizard (/customers/new?draft=D-2026-00012&step=2).
 *
 * Step 1 creates a draft (POST); later saves update it (PATCH with the version, so two people
 * editing the same draft get a conflict instead of overwriting each other). The draft number
 * and step live in the URL, so a draft can be resumed from anywhere. Submit validates all
 * steps on the server, assigns a CIF and sends the customer for supervisor approval.
 */
import { useCallback, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { CustomerDraftForm } from '@csm/shared'
import { ApiError, api, newIdempotencyKey } from '../../../api/client.ts'
import { useCrumb } from '../../../app/AppShell.tsx'
import { Icon } from '../../../components/Icon.tsx'
import { ConfirmDialog } from '../../../components/Overlay.tsx'
import { useToast } from '../../../components/Toast.tsx'
import { Loading, Stepper } from '../../../components/Widgets.tsx'
import { formatTime } from '../../../lib/format.ts'
import { ContactStep } from './ContactStep.tsx'
import { KycStep } from './KycStep.tsx'
import { PersonalStep } from './PersonalStep.tsx'
import { ReviewStep } from './ReviewStep.tsx'
import type { Section } from './shared.tsx'

/** /customers/new */
export default function OnboardWizard() {
  const { t, i18n } = useTranslation('customers')
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const draftRef = params.get('draft')
  const step = Math.min(4, Math.max(1, Number(params.get('step')) || 1))
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [savingDraft, setSavingDraft] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [done, setDone] = useState<{ cif: string } | null>(null)
  const saveDraftFn = useRef<(() => Promise<void>) | null>(null)
  const submitKey = useRef(newIdempotencyKey())
  const createKey = useRef(newIdempotencyKey())

  useCrumb([t('nav.customers'), t('onboard.title')])

  const draftQuery = useQuery({
    queryKey: ['draft', draftRef],
    queryFn: () => api<CustomerDraftForm>(`/customers/${draftRef}/form`),
    enabled: !!draftRef,
    staleTime: Infinity,
  })
  const draft = draftRef ? (draftQuery.data ?? null) : null

  const goTo = useCallback(
    (n: number, ref = draftRef) => {
      const next = new URLSearchParams()
      if (ref) next.set('draft', ref)
      next.set('step', String(n))
      setParams(next)
      window.scrollTo({ top: 0 })
    },
    [draftRef, setParams],
  )

  const save = useCallback(
    async (section: Section, data: Record<string, unknown>, mode: 'next' | 'draft') => {
      try {
        let updated: CustomerDraftForm
        if (!draft) {
          updated = await api<CustomerDraftForm>('/customers', {
            method: 'POST',
            body: { personal: data },
            idempotencyKey: createKey.current,
          })
          createKey.current = newIdempotencyKey()
        } else {
          updated = await api<CustomerDraftForm>(`/customers/${draft.ref}/draft`, {
            method: 'PATCH',
            body: { version: draft.version, [section]: data },
          })
        }
        qc.setQueryData(['draft', updated.ref], updated)
        setSavedAt(new Date())
        if (mode === 'next') goTo(step + 1, updated.ref)
        else if (!draft) goTo(step, updated.ref)
      } catch (err) {
        if (err instanceof ApiError && err.code === 'stale_version') {
          toast(t('onboard.stale'), 'error')
          void draftQuery.refetch()
        } else if (err instanceof ApiError && !err.problem.errors) {
          toast(err.message, 'error')
        }
        throw err
      }
    },
    [draft, draftQuery, goTo, qc, step, t, toast],
  )

  const bindSaveDraft = useCallback((fn: () => Promise<void>) => {
    saveDraftFn.current = fn
  }, [])

  const saveDraft = async () => {
    if (!saveDraftFn.current) return
    setSavingDraft(true)
    try {
      await saveDraftFn.current()
      toast(t('onboard.draftSaved'))
    } catch {
      // Field errors are shown on the form.
    } finally {
      setSavingDraft(false)
    }
  }

  const submit = async (declarations: { idVerified: true; termsAccepted: true }) => {
    const result = await api<{ cif: string }>(`/customers/${draft!.ref}/submit`, {
      method: 'POST',
      body: { version: draft!.version, declarations },
      idempotencyKey: submitKey.current,
    })
    toast(t('onboard.submitted', { cif: result.cif }))
    void qc.invalidateQueries({ queryKey: ['customers'] })
    void qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
    setDone(result)
  }

  if (draftRef && draftQuery.isLoading) return <Loading testId="onb-loading" />
  if (draftRef && draftQuery.isError) {
    return (
      <div className="note bad" role="alert" data-testid="onb-load-error">
        {draftQuery.error instanceof ApiError ? draftQuery.error.message : t('common:error.generic')}
      </div>
    )
  }
  if (draft && draft.status !== 'draft' && !done) {
    return (
      <div className="note info" role="status" data-testid="onb-already-submitted">
        <Icon name="info" />
        <span>
          {t('onboard.alreadySubmitted', { cif: draft.cif })}{' '}
          <Link to={`/customers/${draft.cif}`}>{t('onboard.viewCustomer')}</Link>
        </span>
      </div>
    )
  }

  if (done) {
    return (
      <section className="panel" data-testid="onb-success">
        <div
          className="body"
          style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}
        >
          <span className="pill ok">{t('onboard.success.badge')}</span>
          <h1 style={{ margin: 0, fontSize: 21 }}>
            {t('onboard.success.title')}{' '}
            <span className="mono" data-testid="onb-success-cif">
              {done.cif}
            </span>
          </h1>
          <p style={{ margin: 0, color: 'var(--muted)' }}>{t('onboard.success.message')}</p>
          <div className="actions">
            <Link to={`/customers/${done.cif}`} className="btn pri" data-testid="onb-success-view">
              {t('onboard.viewCustomer')}
            </Link>
            <button
              type="button"
              className="btn"
              data-testid="onb-success-another"
              onClick={() => {
                setDone(null)
                setSavedAt(null)
                setParams(new URLSearchParams())
              }}
            >
              {t('onboard.success.another')}
            </button>
          </div>
        </div>
      </section>
    )
  }

  const steps = (['personal', 'contact', 'kyc', 'review'] as const).map((s) => ({
    title: t(`onboard.steps.${s}`),
    hint: t(`onboard.hints.${s}`),
  }))
  const stepProps = { draft, save, bindSaveDraft, back: () => goTo(step - 1) }

  return (
    <>
      <div className="ph">
        <div>
          <h1>{t('onboard.title')}</h1>
          <p data-testid="onb-draft-no">
            {draft ? (
              <>
                {[draft.personal.firstName, draft.personal.lastName].filter(Boolean).join(' ')} ·{' '}
                {t('onboard.draft')} <span className="mono">{draft.draftNo}</span>
              </>
            ) : (
              t('onboard.subtitle')
            )}
          </p>
        </div>
        <div className="grow" />
        {savedAt ? (
          <span className="saved" data-testid="onb-saved-at">
            <Icon name="check" />
            {t('onboard.savedAt', { time: formatTime(savedAt, i18n.language) })}
          </span>
        ) : null}
        {step < 4 ? (
          <button
            type="button"
            className="btn"
            data-testid="onb-save-draft"
            disabled={savingDraft}
            onClick={() => void saveDraft()}
          >
            {savingDraft ? <span className="spin" /> : null}
            {t('onboard.saveDraft')}
          </button>
        ) : null}
        <button type="button" className="btn ghost" data-testid="onb-cancel" onClick={() => setLeaving(true)}>
          {t('common:cancel')}
        </button>
      </div>
      <Stepper testId="onb-stepper" steps={steps} current={step - 1} />
      {step === 1 ? <PersonalStep key={`p-${draft?.version}`} {...stepProps} /> : null}
      {step === 2 ? <ContactStep key={`c-${draft?.ref}`} {...stepProps} /> : null}
      {step === 3 ? (
        <KycStep
          key={`k-${draft?.ref}`}
          {...stepProps}
          onDocumentsChanged={() => void draftQuery.refetch()}
        />
      ) : null}
      {step === 4 && draft ? (
        <ReviewStep draft={draft} onEdit={(n) => goTo(n)} onSubmit={submit} back={() => goTo(3)} />
      ) : null}
      {step > 1 && !draft ? (
        <div className="note warn" role="alert" data-testid="onb-no-draft">
          {t('onboard.noDraft')}
        </div>
      ) : null}
      {leaving ? (
        <ConfirmDialog
          testId="onb-leave"
          title={t('onboard.leave.title')}
          message={
            draft ? t('onboard.leave.withDraft', { draftNo: draft.draftNo }) : t('onboard.leave.noDraft')
          }
          confirmLabel={t('onboard.leave.confirm')}
          danger
          onCancel={() => setLeaving(false)}
          onConfirm={() => navigate('/customers')}
        />
      ) : null}
    </>
  )
}
