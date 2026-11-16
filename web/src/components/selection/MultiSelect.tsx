// A dropdown that allows several choices: a button showing the selection and a listbox with
// checkboxes. Space/Enter toggles the active option; the list stays open until Escape or a click away.
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './selection.css'

export interface Option {
  value: string
  label: string
}

interface Props {
  options: Option[]
  value: string[]
  onChange: (values: string[]) => void
  label: string
  /** id for the trigger button. */
  id?: string
  /** Shown when nothing is selected. */
  placeholder?: string
}

/** Multi-select dropdown with "Select all" and "Clear". */
export function MultiSelect({ options, value, onChange, label, id, placeholder }: Props) {
  const { t } = useTranslation('ui')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrap = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    list.current?.focus()
    const away = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  const summary =
    value.length === 0
      ? (placeholder ?? t('multi.none'))
      : value.length <= 2
        ? options
            .filter((o) => value.includes(o.value))
            .map((o) => o.label)
            .join(', ')
        : t('multi.count', { n: value.length })

  return (
    <div className="multi" ref={wrap}>
      <button
        type="button"
        id={id}
        className="in multi-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${summary}`}
        data-count={value.length}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{summary}</span>
        <span aria-hidden>▾</span>
      </button>
      {open ? (
        <div className="multi-pop">
          <div className="multi-actions">
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => onChange(options.map((o) => o.value))}
            >
              {t('multi.all')}
            </button>
            <button type="button" className="btn ghost sm" onClick={() => onChange([])}>
              {t('multi.clear')}
            </button>
          </div>
          <ul
            ref={list}
            id={listId}
            role="listbox"
            aria-multiselectable="true"
            aria-label={label}
            tabIndex={0}
            aria-activedescendant={`${listId}-${active}`}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length)
              } else if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault()
                const o = options[active]
                if (o) toggle(o.value)
              } else if (e.key === 'Escape') {
                setOpen(false)
              }
            }}
          >
            {options.map((o, i) => (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={value.includes(o.value)}
                data-value={o.value}
                className={i === active ? 'active' : undefined}
                onMouseDown={(e) => {
                  e.preventDefault()
                  setActive(i)
                  toggle(o.value)
                }}
              >
                <span className="box" aria-hidden>
                  {value.includes(o.value) ? '✓' : ''}
                </span>
                {o.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
