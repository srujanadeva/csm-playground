/**
 * Step 2 — Contact & address: mobile (+91, formatted as typed: 98450 12345), alternate mobile,
 * email, communication preferences (checkboxes), permanent address, a "mailing same as permanent"
 * checkbox that reveals a second address block when unticked, and nominees (saved as their own
 * section in the same request).
 */
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import type { z } from 'zod'
import { COMM_PREFS, contactBase, contactDraftSchema, nomineesDraftSchema, nomineesSchema } from '@csm/shared'
import { Field, FieldGroup, controlProps } from '../../../components/Field.tsx'
import { Icon } from '../../../components/Icon.tsx'
import { LocatorBadge } from '../../../components/LocatorBadge.tsx'
import { MaskedTextInput } from '../../../components/inputs/MaskedTextInput.tsx'
import { AddressFields } from './AddressFields.tsx'
import { NomineeFields } from './NomineeFields.tsx'
import { applyServerErrors, cleanEmpty, useReportChanges, type StepProps } from './shared.tsx'
import './onboard.css'

// Contact and nominees validate together on Next; the mailing rule is contactSchema's, repeated here.
const stepSchema = contactBase
  .extend({ nominee: nomineesSchema })
  .refine((d) => d.mailingSameAsPermanent || !!d.mailing, { error: 'required', path: ['mailing', 'line1'] })

export type ContactForm = z.input<typeof stepSchema>
type Form = ContactForm

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
export function ContactStep({ draft, save, bindSaveDraft, setDirty, back }: StepProps) {
  const { t } = useTranslation('customers')
  const saved = (draft?.contact ?? {}) as Partial<Form>
  const {
    register,
    handleSubmit,
    control,
    watch,
    getValues,
    setError,
    clearErrors,
    unregister,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(stepSchema),
    defaultValues: {
      mobile: '',
      altMobile: '',
      email: '',
      commPrefs: ['sms'],
      mailingSameAsPermanent: true,
      ...saved,
      permanent: { ...EMPTY_ADDRESS, ...saved.permanent },
      ...(saved.mailing ? { mailing: { ...EMPTY_ADDRESS, ...saved.mailing } } : {}),
      nominee: (draft?.nominees as Form['nominee'] | undefined) ?? { addNominee: false, nominees: [] },
    },
  })
  useReportChanges(watch, setDirty)
  const same = watch('mailingSameAsPermanent')

  useEffect(() => {
    if (same) unregister('mailing')
  }, [same, unregister])

  useEffect(() => {
    bindSaveDraft(async () => {
      clearErrors()
      const { nominee, ...contact } = getValues()
      const parsed = contactDraftSchema.safeParse(cleanEmpty(contact))
      const nominees = nomineesDraftSchema.safeParse({
        addNominee: nominee.addNominee,
        // cleanEmpty leaves arrays alone, so blank nominee fields are removed one row at a time.
        nominees: nominee.addNominee ? nominee.nominees.map((n) => cleanEmpty(n)) : [],
      })
      if (!parsed.success || !nominees.success) {
        parsed.error?.issues.forEach((i) => setError(i.path.join('.') as keyof Form, { message: i.message }))
        nominees.error?.issues.forEach((i) =>
          setError(['nominee', ...i.path].join('.') as keyof Form, { message: i.message }),
        )
        throw new Error('invalid')
      }
      try {
        await save('contact', parsed.data, 'draft', { nominees: nominees.data })
      } catch (err) {
        applyServerErrors(err, 'contact', setError)
        throw err
      }
    })
  }, [bindSaveDraft, getValues, save, setError, clearErrors])

  const onNext = handleSubmit(async ({ nominee, ...values }) => {
    try {
      await save('contact', values as unknown as Record<string, unknown>, 'next', {
        nominees: (nominee.addNominee ? nominee : { addNominee: false, nominees: [] }) as Record<
          string,
          unknown
        >,
      })
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
            label={
              <>
                {t('fields.mobile')} <LocatorBadge style="NAME" />
              </>
            }
            required
            error={e.mobile?.message}
            help={t('onboard.contact.mobileHelp')}
          >
            <div className={`affix ${e.mobile ? 'invalid' : ''}`}>
              <span>+91</span>
              <Controller
                control={control}
                name="mobile"
                render={({ field }) => (
                  <MaskedTextInput
                    kind="mobile"
                    value={String(field.value ?? '')}
                    onChange={field.onChange}
                    invalid={!!e.mobile}
                    inputProps={{
                      ...controlProps(id('mobile'), e.mobile?.message),
                      name: 'mobile',
                      onBlur: field.onBlur,
                      className: 'mono',
                    }}
                  />
                )}
              />
            </div>
          </Field>
          <Field id={id('alt-mobile')} label={t('fields.altMobile')} error={e.altMobile?.message}>
            <div className={`affix ${e.altMobile ? 'invalid' : ''}`}>
              <span>+91</span>
              <Controller
                control={control}
                name="altMobile"
                render={({ field }) => (
                  <MaskedTextInput
                    kind="mobile"
                    value={String(field.value ?? '')}
                    onChange={field.onChange}
                    invalid={!!e.altMobile}
                    inputProps={{
                      ...controlProps(id('alt-mobile'), e.altMobile?.message),
                      name: 'altMobile',
                      onBlur: field.onBlur,
                      className: 'mono',
                    }}
                  />
                )}
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

      <section className="panel nominees" style={{ marginTop: 16 }}>
        <header>
          <h2>{t('onboard.nominee.title')}</h2>
          <LocatorBadge style="XP" />
          <span className="hint">{t('onboard.nominee.hint')}</span>
        </header>
        <div className="body">
          <NomineeFields control={control} register={register} watch={watch} errors={errors} />
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
