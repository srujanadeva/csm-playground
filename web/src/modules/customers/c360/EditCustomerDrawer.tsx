/**
 * Edit drawer on Customer 360: contact details, addresses and employment. Loads the real
 * (unmasked) values from /customers/:cif/form, sends full sections with the record version,
 * and every changed field lands in the audit log. KYC changes need re-KYC, so they're not here.
 */
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { COMM_PREFS, contactSchema, personalSchema, type CustomerDraftForm } from '@csm/shared'
import { ApiError, api } from '../../../api/client.ts'
import { Field, FieldGroup, controlProps } from '../../../components/Field.tsx'
import { Drawer } from '../../../components/Overlay.tsx'
import { Loading } from '../../../components/Widgets.tsx'
import { useLookups } from '../../../hooks/useLookups.ts'
import { label } from '../../../lib/format.ts'
import { AddressFields } from '../onboard/AddressFields.tsx'

const editSchema = z.object({ personal: personalSchema, contact: contactSchema })
type Form = z.input<typeof editSchema>

function EditForm({
  form,
  onClose,
  onSaved,
}: {
  form: CustomerDraftForm
  onClose: () => void
  onSaved: () => void
}) {
  const { t, i18n } = useTranslation('customers')
  const occupations = useLookups('occupations')
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Form>({
    resolver: zodResolver(editSchema),
    defaultValues: { personal: form.personal as Form['personal'], contact: form.contact as Form['contact'] },
  })
  const same = watch('contact.mailingSameAsPermanent')
  const ce = errors.contact
  const pe = errors.personal

  const save = handleSubmit(async (values) => {
    try {
      await api(`/customers/${form.ref}`, { method: 'PATCH', body: { version: form.version, ...values } })
      onSaved()
    } catch (err) {
      if (err instanceof ApiError && err.problem.errors) {
        err.problem.errors.forEach((e) => setError(e.path as never, { message: e.code ?? e.message }))
      } else {
        setError('root', { message: err instanceof ApiError ? err.message : t('common:error.generic') })
      }
    }
  })

  // The nested address component expects a contact-only form; adapt the registration prefix.
  const contactRegister = ((name: string) => register(`contact.${name}` as never)) as never
  const contactErrors = (ce ?? {}) as never

  return (
    <Drawer
      testId="c360-edit"
      title={t('c360.edit.title')}
      subtitle={<span className="mono">{form.cif}</span>}
      onClose={onClose}
      footer={
        <>
          <span className="help">{isDirty ? t('c360.edit.unsaved') : ''}</span>
          <div className="grow" />
          <button type="button" className="btn" data-testid="c360-edit-cancel" onClick={onClose}>
            {t('common:cancel')}
          </button>
          <button
            type="submit"
            form="c360-edit-form"
            className="btn pri"
            data-testid="c360-edit-save"
            disabled={isSubmitting || !isDirty}
          >
            {isSubmitting ? <span className="spin" /> : null}
            {t('common:save')}
          </button>
        </>
      }
    >
      <form id="c360-edit-form" onSubmit={save} noValidate className="grid g2">
        {errors.root ? (
          <div className="note bad span-all" role="alert" data-testid="c360-edit-error">
            {errors.root.message}
          </div>
        ) : null}
        <h3 className="span-all" style={{ margin: 0, fontSize: 13 }}>
          {t('onboard.contact.title')}
        </h3>
        <Field id="c360-edit-mobile" label={t('fields.mobile')} required error={ce?.mobile?.message}>
          <div className={`affix ${ce?.mobile ? 'invalid' : ''}`}>
            <span>+91</span>
            <input
              {...register('contact.mobile')}
              {...controlProps('c360-edit-mobile', ce?.mobile?.message)}
              className="in mono"
              maxLength={10}
            />
          </div>
        </Field>
        <Field id="c360-edit-email" label={t('fields.email')} required error={ce?.email?.message}>
          <input
            type="email"
            {...register('contact.email')}
            {...controlProps('c360-edit-email', ce?.email?.message)}
            className="in"
          />
        </Field>
        <FieldGroup
          id="c360-edit-comm"
          label={t('fields.commPrefs')}
          required
          error={ce?.commPrefs?.message}
          className="span-all"
        >
          {COMM_PREFS.map((p) => (
            <label className="choice" key={p}>
              <input
                type="checkbox"
                value={p}
                {...register('contact.commPrefs')}
                data-testid={`c360-edit-comm-${p}`}
              />
              <span>{t(`values.commPrefs.${p}`)}</span>
            </label>
          ))}
        </FieldGroup>
        <AddressFields prefix="permanent" register={contactRegister} errors={contactErrors} />
        <label className="choice span-all">
          <input
            type="checkbox"
            {...register('contact.mailingSameAsPermanent')}
            data-testid="c360-edit-mailing-same"
          />
          <span>{t('onboard.contact.mailingSame')}</span>
        </label>
        {!same ? <AddressFields prefix="mailing" register={contactRegister} errors={contactErrors} /> : null}

        <h3 className="span-all" style={{ margin: '8px 0 0', fontSize: 13 }}>
          {t('onboard.personal.employment')}
        </h3>
        <Field
          id="c360-edit-occupation"
          label={t('fields.occupation')}
          required
          error={pe?.occupation?.message}
        >
          <select
            {...register('personal.occupation')}
            {...controlProps('c360-edit-occupation', pe?.occupation?.message)}
            className="in"
          >
            {(occupations.data ?? []).map((o) => (
              <option key={o.code} value={o.code}>
                {label(o.labels, i18n.language)}
              </option>
            ))}
          </select>
        </Field>
        <Field id="c360-edit-employer" label={t('fields.employer')} error={pe?.employer?.message}>
          <input
            {...register('personal.employer')}
            {...controlProps('c360-edit-employer', pe?.employer?.message)}
            className="in"
          />
        </Field>
        <Field id="c360-edit-income" label={t('fields.monthlyIncome')} error={pe?.monthlyIncome?.message}>
          <input
            type="number"
            {...register('personal.monthlyIncome', { valueAsNumber: true })}
            {...controlProps('c360-edit-income', pe?.monthlyIncome?.message)}
            className="in num"
          />
        </Field>
        <Field id="c360-edit-language" label={t('fields.preferredLanguage')}>
          <select
            {...register('personal.preferredLanguage')}
            {...controlProps('c360-edit-language')}
            className="in"
          >
            <option value="en">English</option>
            <option value="kn">ಕನ್ನಡ</option>
          </select>
        </Field>
      </form>
    </Drawer>
  )
}

/** Loads the editable values, then shows the form. */
export function EditCustomerDrawer({
  cif,
  onClose,
  onSaved,
}: {
  cif: string
  onClose: () => void
  onSaved: () => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['customer', cif, 'form'],
    queryFn: () => api<CustomerDraftForm>(`/customers/${cif}/form`),
    staleTime: 0,
  })
  if (isLoading || !data) {
    return (
      <Drawer testId="c360-edit" title="…" onClose={onClose}>
        <Loading testId="c360-edit-loading" />
      </Drawer>
    )
  }
  return <EditForm form={data} onClose={onClose} onSaved={onSaved} />
}
