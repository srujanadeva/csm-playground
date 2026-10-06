/** Block / unblock request (maker-checker): reason from the list plus remarks, sent for approval. */
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { blockRequestSchema } from '@csm/shared'
import type { z } from 'zod'
import { api } from '../../../api/client.ts'
import { Field, controlProps } from '../../../components/Field.tsx'
import { Modal } from '../../../components/Overlay.tsx'
import { useLookups } from '../../../hooks/useLookups.ts'
import { label } from '../../../lib/format.ts'
import { applyServerErrors } from '../onboard/shared.tsx'

type Form = z.input<typeof blockRequestSchema>

/** Modal for a block or unblock request on one customer. */
export function StatusRequestModal({
  cif,
  kind,
  onClose,
  onDone,
}: {
  cif: string
  kind: 'block' | 'unblock'
  onClose: () => void
  onDone: () => void
}) {
  const { t, i18n } = useTranslation('customers')
  const reasons = useLookups('blockReasons')
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(blockRequestSchema), defaultValues: { reason: '', remarks: '' } })
  const remarks = watch('remarks') ?? ''

  const submit = handleSubmit(async (values) => {
    try {
      await api(`/customers/${cif}/${kind}-requests`, { method: 'POST', body: values })
      onDone()
    } catch (err) {
      if (!applyServerErrors(err, '', setError)) setError('root', { message: (err as Error).message })
    }
  })

  return (
    <Modal
      testId="c360-status-modal"
      title={t(`c360.${kind}.title`)}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" data-testid="c360-status-cancel" onClick={onClose}>
            {t('common:cancel')}
          </button>
          <button
            type="submit"
            form="c360-status-form"
            className={`btn ${kind === 'block' ? 'danger-solid' : 'pri'}`}
            data-testid="c360-status-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? <span className="spin" /> : null}
            {t('c360.sendForApproval')}
          </button>
        </>
      }
    >
      <form
        id="c360-status-form"
        onSubmit={submit}
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <span>{t(`c360.${kind}.message`)}</span>
        {errors.root ? (
          <div className="note bad" role="alert">
            {errors.root.message}
          </div>
        ) : null}
        <Field id="c360-status-reason" label={t('c360.reason')} required error={errors.reason?.message}>
          <select
            {...register('reason')}
            {...controlProps('c360-status-reason', errors.reason?.message)}
            className="in"
            data-autofocus
          >
            <option value="">{t('common:select')}</option>
            {(reasons.data ?? []).map((r) => (
              <option key={r.code} value={r.code}>
                {label(r.labels, i18n.language)}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id="c360-status-remarks"
          label={t('c360.remarks')}
          required
          error={errors.remarks?.message}
          help={`${remarks.length} / 500`}
        >
          <textarea
            {...register('remarks')}
            {...controlProps('c360-status-remarks', errors.remarks?.message)}
            className="in"
            maxLength={500}
          />
        </Field>
      </form>
    </Modal>
  )
}
