/**
 * Step 2 — Contact & address: mobile (+91), alternate mobile, email, communication
 * preferences (checkboxes), permanent address, and a "mailing same as permanent" checkbox
 * that reveals a second address block when unticked.
 */
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import type { z } from 'zod'
import { COMM_PREFS, contactDraftSchema, contactSchema } from '@csm/shared'
import { Field, FieldGroup, controlProps } from '../../../components/Field.tsx'
import { Icon } from '../../../components/Icon.tsx'
import { AddressFields } from './AddressFields.tsx'
import { applyServerErrors, cleanEmpty, type StepProps } from './shared.tsx'

type Form = z.input<typeof contactSchema>

const EMPTY_ADDRESS = {
  line1: '',
  line2: '',
  locality: '',
  city: 'Bengaluru',
  state: 'KA',
  pincode: '',
  country: 'IN' as const,
}

/** Step 2 of the onboarding wizard. */
export function ContactStep({ draft, save, bindSaveDraft, back }: StepProps) {
  const { t } = useTranslation('customers')
  const saved = (draft?.contact ?? {}) as Partial<Form>
  const {
    register,
    handleSubmit,
    watch,
    getValues,
    setError,
    clearErrors,
    unregister,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      mobile: '',
      altMobile: '',
      email: '',
      commPrefs: ['sms'],
      mailingSameAsPermanent: true,
      ...saved,
      permanent: { ...EMPTY_ADDRESS, ...saved.permanent },
      ...(saved.mailing ? { mailing: { ...EMPTY_ADDRESS, ...saved.mailing } } : {}),
    },
  })
  const same = watch('mailingSameAsPermanent')

  useEffect(() => {
    if (same) unregister('mailing')
  }, [same, unregister])

  useEffect(() => {
    bindSaveDraft(async () => {
      clearErrors()
      const values = cleanEmpty(getValues())
      const parsed = contactDraftSchema.safeParse(values)
      if (!parsed.success) {
        parsed.error.issues.forEach((i) => setError(i.path.join('.') as keyof Form, { message: i.message }))
        throw new Error('invalid')
      }
      try {
        await save('contact', parsed.data, 'draft')
      } catch (err) {
        applyServerErrors(err, 'contact', setError)
        throw err
      }
    })
  }, [bindSaveDraft, getValues, save, setError, clearErrors])

  const onNext = handleSubmit(async (values) => {
    try {
      await save('contact', values as unknown as Record<string, unknown>, 'next')
    } catch (err) {
      applyServerErrors(err, 'contact', setError)
    }
  })

  const e = errors
  const id = (f: string) => `onb-contact-${f}`
  return (
    <form onSubmit={onNext} noValidate data-testid="onb-contact-form">
      <section className="panel">
        <header>
          <h2>{t('onboard.contact.title')}</h2>
          <span className="hint">{t('onboard.requiredHint')}</span>
        </header>
        <div className="body grid g4">
          <Field
            id={id('mobile')}
            label={t('fields.mobile')}
            required
            error={e.mobile?.message}
            help={t('onboard.contact.mobileHelp')}
          >
            <div className={`affix ${e.mobile ? 'invalid' : ''}`}>
              <span>+91</span>
              <input
                {...register('mobile')}
                {...controlProps(id('mobile'), e.mobile?.message)}
                className="in mono"
                inputMode="numeric"
                maxLength={10}
                autoComplete="off"
              />
            </div>
          </Field>
          <Field id={id('alt-mobile')} label={t('fields.altMobile')} error={e.altMobile?.message}>
            <div className={`affix ${e.altMobile ? 'invalid' : ''}`}>
              <span>+91</span>
              <input
                {...register('altMobile')}
                {...controlProps(id('alt-mobile'), e.altMobile?.message)}
                className="in mono"
                inputMode="numeric"
                maxLength={10}
                autoComplete="off"
              />
            </div>
          </Field>
          <Field
            id={id('email')}
            label={t('fields.email')}
            required
            error={e.email?.message}
            className="span2"
          >
            <input
              type="email"
              {...register('email')}
              {...controlProps(id('email'), e.email?.message)}
              className="in"
              autoComplete="off"
            />
          </Field>
          <FieldGroup
            id={id('comm-prefs')}
            label={t('fields.commPrefs')}
            required
            error={e.commPrefs?.message}
            className="span-all"
          >
            {COMM_PREFS.map((p) => (
              <label className="choice" key={p}>
                <input
                  type="checkbox"
                  value={p}
                  {...register('commPrefs')}
                  data-testid={`${id('comm-prefs')}-${p}`}
                />
                <span>{t(`values.commPrefs.${p}`)}</span>
              </label>
            ))}
          </FieldGroup>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <header>
          <h2>{t('onboard.contact.permanent')}</h2>
        </header>
        <div className="body grid g4">
          <AddressFields prefix="permanent" register={register} errors={errors} />
          <label className="choice span-all">
            <input
              type="checkbox"
              {...register('mailingSameAsPermanent')}
              id={id('mailing-same')}
              data-testid={id('mailing-same')}
            />
            <span>{t('onboard.contact.mailingSame')}</span>
          </label>
          {!same ? (
            <div className="span-all reveal grid g4" data-testid={id('mailing-block')}>
              <h3 className="span-all" style={{ margin: 0, fontSize: 13 }}>
                {t('onboard.contact.mailing')}
              </h3>
              <AddressFields prefix="mailing" register={register} errors={errors} />
            </div>
          ) : null}
        </div>
      </section>

      <div className="actions" style={{ marginTop: 16 }}>
        <span className="help">{t('onboard.stepOf', { n: 2, total: 4 })}</span>
        <div className="grow" />
        <button type="button" className="btn" onClick={back} data-testid="onb-back">
          <Icon name="back" />
          {t('common:back')}
        </button>
        <button type="submit" className="btn pri" disabled={isSubmitting} data-testid="onb-next">
          {isSubmitting ? <span className="spin" /> : null}
          {t('onboard.nextTo', { step: t('onboard.steps.kyc') })}
          <Icon name="next" />
        </button>
      </div>
    </form>
  )
}
