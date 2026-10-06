/**
 * Step 1 — Personal: customer type and segment (radios), name fields, date of birth, gender,
 * nationality, family, occupation, monthly income (slider + exact amount) and products of
 * interest (toggle tags).
 */
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import type { z } from 'zod'
import {
  CUSTOMER_TYPES,
  GENDERS,
  MARITAL_STATUS,
  SEGMENTS,
  TITLES,
  personalDraftSchema,
  personalSchema,
} from '@csm/shared'
import { Field, FieldGroup, controlProps } from '../../../components/Field.tsx'
import { Icon } from '../../../components/Icon.tsx'
import { useLookups } from '../../../hooks/useLookups.ts'
import { formatInr, label } from '../../../lib/format.ts'
import { applyServerErrors, cleanEmpty, type StepProps } from './shared.tsx'

type Form = z.input<typeof personalSchema>
const SLIDER_MAX = 1_000_000

const DEFAULTS: Form = {
  type: 'individual',
  segment: 'retail',
  title: '' as never,
  firstName: '',
  middleName: '',
  lastName: '',
  fatherOrSpouseName: '',
  dob: '',
  gender: '' as never,
  nationality: 'IN',
  countryOfBirth: 'IN',
  maritalStatus: '' as never,
  dependants: 0,
  occupation: '',
  employer: '',
  monthlyIncome: 25000,
  preferredLanguage: 'en',
  productsOfInterest: ['savings'],
}

/** Step 1 of the onboarding wizard. */
export function PersonalStep({ draft, save, bindSaveDraft }: StepProps) {
  const { t, i18n } = useTranslation('customers')
  const lang = i18n.language
  const countries = useLookups('countries')
  const occupations = useLookups('occupations')
  const titles = useLookups('titles')
  const products = useLookups('products')
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    getValues,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(personalSchema),
    defaultValues: { ...DEFAULTS, ...(draft?.personal as Partial<Form>) },
  })

  useEffect(() => {
    bindSaveDraft(async () => {
      clearErrors()
      const values = cleanEmpty(getValues())
      const parsed = personalDraftSchema.safeParse(values)
      if (!parsed.success) {
        parsed.error.issues.forEach((i) => setError(i.path.join('.') as keyof Form, { message: i.message }))
        throw new Error('invalid')
      }
      try {
        await save('personal', parsed.data, 'draft')
      } catch (err) {
        applyServerErrors(err, 'personal', setError)
        throw err
      }
    })
  }, [bindSaveDraft, getValues, save, setError, clearErrors])

  const onNext = handleSubmit(async (values) => {
    try {
      await save('personal', values as unknown as Record<string, unknown>, 'next')
    } catch (err) {
      applyServerErrors(err, 'personal', setError)
    }
  })

  const income = Number(watch('monthlyIncome')) || 0
  const e = errors
  const id = (f: string) => `onb-personal-${f}`

  return (
    <form onSubmit={onNext} noValidate data-testid="onb-personal-form">
      <section className="panel">
        <header>
          <h2>{t('onboard.personal.profile')}</h2>
          <span className="hint">{t('onboard.requiredHint')}</span>
        </header>
        <div className="body grid g4">
          <FieldGroup
            id={id('type')}
            label={t('fields.customerType')}
            required
            error={e.type?.message}
            className="span2"
          >
            {CUSTOMER_TYPES.map((v) => (
              <label className="choice" key={v}>
                <input type="radio" value={v} {...register('type')} data-testid={`${id('type')}-${v}`} />
                <span>{t(`values.customerType.${v}`)}</span>
              </label>
            ))}
          </FieldGroup>
          <FieldGroup
            id={id('segment')}
            label={t('fields.segment')}
            error={e.segment?.message}
            className="span2"
          >
            {SEGMENTS.map((v) => (
              <label className="choice" key={v}>
                <input
                  type="radio"
                  value={v}
                  {...register('segment')}
                  data-testid={`${id('segment')}-${v}`}
                />
                <span>{t(`values.segment.${v}`)}</span>
              </label>
            ))}
          </FieldGroup>

          <Field id={id('title')} label={t('fields.title')} required error={e.title?.message}>
            <select {...register('title')} {...controlProps(id('title'), e.title?.message)} className="in">
              <option value="">{t('common:select')}</option>
              {(titles.data ?? TITLES.map((c) => ({ code: c, labels: { en: c, kn: c } }))).map((o) => (
                <option key={o.code} value={o.code}>
                  {label(o.labels, lang)}
                </option>
              ))}
            </select>
          </Field>
          <Field id={id('first-name')} label={t('fields.firstName')} required error={e.firstName?.message}>
            <input
              {...register('firstName')}
              {...controlProps(id('first-name'), e.firstName?.message)}
              className="in"
              autoComplete="off"
            />
          </Field>
          <Field id={id('middle-name')} label={t('fields.middleName')} error={e.middleName?.message}>
            <input
              {...register('middleName')}
              {...controlProps(id('middle-name'), e.middleName?.message)}
              className="in"
              autoComplete="off"
            />
          </Field>
          <Field id={id('last-name')} label={t('fields.lastName')} required error={e.lastName?.message}>
            <input
              {...register('lastName')}
              {...controlProps(id('last-name'), e.lastName?.message)}
              className="in"
              autoComplete="off"
            />
          </Field>

          <Field
            id={id('father-spouse')}
            label={t('fields.fatherOrSpouseName')}
            required
            error={e.fatherOrSpouseName?.message}
            className="span2"
          >
            <input
              {...register('fatherOrSpouseName')}
              {...controlProps(id('father-spouse'), e.fatherOrSpouseName?.message)}
              className="in"
              autoComplete="off"
            />
          </Field>
          <Field
            id={id('dob')}
            label={t('fields.dob')}
            required
            error={e.dob?.message}
            help={t('onboard.personal.dobHelp')}
          >
            <input
              type="date"
              {...register('dob')}
              {...controlProps(id('dob'), e.dob?.message)}
              className="in"
              max={new Date().toISOString().slice(0, 10)}
            />
          </Field>
          <FieldGroup id={id('gender')} label={t('fields.gender')} required error={e.gender?.message}>
            {GENDERS.map((v) => (
              <label className="choice" key={v}>
                <input type="radio" value={v} {...register('gender')} data-testid={`${id('gender')}-${v}`} />
                <span>{t(`values.gender.${v}`)}</span>
              </label>
            ))}
          </FieldGroup>

          <Field
            id={id('nationality')}
            label={t('fields.nationality')}
            required
            error={e.nationality?.message}
          >
            <select
              {...register('nationality')}
              {...controlProps(id('nationality'), e.nationality?.message)}
              className="in"
            >
              {(countries.data ?? []).map((o) => (
                <option key={o.code} value={o.code}>
                  {label(o.labels, lang)}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id={id('country-of-birth')}
            label={t('fields.countryOfBirth')}
            required
            error={e.countryOfBirth?.message}
          >
            <select
              {...register('countryOfBirth')}
              {...controlProps(id('country-of-birth'), e.countryOfBirth?.message)}
              className="in"
            >
              {(countries.data ?? []).map((o) => (
                <option key={o.code} value={o.code}>
                  {label(o.labels, lang)}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id={id('marital-status')}
            label={t('fields.maritalStatus')}
            required
            error={e.maritalStatus?.message}
          >
            <select
              {...register('maritalStatus')}
              {...controlProps(id('marital-status'), e.maritalStatus?.message)}
              className="in"
            >
              <option value="">{t('common:select')}</option>
              {MARITAL_STATUS.map((v) => (
                <option key={v} value={v}>
                  {t(`values.maritalStatus.${v}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field id={id('dependants')} label={t('fields.dependants')} error={e.dependants?.message}>
            <select
              {...register('dependants')}
              {...controlProps(id('dependants'), e.dependants?.message)}
              className="in"
            >
              {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <header>
          <h2>{t('onboard.personal.employment')}</h2>
        </header>
        <div className="body grid g4">
          <Field id={id('occupation')} label={t('fields.occupation')} required error={e.occupation?.message}>
            <select
              {...register('occupation')}
              {...controlProps(id('occupation'), e.occupation?.message)}
              className="in"
            >
              <option value="">{t('common:select')}</option>
              {(occupations.data ?? []).map((o) => (
                <option key={o.code} value={o.code}>
                  {label(o.labels, lang)}
                </option>
              ))}
            </select>
          </Field>
          <Field id={id('employer')} label={t('fields.employer')} error={e.employer?.message}>
            <input
              {...register('employer')}
              {...controlProps(id('employer'), e.employer?.message)}
              className="in"
              autoComplete="off"
            />
          </Field>
          <div className="f span2">
            <label htmlFor={id('income')}>{t('fields.monthlyIncome')}</label>
            <div className="range">
              <input
                type="range"
                id={id('income-slider')}
                data-testid={id('income-slider')}
                aria-label={t('fields.monthlyIncome')}
                aria-valuetext={formatInr(income, lang)}
                min={0}
                max={SLIDER_MAX}
                step={5000}
                value={Math.min(income, SLIDER_MAX)}
                onChange={(ev) =>
                  setValue('monthlyIncome', Number(ev.target.value), {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              />
              <input
                type="number"
                {...register('monthlyIncome', { valueAsNumber: true })}
                {...controlProps(id('income'), e.monthlyIncome?.message)}
                className="in num"
                min={0}
                step={1000}
              />
            </div>
            <span
              className={e.monthlyIncome ? 'errmsg' : 'help'}
              id={e.monthlyIncome ? `${id('income')}-error` : undefined}
              data-testid={id('income-display')}
              role={e.monthlyIncome ? 'alert' : undefined}
            >
              {e.monthlyIncome
                ? t(`validation:${e.monthlyIncome.message}`)
                : `${formatInr(income, lang)} ${t('onboard.personal.perMonth')}`}
            </span>
          </div>
          <div className="f span3">
            <span className="lbl" id={id('products-label')}>
              {t('fields.productsOfInterest')}
            </span>
            <Controller
              control={control}
              name="productsOfInterest"
              render={({ field }) => (
                <div
                  className="tags"
                  role="group"
                  aria-labelledby={id('products-label')}
                  data-testid={id('products')}
                >
                  {(products.data ?? []).map((p) => {
                    const on = field.value?.includes(p.code) ?? false
                    return (
                      <button
                        type="button"
                        key={p.code}
                        className="tag"
                        aria-pressed={on}
                        data-tag={p.code}
                        data-testid={`${id('products')}-${p.code}`}
                        onClick={() =>
                          field.onChange(
                            on ? field.value.filter((c) => c !== p.code) : [...(field.value ?? []), p.code],
                          )
                        }
                      >
                        {on ? <Icon name="check" size={13} /> : null}
                        {label(p.labels, lang)}
                      </button>
                    )
                  })}
                </div>
              )}
            />
          </div>
          <Field
            id={id('language')}
            label={t('fields.preferredLanguage')}
            error={e.preferredLanguage?.message}
          >
            <select
              {...register('preferredLanguage')}
              {...controlProps(id('language'), e.preferredLanguage?.message)}
              className="in"
            >
              <option value="en">English</option>
              <option value="kn">ಕನ್ನಡ</option>
            </select>
          </Field>
        </div>
      </section>

      <div className="actions" style={{ marginTop: 16 }}>
        <span className="help">{t('onboard.stepOf', { n: 1, total: 4 })}</span>
        <div className="grow" />
        <button type="button" className="btn" disabled data-testid="onb-back">
          <Icon name="back" />
          {t('common:back')}
        </button>
        <button type="submit" className="btn pri" disabled={isSubmitting} data-testid="onb-next">
          {isSubmitting ? <span className="spin" /> : null}
          {t('onboard.nextTo', { step: t('onboard.steps.contact') })}
          <Icon name="next" />
        </button>
      </div>
    </form>
  )
}
