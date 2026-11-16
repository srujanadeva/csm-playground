// A Ctrl/⌘+K command palette: a dialog with a search field (combobox) over a list of commands.
// ↑/↓ move, Enter runs, Escape closes. Commands are passed in, so each app area can add its own.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import './overlays.css'

export interface Command {
  id: string
  label: string
  group: string
  hint?: ReactNode
  keywords?: string
  run: () => void
}

/**
 * Calls `onTrigger` on Ctrl+K / ⌘+K anywhere on the page (including inside fields, where
 * browsers would otherwise focus their own search bar).
 */
export function useCommandHotkey(onTrigger: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onTrigger()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onTrigger])
}

interface Props {
  open: boolean
  onClose: () => void
  commands: Command[]
  /** Called with the query when no command matches and Enter is pressed (e.g. a CIF lookup). */
  onFallback?: (query: string) => void
  fallbackLabel?: (query: string) => ReactNode
}

/** The palette dialog. Render it once; toggle `open`. */
export function CommandPalette({ open, onClose, commands, onFallback, fallbackLabel }: Props) {
  const { t } = useTranslation('ui')
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setQ('')
      setActive(0)
    }
  }
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    input.current?.focus()
    return () => previous?.focus?.()
  }, [open])

  const results = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    return commands.filter((c) => {
      const hay = `${c.label} ${c.group} ${c.keywords ?? ''}`.toLowerCase()
      return words.every((w) => hay.includes(w))
    })
  }, [q, commands])
  if (!open) return null

  const run = (c: Command | undefined) => {
    if (c) {
      onClose()
      c.run()
    } else if (q.trim() && onFallback) {
      onClose()
      onFallback(q.trim())
    }
  }
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <div className="palette" role="dialog" aria-modal="true" aria-label={t('palette.title')}>
        <input
          ref={input}
          className="palette-input"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
          placeholder={t('palette.placeholder')}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              if (results.length)
                setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length)
            } else if (e.key === 'Enter') {
              e.preventDefault()
              run(results[active])
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
        />
        <ul className="palette-list" role="listbox" id={listId} aria-label={t('palette.results')}>
          {results.map((c, i) => {
            const header = c.group !== results[i - 1]?.group ? c.group : null
            return (
              <li key={c.id} role="none">
                {header ? <div className="palette-group">{header}</div> : null}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={`palette-item ${i === active ? 'active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    run(c)
                  }}
                >
                  <span>{c.label}</span>
                  {c.hint ? <span className="help">{c.hint}</span> : null}
                </div>
              </li>
            )
          })}
          {results.length === 0 ? (
            <li className="palette-empty">
              {q.trim() && fallbackLabel ? fallbackLabel(q.trim()) : t('palette.noResults')}
            </li>
          ) : null}
        </ul>
        <div className="palette-foot help">{t('palette.keys')}</div>
      </div>
    </>,
    document.body,
  )
}
