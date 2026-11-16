/**
 * Nominees on the Contact step (FR-ONB-011): "Add nominee" reveals up to three rows; a nominee under
 * 18 also needs a guardian, and shares must total 100%. The inputs are labelled by wrapping <label>s
 * and have no ids or test ids: testers reach them by structure (plan §3, XP), e.g.
 * //fieldset[legend[.='Nominee 2']]//span[.='Share (%)']/following-sibling::input
 */
import {
  useFieldArray,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormWatch,
} from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { MAX_NOMINEES, NOMINEE_RELATIONSHIPS, isMinor } from '@csm/shared'
import { useErrorText } from '../../../components/Field.tsx'
import { Icon } from '../../../components/Icon.tsx'
import type { ContactForm } from './ContactStep.tsx'

const BLANK = { name: '', relationship: '' as never, dob: '', share: '' as never, guardianName: '' }

interface Props {
  control: Control<ContactForm>
  register: UseFormRegister<ContactForm>
  watch: UseFormWatch<ContactForm>
  errors: FieldErrors<ContactForm>
}

/** The "Add nominee" tick and the nominee rows it reveals. */
export function NomineeFields({ control, register, watch, errors }: Props) {
  const { t } = useTranslation('customers')
  const errorText = useErrorText()
  const { fields, append, remove } = useFieldArray({ control, name: 'nominee.nominees' })
  const add = watch('nominee.addNominee')
  const rows = watch('nominee.nominees') ?? []
  const total = rows.reduce((sum, n) => sum + (Number(n.share) || 0), 0)
  const e = errors.nominee?.nominees
  // Array-level problems (total, none added) arrive on .root from the resolver, or on the array itself.
  const listError = e?.root?.message ?? e?.message

  const err = (msg?: string) =>
    msg ? (
      <span className="errmsg" role="alert">
        {errorText(msg)}
      </span>
    ) : null

  return (
    <div className="nominee-fields">
      <label className="choice">
        <input
          type="checkbox"
          {...register('nominee.addNominee', {
            onChange: (ev: { target: { checked: boolean } }) => {
              if (ev.target.checked && fields.length === 0) append({ ...BLANK, share: 100 as never })
            },
          })}
        />
        <span>{t('onboard.nominee.add')}</span>
      </label>
      {add ? (
        <div className="reveal">
          {fields.map((f, i) => {
            const rowErr = e?.[i]
            return (
              <fieldset className="nominee-row" key={f.id}>
                <legend>{t('onboard.nominee.n', { n: i + 1 })}</legend>
                <div className="grid g4">
                  <label className="f">
                    <span className="lbl req">{t('onboard.nominee.name')}</span>
                    <input className="in" {...register(`nominee.nominees.${i}.name`)} />
                    {err(rowErr?.name?.message)}
                  </label>
                  <label className="f">
                    <span className="lbl req">{t('onboard.nominee.relationship')}</span>
                    <select className="in" {...register(`nominee.nominees.${i}.relationship`)}>
                      <option value="">{t('common:select')}</option>
                      {NOMINEE_RELATIONSHIPS.map((r) => (
                        <option key={r} value={r}>
                          {t(`onboard.nominee.relationships.${r}`)}
                        </option>
                      ))}
                    </select>
                    {err(rowErr?.relationship?.message)}
                  </label>
                  <label className="f">
                    <span className="lbl req">{t('onboard.nominee.dob')}</span>
                    <input type="date" className="in" {...register(`nominee.nominees.${i}.dob`)} />
                    {err(rowErr?.dob?.message)}
                  </label>
                  <label className="f">
                    <span className="lbl req">{t('onboard.nominee.share')}</span>
                    <input
                      type="number"
                      className="in num"
                      min={1}
                      max={100}
                      {...register(`nominee.nominees.${i}.share`)}
                    />
                    {err(rowErr?.share?.message)}
                  </label>
                  {isMinor(rows[i]?.dob) ? (
                    <label className="f span2 reveal">
                      <span className="lbl req">{t('onboard.nominee.guardian')}</span>
                      <input className="in" {...register(`nominee.nominees.${i}.guardianName`)} />
                      {err(rowErr?.guardianName?.message)}
                    </label>
                  ) : null}
                </div>
                {fields.length > 1 ? (
                  <button type="button" className="btn ghost sm" onClick={() => remove(i)}>
                    <Icon name="trash" />
                    {t('onboard.nominee.remove')}
                  </button>
                ) : null}
              </fieldset>
            )
          })}
          <div className="actions">
            {fields.length < MAX_NOMINEES ? (
              <button type="button" className="btn sm" onClick={() => append(BLANK)}>
                <Icon name="plus" />
                {t('onboard.nominee.addAnother')}
              </button>
            ) : (
              <span className="help">{t('onboard.nominee.max', { max: MAX_NOMINEES })}</span>
            )}
            <div className="grow" />
            <span className={total === 100 ? 'help num' : 'help num bad'}>
              {t('onboard.nominee.total', { total })}
            </span>
          </div>
          {err(listError)}
        </div>
      ) : null}
    </div>
  )
}
