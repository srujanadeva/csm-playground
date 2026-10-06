/**
 * Step 4 — Review & submit: read-only summary of every step with Edit links, the two
 * declarations, and Submit (with a confirmation dialog). Server-side validation problems are
 * listed with links back to the step that needs fixing.
 */
import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { declarationsSchema, type CustomerDraftForm } from '@csm/shared'
import type { z } from 'zod'
import { ApiError } from '../../../api/client.ts'
import { useErrorText } from '../../../components/Field.tsx'
import { Icon } from '../../../components/Icon.tsx'
import { ConfirmDialog } from '../../../components/Overlay.tsx'
import { StatusPill } from '../../../components/Badges.tsx'
import { useLookupLabel } from '../../../hooks/useLookups.ts'
import { formatDate, formatInr } from '../../../lib/format.ts'

type Declarations = z.input<typeof declarationsSchema>

function Section({
  title,
  step,
  onEdit,
  children,
  testId,
}: {
  title: string
  step: number
  onEdit: (s: number) => void
  children: ReactNode
  testId: string
}) {
  const { t } = useTranslation('customers')
  return (
    <section className="panel" data-testid={testId}>
      <header>
        <h2>{title}</h2>
        <div className="grow" />
        <button
          type="button"
          className="btn ghost sm"
          data-testid={`${testId}-edit`}
          onClick={() => onEdit(step)}
        >
          <Icon name="edit" />
          {t('common:edit')}
        </button>
      </header>
      <div className="body">
        <dl className="kv">{children}</dl>
      </div>
    </section>
  )
}

function Item({ label, value, testId }: { label: string; value: ReactNode; testId: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd data-testid={testId}>{value ?? '—'}</dd>
    </div>
  )
}

/** Step 4 of the onboarding wizard. */
export function ReviewStep({
  draft,
  onEdit,
  onSubmit,
  back,
}: {
  draft: CustomerDraftForm
  onEdit: (step: number) => void
  onSubmit: (declarations: Declarations) => Promise<void>
  back: () => void
}) {
  const { t, i18n } = useTranslation('customers')
  const lang = i18n.language
  const errorText = useErrorText()
  const country = useLookupLabel('countries')
  const occupation = useLookupLabel('occupations')
  const product = useLookupLabel('products')
  const state = useLookupLabel('states')
  const [confirming, setConfirming] = useState<Declarations | null>(null)
  const [busy, setBusy] = useState(false)
  const [serverErrors, setServerErrors] = useState<{ path: string; code?: string; message: string }[]>([])
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Declarations>({ resolver: zodResolver(declarationsSchema) })

  const p = draft.personal as Record<string, string | number | string[] | undefined>
  const c = draft.contact as Record<string, unknown> & {
    permanent?: Record<string, string>
    mailing?: Record<string, string>
  }
  const k = draft.kyc as Record<string, unknown> & { pepDetails?: Record<string, string> }
  const address = (a?: Record<string, string>) =>
    a ? [a.line1, a.line2, a.locality, a.city, state(a.state), a.pincode].filter(Boolean).join(', ') : '—'
  const stepOf = (path: string) => (path.startsWith('personal') ? 1 : path.startsWith('contact') ? 2 : 3)

  const submit = async () => {
    if (!confirming) return
    setBusy(true)
    try {
      await onSubmit(confirming)
    } catch (err) {
      if (err instanceof ApiError && err.problem.errors) setServerErrors(err.problem.errors)
      setConfirming(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit((d) => setConfirming(d))}
      noValidate
      data-testid="onb-review-form"
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      {serverErrors.length ? (
        <div className="note bad" role="alert" data-testid="onb-review-errors">
          <Icon name="warn" />
          <div>
            <b>{t('onboard.review.incomplete')}</b>
            <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
              {serverErrors.map((e) => (
                <li key={e.path}>
                  <button
                    type="button"
                    className="btn ghost sm"
                    style={{ padding: 0, height: 'auto' }}
                    onClick={() => onEdit(stepOf(e.path))}
                  >
                    {t(`fields.${e.path.split('.').pop()}`, { defaultValue: e.path })}
                  </button>
                  : {errorText(e.code ?? e.message)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <Section title={t('onboard.steps.personal')} step={1} onEdit={onEdit} testId="onb-review-personal">
        <Item
          label={t('fields.name')}
          testId="onb-review-name"
          value={[p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ')}
        />
        <Item
          label={t('fields.fatherOrSpouseName')}
          testId="onb-review-father"
          value={p.fatherOrSpouseName as string}
        />
        <Item label={t('fields.dob')} testId="onb-review-dob" value={formatDate(p.dob as string, lang)} />
        <Item
          label={t('fields.gender')}
          testId="onb-review-gender"
          value={p.gender ? t(`values.gender.${p.gender}`) : undefined}
        />
        <Item
          label={t('fields.nationality')}
          testId="onb-review-nationality"
          value={country(p.nationality as string)}
        />
        <Item
          label={t('fields.maritalStatus')}
          testId="onb-review-marital"
          value={p.maritalStatus ? t(`values.maritalStatus.${p.maritalStatus}`) : undefined}
        />
        <Item
          label={t('fields.occupation')}
          testId="onb-review-occupation"
          value={occupation(p.occupation as string)}
        />
        <Item
          label={t('fields.monthlyIncome')}
          testId="onb-review-income"
          value={formatInr(p.monthlyIncome as number, lang)}
        />
        <Item
          label={t('fields.productsOfInterest')}
          testId="onb-review-products"
          value={((p.productsOfInterest as string[]) ?? []).map(product).join(', ')}
        />
      </Section>

      <Section title={t('onboard.steps.contact')} step={2} onEdit={onEdit} testId="onb-review-contact">
        <Item
          label={t('fields.mobile')}
          testId="onb-review-mobile"
          value={c.mobile ? `+91 ${c.mobile as string}` : undefined}
        />
        <Item label={t('fields.email')} testId="onb-review-email" value={c.email as string} />
        <Item
          label={t('fields.commPrefs')}
          testId="onb-review-comm"
          value={((c.commPrefs as string[]) ?? []).map((x) => t(`values.commPrefs.${x}`)).join(', ')}
        />
        <Item
          label={t('onboard.contact.permanent')}
          testId="onb-review-permanent"
          value={address(c.permanent)}
        />
        <Item
          label={t('onboard.contact.mailing')}
          testId="onb-review-mailing"
          value={c.mailingSameAsPermanent ? t('onboard.review.sameAsPermanent') : address(c.mailing)}
        />
      </Section>

      <Section title={t('onboard.steps.kyc')} step={3} onEdit={onEdit} testId="onb-review-kyc">
        <Item
          label={t('fields.idType')}
          testId="onb-review-id-type"
          value={k.idType ? t(`values.idType.${k.idType}`) : undefined}
        />
        <Item
          label={t('fields.idNumber')}
          testId="onb-review-id-number"
          value={k.idNumber ? `••••${String(k.idNumber).slice(-2)}` : undefined}
        />
        <Item
          label={t('fields.expiryDate')}
          testId="onb-review-expiry"
          value={k.expiryDate ? formatDate(k.expiryDate as string, lang) : t('onboard.kyc.noExpiry')}
        />
        <Item label={t('fields.pep')} testId="onb-review-pep" value={t(k.pep ? 'common:yes' : 'common:no')} />
        <Item
          label={t('fields.riskRating')}
          testId="onb-review-risk"
          value={draft.riskRating ? <StatusPill value={draft.riskRating} /> : undefined}
        />
        <Item
          label={t('docs.title')}
          testId="onb-review-documents"
          value={t('docs.count', { count: draft.documents.length })}
        />
      </Section>

      <section className="panel">
        <header>
          <h2>{t('onboard.review.declarations')}</h2>
        </header>
        <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(['idVerified', 'termsAccepted'] as const).map((d) => (
            <div key={d}>
              <label className="choice">
                <input
                  type="checkbox"
                  {...register(d)}
                  id={`onb-review-${d}`}
                  data-testid={`onb-review-${d}`}
                  aria-invalid={errors[d] ? true : undefined}
                  aria-describedby={errors[d] ? `onb-review-${d}-error` : undefined}
                />
                <span>{t(`onboard.review.${d}`)}</span>
              </label>
              {errors[d] ? (
                <div
                  className="errmsg"
                  id={`onb-review-${d}-error`}
                  data-testid={`onb-review-${d}-error`}
                  role="alert"
                >
                  {errorText(errors[d]?.message)}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <div className="actions">
        <span className="help">{t('onboard.stepOf', { n: 4, total: 4 })}</span>
        <div className="grow" />
        <button type="button" className="btn" onClick={back} data-testid="onb-back">
          <Icon name="back" />
          {t('common:back')}
        </button>
        <button type="submit" className="btn pri" data-testid="onb-submit">
          {t('onboard.review.submit')}
        </button>
      </div>

      {confirming ? (
        <ConfirmDialog
          testId="onb-submit-confirm"
          title={t('onboard.review.confirmTitle')}
          message={t('onboard.review.confirmMessage')}
          confirmLabel={t('onboard.review.submit')}
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void submit()}
        />
      ) : null}
    </form>
  )
}
