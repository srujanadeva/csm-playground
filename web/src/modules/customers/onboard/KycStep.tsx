/**
 * Step 3 — KYC & documents: read the ID card (OCR), ID type and masked number (show/hide),
 * issue/expiry dates (expiry only for IDs that expire), document uploads with progress, the
 * customer's photo (camera or upload), e-KYC in a cross-origin frame, PEP question that reveals
 * extra fields, FATCA, and the calculated risk rating.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import type { z } from 'zod'
import {
  ID_TYPES,
  calculateRisk,
  kycDraftSchema,
  kycSchema,
  type OcrFieldKey,
  type OcrResultDTO,
} from '@csm/shared'
import { ApiError } from '../../../api/client.ts'
import { LocatorBadge } from '../../../components/LocatorBadge.tsx'
import { CameraCapture } from '../../../components/media/CameraCapture.tsx'
import { useToast } from '../../../components/Toast.tsx'
import { Field, FieldGroup, MaskedInput, controlProps } from '../../../components/Field.tsx'
import { Icon } from '../../../components/Icon.tsx'
import { StatusPill } from '../../../components/Badges.tsx'
import { useLookups } from '../../../hooks/useLookups.ts'
import { label } from '../../../lib/format.ts'
import { uploadCapture } from './api.ts'
import { EkycPanel } from './EkycPanel.tsx'
import { EMPTY_OCR, OCR_ON_THIS_STEP, OcrPanel, unconfirmed, type OcrState } from './OcrPanel.tsx'
import {
  DocumentsPanel,
  applyServerErrors,
  cleanEmpty,
  useReportChanges,
  type ExtraSections,
  type StepProps,
} from './shared.tsx'
import './onboard.css'

type Form = z.input<typeof kycSchema>
type OcrTarget = 'idNumber' | 'expiryDate'

/** "Layla Mira Haddad" → first, middle, last. */
function splitName(full: string) {
  const parts = full.trim().split(/\s+/)
  return {
    firstName: parts[0] ?? '',
    middleName: parts.length > 2 ? parts.slice(1, -1).join(' ') : undefined,
    lastName: parts.length > 1 ? parts.at(-1)! : '',
  }
}

/** Step 3 of the onboarding wizard. */
export function KycStep({
  draft,
  save,
  bindSaveDraft,
  setDirty,
  back,
  onDocumentsChanged,
}: StepProps & { onDocumentsChanged: () => void }) {
  const { t, i18n } = useTranslation('customers')
  const toast = useToast()
  const [ocr, setOcr] = useState<OcrState>(EMPTY_OCR)
  const [ocrBlocked, setOcrBlocked] = useState(false)
  // The values OCR last put in this step's fields: a field still holding one wasn't edited by hand.
  const ocrApplied = useRef<Partial<Record<OcrTarget, string>>>({})
  const [photoBusy, setPhotoBusy] = useState(false)
  const countries = useLookups('countries')
  const saved = (draft?.kyc ?? {}) as Partial<Form>
  const {
    register,
    handleSubmit,
    control,
    watch,
    getValues,
    setError,
    clearErrors,
    unregister,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(kycSchema),
    defaultValues: {
      idType: '' as never,
      idNumber: '',
      issueDate: '',
      expiryDate: '',
      pep: false,
      fatcaUsPerson: false,
      ...saved,
      ...(saved.pepDetails ? { pepDetails: saved.pepDetails } : {}),
    },
  })
  useReportChanges(watch, setDirty)
  const idType = watch('idType')
  const pep = watch('pep')
  const fatca = watch('fatcaUsPerson')
  const expires = idType === 'passport' || idType === 'driving_licence'

  useEffect(() => {
    if (!pep) unregister('pepDetails')
  }, [pep, unregister])

  useEffect(() => {
    bindSaveDraft(async () => {
      clearErrors()
      const values = cleanEmpty(getValues())
      const parsed = kycDraftSchema.safeParse(values)
      if (!parsed.success) {
        parsed.error.issues.forEach((i) => setError(i.path.join('.') as keyof Form, { message: i.message }))
        throw new Error('invalid')
      }
      try {
        await save('kyc', parsed.data, 'draft')
      } catch (err) {
        applyServerErrors(err, 'kyc', setError)
        throw err
      }
    })
  }, [bindSaveDraft, getValues, save, setError, clearErrors])

  /** Fills this step's fields from a new reading, keeping any the CSR typed over (FR-KYC-001). */
  const onOcrRead = (result: OcrResultDTO) => {
    for (const f of result.fields) {
      if (!OCR_ON_THIS_STEP.includes(f.key)) continue
      const key = f.key as OcrTarget
      const current = getValues(key) ?? ''
      if (current && current !== ocrApplied.current[key]) continue
      setValue(key, f.value)
      ocrApplied.current[key] = f.value
    }
    setOcrBlocked(false)
    setDirty(true)
  }

  /** Earlier-step values the CSR chose to take from the card, saved with this step. */
  const cardOverrides = (): ExtraSections => {
    const card = (k: OcrFieldKey) => ocr.result?.fields.find((f) => f.key === k)?.value ?? ''
    const extra: ExtraSections = {}
    if (draft && (ocr.useCard.includes('fullName') || ocr.useCard.includes('dateOfBirth'))) {
      extra.personal = {
        ...draft.personal,
        ...(ocr.useCard.includes('fullName') ? splitName(card('fullName')) : {}),
        ...(ocr.useCard.includes('dateOfBirth') ? { dob: card('dateOfBirth') } : {}),
      }
    }
    if (draft && ocr.useCard.includes('city')) {
      const contact = draft.contact as { permanent?: Record<string, unknown> }
      extra.contact = { ...draft.contact, permanent: { ...contact.permanent, city: card('city') } }
    }
    return extra
  }

  const onNext = handleSubmit(async (values) => {
    if (unconfirmed(ocr).length) {
      setOcrBlocked(true)
      return
    }
    try {
      await save('kyc', values as unknown as Record<string, unknown>, 'next', cardOverrides())
    } catch (err) {
      applyServerErrors(err, 'kyc', setError)
    }
  })

  const onPhoto = async (photo: Blob | null) => {
    if (!photo || !draft) return
    setPhotoBusy(true)
    try {
      await uploadCapture(draft.ref, 'photo', photo)
      onDocumentsChanged()
      toast(t('onboard.photo.saved'))
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('common:error.generic'), 'error')
    } finally {
      setPhotoBusy(false)
    }
  }
  const onEkycVerified = useCallback(() => onDocumentsChanged(), [onDocumentsChanged])

  const dp = (draft?.personal ?? {}) as {
    firstName?: string
    middleName?: string
    lastName?: string
    dob?: string
  }
  const entered: Partial<Record<OcrFieldKey, string>> = {
    fullName: [dp.firstName, dp.middleName, dp.lastName].filter(Boolean).join(' '),
    dateOfBirth: dp.dob,
    city: (draft?.contact as { permanent?: { city?: string } } | undefined)?.permanent?.city,
  }
  const hasPhoto = !!draft?.documents.some((d) => d.kind === 'photo')

  const personal = (draft?.personal ?? {}) as { nationality?: string; monthlyIncome?: number }
  const risk = calculateRisk({
    pep,
    fatcaUsPerson: fatca,
    nationality: personal.nationality,
    monthlyIncome: personal.monthlyIncome,
  })
  const e = errors
  const id = (f: string) => `onb-kyc-${f}`

  return (
    <form onSubmit={onNext} noValidate data-testid="onb-kyc-form">
      <OcrPanel
        state={ocr}
        onChange={(next) => {
          setOcr(next)
          setOcrBlocked(false)
        }}
        onRead={onOcrRead}
        entered={entered}
        blocked={ocrBlocked}
      />

      <section className="panel" style={{ marginTop: 16 }}>
        <header>
          <h2>{t('onboard.kyc.identity')}</h2>
        </header>
        <div className="body grid g4">
          <Field id={id('id-type')} label={t('fields.idType')} required error={e.idType?.message}>
            <select
              {...register('idType')}
              {...controlProps(id('id-type'), e.idType?.message)}
              className="in"
            >
              <option value="">{t('common:select')}</option>
              {ID_TYPES.map((v) => (
                <option key={v} value={v}>
                  {t(`values.idType.${v}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id={id('id-number')}
            label={t('fields.idNumber')}
            required
            error={e.idNumber?.message}
            help={idType ? t(`onboard.kyc.idFormat.${idType}`) : t('onboard.kyc.idHidden')}
          >
            <MaskedInput
              {...register('idNumber')}
              id={id('id-number')}
              error={e.idNumber?.message}
              className="mono"
            />
          </Field>
          <Field id={id('issue-date')} label={t('fields.issueDate')} required error={e.issueDate?.message}>
            <input
              type="date"
              {...register('issueDate')}
              {...controlProps(id('issue-date'), e.issueDate?.message)}
              className="in"
            />
          </Field>
          {expires ? (
            <Field
              id={id('expiry-date')}
              label={t('fields.expiryDate')}
              required
              error={e.expiryDate?.message}
            >
              <input
                type="date"
                {...register('expiryDate')}
                {...controlProps(id('expiry-date'), e.expiryDate?.message)}
                className="in"
              />
            </Field>
          ) : (
            <div className="f">
              <span className="lbl">{t('fields.expiryDate')}</span>
              <span className="help" data-testid={id('expiry-na')} style={{ paddingTop: 8 }}>
                {idType ? t('onboard.kyc.noExpiry') : '—'}
              </span>
            </div>
          )}
          {draft ? (
            <DocumentsPanel
              customerRef={draft.ref}
              documents={draft.documents}
              canUpload
              canDelete
              onChanged={onDocumentsChanged}
              idPrefix="onb-kyc"
            />
          ) : null}
        </div>
      </section>

      {draft ? (
        <div className="kyc-capture">
          <section className="panel" data-has-photo={hasPhoto}>
            <header>
              <h2>{t('onboard.photo.title')}</h2>
              <LocatorBadge style="TTL" />
              {photoBusy ? <span className="spin" /> : null}
            </header>
            <div className="body">
              <CameraCapture label={t('onboard.photo.label')} onChange={(b) => void onPhoto(b)} iconOnly />
              <p className="help">{hasPhoto ? t('onboard.photo.onFile') : t('onboard.photo.hint')}</p>
            </div>
          </section>
          <EkycPanel draft={draft} onVerified={onEkycVerified} />
        </div>
      ) : null}

      <section className="panel" style={{ marginTop: 16 }}>
        <header>
          <h2>{t('onboard.kyc.dueDiligence')}</h2>
          <span className="hint">{t('onboard.kyc.riskHint')}</span>
        </header>
        <div className="body grid g4">
          <Controller
            control={control}
            name="pep"
            render={({ field }) => (
              <FieldGroup id={id('pep')} label={t('fields.pep')} required className="span2">
                {[false, true].map((v) => (
                  <label className="choice" key={String(v)}>
                    <input
                      type="radio"
                      name={field.name}
                      checked={field.value === v}
                      onChange={() => field.onChange(v)}
                      data-testid={`${id('pep')}-${v ? 'yes' : 'no'}`}
                    />
                    <span>{t(v ? 'common:yes' : 'common:no')}</span>
                  </label>
                ))}
              </FieldGroup>
            )}
          />
          <div className="f">
            <span className="lbl">{t('fields.riskRating')}</span>
            <div
              className="in"
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              aria-readonly
              data-testid={id('risk')}
              data-risk={risk}
            >
              <StatusPill value={risk} />
              <span className="help">{t('onboard.kyc.calculated')}</span>
            </div>
          </div>
          <FieldGroup id={id('fatca')} label={t('fields.fatca')}>
            <label className="choice">
              <input type="checkbox" {...register('fatcaUsPerson')} data-testid={id('fatca-us')} />
              <span>{t('onboard.kyc.usTaxResident')}</span>
            </label>
          </FieldGroup>
          {pep ? (
            <div className="span-all reveal grid g3" data-testid={id('pep-block')}>
              <Field
                id={id('pep-position')}
                label={t('fields.pepPosition')}
                required
                error={e.pepDetails?.position?.message}
              >
                <input
                  {...register('pepDetails.position')}
                  {...controlProps(id('pep-position'), e.pepDetails?.position?.message)}
                  className="in"
                />
              </Field>
              <Field
                id={id('pep-country')}
                label={t('fields.pepCountry')}
                required
                error={e.pepDetails?.country?.message}
              >
                <select
                  {...register('pepDetails.country')}
                  {...controlProps(id('pep-country'), e.pepDetails?.country?.message)}
                  className="in"
                  defaultValue="IN"
                >
                  {(countries.data ?? []).map((o) => (
                    <option key={o.code} value={o.code}>
                      {label(o.labels, i18n.language)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                id={id('pep-since')}
                label={t('fields.pepSince')}
                required
                error={e.pepDetails?.since?.message}
              >
                <input
                  type="number"
                  {...register('pepDetails.since')}
                  {...controlProps(id('pep-since'), e.pepDetails?.since?.message)}
                  className="in num"
                  min={1950}
                  max={new Date().getFullYear()}
                />
              </Field>
              <Field
                id={id('pep-wealth')}
                label={t('fields.sourceOfWealth')}
                required
                error={e.pepDetails?.sourceOfWealth?.message}
                className="span3"
              >
                <textarea
                  {...register('pepDetails.sourceOfWealth')}
                  {...controlProps(id('pep-wealth'), e.pepDetails?.sourceOfWealth?.message)}
                  className="in"
                  maxLength={500}
                />
              </Field>
            </div>
          ) : null}
        </div>
      </section>

      <div className="actions" style={{ marginTop: 16 }}>
        <span className="help">{t('onboard.stepOf', { n: 3, total: 4 })}</span>
        <div className="grow" />
        <button type="button" className="btn" onClick={back} data-testid="onb-back">
          <Icon name="back" />
          {t('common:back')}
        </button>
        <button type="submit" className="btn pri" disabled={isSubmitting} data-testid="onb-next">
          {isSubmitting ? <span className="spin" /> : null}
          {t('onboard.nextTo', { step: t('onboard.steps.review') })}
          <Icon name="next" />
        </button>
      </div>
    </form>
  )
}
