/** The six address inputs, used for the permanent and the mailing address. */
import { useTranslation } from 'react-i18next'
import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import type { z } from 'zod'
import type { contactSchema } from '@csm/shared'
import { Field, controlProps } from '../../../components/Field.tsx'
import { useLookups } from '../../../hooks/useLookups.ts'
import { label } from '../../../lib/format.ts'

type Form = z.input<typeof contactSchema>

/** Address block for `permanent` or `mailing`. */
export function AddressFields({
  prefix,
  register,
  errors,
}: {
  prefix: 'permanent' | 'mailing'
  register: UseFormRegister<Form>
  errors: FieldErrors<Form>
}) {
  const { t, i18n } = useTranslation('customers')
  const states = useLookups('states')
  const e = errors[prefix]
  const id = (f: string) => `onb-contact-${prefix}-${f}`
  return (
    <>
      <Field id={id('line1')} label={t('fields.line1')} required error={e?.line1?.message} className="span2">
        <input
          {...register(`${prefix}.line1`)}
          {...controlProps(id('line1'), e?.line1?.message)}
          className="in"
          autoComplete="off"
        />
      </Field>
      <Field id={id('line2')} label={t('fields.line2')} error={e?.line2?.message} className="span2">
        <input
          {...register(`${prefix}.line2`)}
          {...controlProps(id('line2'), e?.line2?.message)}
          className="in"
          autoComplete="off"
        />
      </Field>
      <Field id={id('locality')} label={t('fields.locality')} required error={e?.locality?.message}>
        <input
          {...register(`${prefix}.locality`)}
          {...controlProps(id('locality'), e?.locality?.message)}
          className="in"
          autoComplete="off"
        />
      </Field>
      <Field id={id('city')} label={t('fields.city')} required error={e?.city?.message}>
        <input
          {...register(`${prefix}.city`)}
          {...controlProps(id('city'), e?.city?.message)}
          className="in"
          autoComplete="off"
        />
      </Field>
      <Field id={id('state')} label={t('fields.state')} required error={e?.state?.message}>
        <select
          {...register(`${prefix}.state`)}
          {...controlProps(id('state'), e?.state?.message)}
          className="in"
        >
          <option value="">{t('common:select')}</option>
          {(states.data ?? []).map((s) => (
            <option key={s.code} value={s.code}>
              {label(s.labels, i18n.language)}
            </option>
          ))}
        </select>
      </Field>
      <Field id={id('pincode')} label={t('fields.pincode')} required error={e?.pincode?.message}>
        <input
          {...register(`${prefix}.pincode`)}
          {...controlProps(id('pincode'), e?.pincode?.message)}
          className="in mono"
          inputMode="numeric"
          maxLength={6}
          autoComplete="off"
        />
      </Field>
    </>
  )
}
