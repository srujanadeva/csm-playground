/**
 * Customer typeahead (ARIA combobox). Searches after 2 characters, debounced by 300 ms;
 * a newer keystroke cancels the older request. Arrow keys move, Enter picks, Escape closes.
 */
import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { CustomerTypeaheadItem } from '@csm/shared'
import { api } from '../api/client.ts'
import { useDebounce } from '../hooks/useDebounce.ts'
import { Icon } from './Icon.tsx'

interface Props {
  id: string
  value: CustomerTypeaheadItem | null
  onChange: (item: CustomerTypeaheadItem | null) => void
  error?: string
}

/** Pick a customer by name, CIF or mobile. */
export function CustomerTypeahead({ id, value, onChange, error }: Props) {
  const { t } = useTranslation('requests')
  const [text, setText] = useState(value ? `${value.cif} · ${value.name}` : '')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()
  const q = useDebounce(text.trim(), 300)
  const enabled = open && q.length >= 2 && !value

  const { data, isFetching } = useQuery({
    queryKey: ['typeahead', q],
    queryFn: ({ signal }) =>
      api<CustomerTypeaheadItem[]>(`/customers/typeahead?q=${encodeURIComponent(q)}`, { signal }),
    enabled,
    staleTime: 30_000,
  })
  const items = enabled ? (data ?? []) : []

  // When the parent sets a customer (e.g. preselected from ?cif=), show it in the input.
  const [shownValue, setShownValue] = useState(value)
  if (value !== shownValue) {
    setShownValue(value)
    if (value) setText(`${value.cif} · ${value.name}`)
  }

  const pick = (item: CustomerTypeaheadItem) => {
    onChange(item)
    setOpen(false)
  }

  return (
    <div className="menuwrap">
      <div className={`affix ${error ? 'invalid' : ''}`}>
        <span aria-hidden>
          <Icon name="search" />
        </span>
        <input
          id={id}
          data-testid={id}
          className="in"
          role="combobox"
          aria-expanded={open && items.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          aria-activedescendant={open && items[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          placeholder={t('new.customerPlaceholder')}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setActive(0)
            setOpen(true)
            if (value) onChange(null)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(a + 1, items.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Enter' && open && items[active]) {
              e.preventDefault()
              pick(items[active]!)
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
        />
        {isFetching ? (
          <span data-testid={`${id}-loading`} aria-label={t('common:loading')}>
            <span className="spin" />
          </span>
        ) : value ? (
          <button
            type="button"
            data-testid={`${id}-clear`}
            aria-label={t('common:clear')}
            onClick={() => {
              onChange(null)
              setText('')
            }}
          >
            ✕
          </button>
        ) : null}
      </div>
      {open && enabled && !isFetching ? (
        <ul
          className="menu"
          role="listbox"
          id={listId}
          data-testid={`${id}-options`}
          style={{ insetInlineStart: 0, right: 'auto', width: '100%' }}
        >
          {items.length === 0 ? (
            <li className="help" style={{ padding: '8px 10px' }} data-testid={`${id}-no-results`}>
              {t('new.noMatches')}
            </li>
          ) : (
            items.map((item, i) => (
              <li
                key={item.cif}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                data-testid={`${id}-option`}
                data-cif={item.cif}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(item)
                }}
                onMouseEnter={() => setActive(i)}
                style={{
                  padding: '7px 10px',
                  borderRadius: 5,
                  display: 'flex',
                  gap: 10,
                  cursor: 'pointer',
                  background: i === active ? 'var(--accent-weak)' : undefined,
                }}
              >
                <span className="mono">{item.cif}</span>
                <b style={{ fontWeight: 500 }}>{item.name}</b>
                <span className="help mono" style={{ marginInlineStart: 'auto' }}>
                  {item.mobile}
                </span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
