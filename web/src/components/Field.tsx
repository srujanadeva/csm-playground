/**
 * Form field building blocks. Every control gets the same locator contract:
 *   id = data-testid = "<screen>-<section>-<field>", error text at "<id>-error" (role=alert).
 * Error messages are validation codes from @csm/shared, translated here.
 */
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from './Icon.tsx'

/** Props to spread on a control so it's labelled, testable and linked to its error. */
export function controlProps(id: string, error?: string) {
  return {
    id,
    'data-testid': id,
    'aria-invalid': error ? (true as const) : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
  }
}

/** Translates a validation code (or passes a server sentence through). */
export function useErrorText() {
  const { t } = useTranslation('validation')
  return (code?: string) => (code ? t(code, { defaultValue: code }) : undefined)
}

interface FieldProps {
  id: string
  label: ReactNode
  required?: boolean
  error?: string
  help?: ReactNode
  className?: string
  children: ReactNode
}

/** Label + control + help/error, laid out as one grid cell. */
export function Field({ id, label, required, error, help, className, children }: FieldProps) {
  const errorText = useErrorText()
  return (
    <div className={`f ${className ?? ''}`}>
      <label htmlFor={id} className={required ? 'req' : undefined}>
        {label}
      </label>
      {children}
      {error ? (
        <span className="errmsg" id={`${id}-error`} data-testid={`${id}-error`} role="alert">
          {errorText(error)}
        </span>
      ) : help ? (
        <span className="help">{help}</span>
      ) : null}
    </div>
  )
}

interface GroupProps {
  id: string
  label: ReactNode
  required?: boolean
  error?: string
  help?: ReactNode
  className?: string
  column?: boolean
  children: ReactNode
}

/** A fieldset for radio and checkbox groups (the legend labels the whole group). */
export function FieldGroup({ id, label, required, error, help, className, column, children }: GroupProps) {
  const errorText = useErrorText()
  return (
    <fieldset
      className={`f ${className ?? ''}`}
      id={id}
      data-testid={id}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
    >
      <legend className={`lbl ${required ? 'req' : ''}`}>{label}</legend>
      <div className={`opts ${column ? 'col' : ''}`}>{children}</div>
      {error ? (
        <span className="errmsg" id={`${id}-error`} data-testid={`${id}-error`} role="alert">
          {errorText(error)}
        </span>
      ) : help ? (
        <span className="help">{help}</span>
      ) : null}
    </fieldset>
  )
}

/** A password-style input with a show/hide button (used for passwords and ID numbers). */
export function MaskedInput({
  id,
  error,
  autoComplete,
  ...rest
}: { id: string; error?: string; autoComplete?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const { t } = useTranslation()
  const [shown, setShown] = useState(false)
  return (
    <div className={`affix ${error ? 'invalid' : ''}`}>
      <input
        {...rest}
        {...controlProps(id, error)}
        className="in"
        type={shown ? 'text' : 'password'}
        autoComplete={autoComplete ?? 'off'}
      />
      <button
        type="button"
        data-testid={`${id}-toggle`}
        aria-label={shown ? t('hide') : t('show')}
        aria-pressed={shown}
        aria-controls={id}
        onClick={() => setShown((s) => !s)}
      >
        <Icon name={shown ? 'eye-off' : 'eye'} />
      </button>
    </div>
  )
}
