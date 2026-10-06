/**
 * New service request (/service-requests/new?cif=CIF-000124). Customer typeahead, channel
 * radios, dependent category → sub-category dropdowns, priority radios that set the SLA
 * due date/time (until the user changes it), subject, description with a counter, queued
 * attachments uploaded after creation, assignee, and notification checkboxes.
 * Submitting twice (double click, retry) creates one request thanks to the Idempotency-Key.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import {
  SLA_HOURS,
  SR_CHANNELS,
  SR_PRIORITIES,
  createServiceRequestSchema,
  type CustomerDetail,
  type CustomerTypeaheadItem,
  type ServiceRequestDetail,
} from '@csm/shared'
import { ApiError, api, newIdempotencyKey } from '../../api/client.ts'
import { uploadFile } from '../../api/upload.ts'
import { useMe } from '../../app/auth.tsx'
import { useCrumb } from '../../app/AppShell.tsx'
import { Field, FieldGroup, controlProps } from '../../components/Field.tsx'
import { FileDropzone, precheck } from '../../components/FileDropzone.tsx'
import { Icon } from '../../components/Icon.tsx'
import { CustomerTypeahead } from '../../components/Typeahead.tsx'
import { useToast } from '../../components/Toast.tsx'
import { useLookups } from '../../hooks/useLookups.ts'
import { label, toIso, toLocalInputs } from '../../lib/format.ts'

// The form keeps date and time as two inputs; they become `slaDueAt` on submit.
const formSchema = createServiceRequestSchema
  .omit({ slaDueAt: true })
  .extend({
    slaDate: z.string().min(1, 'required'),
    slaTime: z.string().min(1, 'required'),
  })
  .refine((d) => Date.parse(toIso(d.slaDate, d.slaTime)) > Date.now(), {
    error: 'slaFuture',
    path: ['slaDate'],
  })
type Form = z.input<typeof formSchema>

const MAX_FILES = 5

function slaFor(priority: keyof typeof SLA_HOURS) {
  return toLocalInputs(new Date(Date.now() + SLA_HOURS[priority] * 3_600_000))
}

/** /service-requests/new */
export default function NewRequestPage() {
  const { t, i18n } = useTranslation('requests')
  const lang = i18n.language
  const me = useMe()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const [customer, setCustomer] = useState<CustomerTypeaheadItem | null>(null)
  const [files, setFiles] = useState<{ file: File; error?: string }[]>([])
  const slaTouched = useRef(false)
  const idemKey = useRef(newIdempotencyKey())
  useCrumb([t('nav.requests'), t('new.title')])

  const categories = useLookups('srCategories')
  const assignees = useQuery({
    queryKey: ['assignees'],
    queryFn: () =>
      api<{ items: { staffId: string; name: string }[] }>('/service-requests/assignees').then((r) => r.items),
  })

  const initialSla = slaFor('medium')
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerCif: '',
      channel: 'branch',
      category: '',
      subCategory: '',
      priority: 'medium',
      subject: '',
      description: '',
      assignedTo: me.user.staffId,
      notifyBySms: true,
      notifyByEmail: false,
      slaDate: initialSla.date,
      slaTime: initialSla.time,
    },
  })
  const category = watch('category')
  const priority = watch('priority')
  const description = watch('description') ?? ''
  const subCategories = useLookups('srSubCategories', category || undefined, !!category)

  // Preselect a customer from ?cif= (e.g. from Customer 360).
  const preCif = params.get('cif')
  const pre = useQuery({
    queryKey: ['customer', preCif],
    queryFn: () => api<CustomerDetail>(`/customers/${preCif}`),
    enabled: !!preCif,
  })
  useEffect(() => {
    if (pre.data?.cif) {
      const item = {
        cif: pre.data.cif,
        name: [pre.data.personal.firstName, pre.data.personal.lastName].filter(Boolean).join(' '),
        mobile: pre.data.contact.mobile ?? '',
        branchCode: pre.data.branchCode,
      }
      setCustomer(item)
      setValue('customerCif', item.cif, { shouldValidate: false })
    }
  }, [pre.data, setValue])

  useEffect(() => {
    if (!slaTouched.current && priority) {
      const s = slaFor(priority)
      setValue('slaDate', s.date)
      setValue('slaTime', s.time)
    }
  }, [priority, setValue])

  useEffect(() => setValue('subCategory', ''), [category, setValue])

  const addFiles = (incoming: File[]) => {
    setFiles((current) =>
      [
        ...current,
        ...incoming.map((file) => {
          const bad = precheck(file)
          return bad ? { file, error: t(`common:${bad}`) } : { file }
        }),
      ].slice(0, MAX_FILES),
    )
  }

  const submit = handleSubmit(async ({ slaDate, slaTime, ...rest }) => {
    try {
      const created = await api<ServiceRequestDetail>('/service-requests', {
        method: 'POST',
        body: { ...rest, slaDueAt: toIso(slaDate, slaTime) },
        idempotencyKey: idemKey.current,
      })
      const failed: string[] = []
      for (const f of files.filter((x) => !x.error)) {
        try {
          await uploadFile(`/service-requests/${created.srNo}/attachments`, f.file, {}, () => undefined)
        } catch {
          failed.push(f.file.name)
        }
      }
      idemKey.current = newIdempotencyKey()
      toast(
        failed.length
          ? t('new.createdWithFailures', { srNo: created.srNo, files: failed.join(', ') })
          : t('new.created', { srNo: created.srNo }),
        failed.length ? 'error' : 'success',
      )
      void qc.invalidateQueries({ queryKey: ['board'] })
      void qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
      navigate(`/service-requests?sr=${created.srNo}`)
    } catch (err) {
      if (err instanceof ApiError && err.problem.errors) {
        err.problem.errors.forEach((e) =>
          setError((e.path === 'slaDueAt' ? 'slaDate' : e.path) as keyof Form, {
            message: e.code ?? e.message,
          }),
        )
      } else {
        setError('root', { message: err instanceof ApiError ? err.message : t('common:error.generic') })
      }
    }
  })

  const e = errors
  const id = (f: string) => `sr-new-${f}`
  return (
    <form
      onSubmit={submit}
      noValidate
      data-testid="sr-new-form"
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <div className="ph">
        <div>
          <h1>{t('new.title')}</h1>
          <p>{t('new.subtitle')}</p>
        </div>
      </div>
      {e.root ? (
        <div className="note bad" role="alert" data-testid="sr-new-error">
          <Icon name="warn" />
          {e.root.message}
        </div>
      ) : null}

      <section className="panel">
        <header>
          <h2>{t('new.customer')}</h2>
        </header>
        <div className="body grid g4">
          <Field
            id={id('customer')}
            label={t('fields.customer')}
            required
            error={e.customerCif?.message}
            className="span2"
            help={t('new.customerHelp')}
          >
            <CustomerTypeahead
              id={id('customer')}
              value={customer}
              error={e.customerCif?.message}
              onChange={(item) => {
                setCustomer(item)
                setValue('customerCif', item?.cif ?? '', { shouldValidate: !!item })
              }}
            />
          </Field>
          <FieldGroup
            id={id('channel')}
            label={t('fields.channel')}
            required
            error={e.channel?.message}
            className="span2"
          >
            {SR_CHANNELS.map((c) => (
              <label className="choice" key={c}>
                <input
                  type="radio"
                  value={c}
                  {...register('channel')}
                  data-testid={`${id('channel')}-${c}`}
                />
                <span>{t(`channel.${c}`)}</span>
              </label>
            ))}
          </FieldGroup>
        </div>
      </section>

      <section className="panel">
        <header>
          <h2>{t('new.details')}</h2>
        </header>
        <div className="body grid g4">
          <Field id={id('category')} label={t('fields.category')} required error={e.category?.message}>
            <select
              {...register('category')}
              {...controlProps(id('category'), e.category?.message)}
              className="in"
            >
              <option value="">{t('common:select')}</option>
              {(categories.data ?? []).map((c) => (
                <option key={c.code} value={c.code}>
                  {label(c.labels, lang)}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id={id('sub-category')}
            label={t('fields.subCategory')}
            required
            error={e.subCategory?.message}
            help={t('new.subCategoryHelp')}
          >
            <select
              {...register('subCategory')}
              {...controlProps(id('sub-category'), e.subCategory?.message)}
              className="in"
              disabled={!category}
            >
              <option value="">{category ? t('common:select') : t('new.chooseCategoryFirst')}</option>
              {(subCategories.data ?? []).map((c) => (
                <option key={c.code} value={c.code}>
                  {label(c.labels, lang)}
                </option>
              ))}
            </select>
          </Field>
          <FieldGroup
            id={id('priority')}
            label={t('fields.priority')}
            required
            error={e.priority?.message}
            className="span2"
          >
            {SR_PRIORITIES.map((p) => (
              <label className="choice" key={p}>
                <input
                  type="radio"
                  value={p}
                  {...register('priority')}
                  data-testid={`${id('priority')}-${p}`}
                />
                <span>{t(`common:priority.${p}`)}</span>
              </label>
            ))}
          </FieldGroup>
          <Field id={id('sla-date')} label={t('fields.slaDate')} required error={e.slaDate?.message}>
            <input
              type="date"
              {...register('slaDate', { onChange: () => (slaTouched.current = true) })}
              {...controlProps(id('sla-date'), e.slaDate?.message)}
              className="in"
            />
          </Field>
          <Field
            id={id('sla-time')}
            label={t('fields.slaTime')}
            required
            error={e.slaTime?.message}
            help={t('new.slaHelp', {
              priority: t(`common:priority.${priority}`),
              hours: SLA_HOURS[priority ?? 'medium'],
            })}
          >
            <input
              type="time"
              {...register('slaTime', { onChange: () => (slaTouched.current = true) })}
              {...controlProps(id('sla-time'), e.slaTime?.message)}
              className="in"
            />
          </Field>
          <Field
            id={id('assignee')}
            label={t('fields.assignee')}
            error={e.assignedTo?.message}
            className="span2"
          >
            <select
              {...register('assignedTo')}
              {...controlProps(id('assignee'), e.assignedTo?.message)}
              className="in"
            >
              {(assignees.data ?? []).map((a) => (
                <option key={a.staffId} value={a.staffId}>
                  {a.staffId === me.user.staffId ? t('new.me', { name: a.name }) : `${a.name} (${a.staffId})`}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id={id('subject')}
            label={t('fields.subject')}
            required
            error={e.subject?.message}
            className="span-all"
          >
            <input
              {...register('subject')}
              {...controlProps(id('subject'), e.subject?.message)}
              className="in"
              maxLength={120}
            />
          </Field>
          <Field
            id={id('description')}
            label={t('fields.description')}
            required
            error={e.description?.message}
            className="span-all"
            help={
              <span data-testid={id('description-count')} style={{ display: 'block', textAlign: 'end' }}>
                {description.length} / 1000
              </span>
            }
          >
            <textarea
              {...register('description')}
              {...controlProps(id('description'), e.description?.message)}
              className="in"
              maxLength={1000}
              style={{ minHeight: 110 }}
            />
          </Field>
          <div className="f span2">
            <span className="lbl">{t('fields.attachments')}</span>
            <FileDropzone
              id={id('attachments')}
              multiple
              disabled={files.length >= MAX_FILES}
              title={t('new.drop')}
              hint={t('new.dropHint', { max: MAX_FILES })}
              onFiles={addFiles}
            />
            <div className="files" data-testid={id('attachment-list')}>
              {files.map((f, i) => (
                <div
                  className={`file ${f.error ? 'bad' : ''}`}
                  key={`${f.file.name}-${i}`}
                  data-testid={id('attachment')}
                >
                  <span className="thumb">{f.file.type === 'application/pdf' ? 'PDF' : 'IMG'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {f.file.name}
                    <div className={`meta ${f.error ? 'bad' : ''}`}>
                      {f.error ?? `${Math.round(f.file.size / 1024)} KB · ${t('new.uploadsAfter')}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn icon ghost sm"
                    aria-label={t('common:remove')}
                    data-testid={id('attachment-remove')}
                    onClick={() => setFiles((all) => all.filter((_, j) => j !== i))}
                  >
                    <Icon name="x" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <FieldGroup id={id('notify')} label={t('fields.notifications')} className="span2" column>
            <label className="choice">
              <input type="checkbox" {...register('notifyBySms')} data-testid={id('notify-sms')} />
              <span>{t('new.notifySms')}</span>
            </label>
            <label className="choice">
              <input type="checkbox" {...register('notifyByEmail')} data-testid={id('notify-email')} />
              <span>{t('new.notifyEmail')}</span>
            </label>
          </FieldGroup>
          <Controller control={control} name="customerCif" render={() => <></>} />
        </div>
      </section>

      <div className="actions">
        <div className="grow" />
        <button type="button" className="btn ghost" data-testid="sr-new-cancel" onClick={() => navigate(-1)}>
          {t('common:cancel')}
        </button>
        <button type="submit" className="btn pri" data-testid="sr-new-submit" disabled={isSubmitting}>
          {isSubmitting ? <span className="spin" /> : null}
          {t('new.submit')}
        </button>
      </div>
    </form>
  )
}
