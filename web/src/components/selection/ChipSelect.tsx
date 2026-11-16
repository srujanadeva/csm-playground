// Pick values as removable chips: type to filter suggestions, Enter adds (or creates, when
// allowed), Backspace in an empty field removes the last chip. Each chip's remove button has the
// same visible "×", so tests must scope by the chip's text.
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Option } from './MultiSelect.tsx'
import './selection.css'

interface Props {
  options: Option[]
  value: string[]
  onChange: (values: string[]) => void
  label: string
  /** Allows values that aren't in `options` (free-form tags). */
  allowCreate?: boolean
  max?: number
  /** name attribute for the text field. */
  name?: string
}

/** Chips + combobox field. */
export function ChipSelect({ options, value, onChange, label, allowCreate, max = 10, name }: Props) {
  const { t } = useTranslation('ui')
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v
  const q = text.trim().toLowerCase()
  const matches = options.filter((o) => !value.includes(o.value) && o.label.toLowerCase().includes(q))
  const full = value.length >= max

  const add = (v: string) => {
    if (!v || value.includes(v) || full) return
    onChange([...value, v])
    setText('')
    setActive(0)
  }
  return (
    <div className="chips-field">
      <ul className="chips" aria-label={label}>
        {value.map((v) => (
          <li key={v} className="chip-item" data-value={v}>
            <span>{labelOf(v)}</span>
            <button
              type="button"
              aria-label={t('chips.remove', { item: labelOf(v) })}
              onClick={() => onChange(value.filter((x) => x !== v))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="menuwrap">
        <input
          name={name}
          className="in"
          role="combobox"
          aria-label={label}
          aria-expanded={open && matches.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
          placeholder={full ? t('chips.full', { max }) : t('chips.placeholder')}
          disabled={full}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
            setActive(0)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(a + 1, matches.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              const m = matches[active]
              if (open && m) add(m.value)
              else if (allowCreate && q) add(text.trim())
            } else if (e.key === 'Backspace' && !text && value.length) {
              onChange(value.slice(0, -1))
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
        />
        {open && matches.length > 0 ? (
          <ul className="menu chips-menu" role="listbox" id={listId}>
            {matches.map((o, i) => (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'active' : undefined}
                onMouseDown={(e) => {
                  e.preventDefault()
                  add(o.value)
                }}
              >
                {o.label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
