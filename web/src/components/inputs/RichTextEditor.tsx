// A contenteditable editor with bold / italic / underline / list buttons. Uses
// document.execCommand: deprecated, but still the only built-in way to format a contenteditable.
// The DOM owns the content; React only seeds it, so the caret isn't reset on every keystroke.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { richTextLength, sanitizeRichText } from '../../lib/richText.ts'
import './inputs.css'

const COMMANDS = [
  { cmd: 'bold', glyph: 'B', key: 'bold' },
  { cmd: 'italic', glyph: 'I', key: 'italic' },
  { cmd: 'underline', glyph: 'U', key: 'underline' },
  { cmd: 'insertUnorderedList', glyph: '•≡', key: 'bullets' },
  { cmd: 'insertOrderedList', glyph: '1≡', key: 'numbers' },
] as const

interface Props {
  /** Starting HTML; read once on mount. */
  initialHtml?: string
  onChange: (html: string) => void
  label: string
  maxLength?: number
  invalid?: boolean
  /** id for the editable area (the toolbar has none on purpose). */
  id?: string
}

/** Toolbar + editable area + character count. */
export function RichTextEditor({ initialHtml = '', onChange, label, maxLength = 2000, invalid, id }: Props) {
  const { t } = useTranslation('ui')
  const ref = useRef<HTMLDivElement>(null)
  const [chars, setChars] = useState(0)
  const [pressed, setPressed] = useState<Record<string, boolean>>({})

  const sync = () => {
    const el = ref.current
    if (!el) return
    const html = sanitizeRichText(el.innerHTML)
    setChars(richTextLength(html))
    onChange(html)
  }

  useEffect(() => {
    if (!ref.current) return
    ref.current.innerHTML = sanitizeRichText(initialHtml)
    setChars(richTextLength(ref.current.innerHTML))
    // Seeded once: later prop changes would wipe what the user is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reflect the formatting at the caret in each toolbar button's aria-pressed.
  useEffect(() => {
    const onSel = () => {
      const sel = document.getSelection()
      if (!sel?.anchorNode || !ref.current?.contains(sel.anchorNode)) return
      setPressed(Object.fromEntries(COMMANDS.map((c) => [c.cmd, document.queryCommandState(c.cmd)])))
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [])

  const run = (cmd: string) => {
    ref.current?.focus()
    document.execCommand(cmd)
    sync()
    setPressed((p) => ({ ...p, [cmd]: document.queryCommandState(cmd) }))
  }

  return (
    <div className={`rte ${invalid ? 'invalid' : ''}`}>
      <div className="rte-bar" role="toolbar" aria-label={t('rte.toolbar')}>
        {/* mousedown + preventDefault: a click would move focus to the button and lose the selection. */}
        {COMMANDS.map((c) => (
          <button
            key={c.cmd}
            type="button"
            className="rte-btn"
            data-cmd={c.cmd}
            aria-label={t(`rte.${c.key}`)}
            aria-pressed={!!pressed[c.cmd]}
            onMouseDown={(e) => {
              e.preventDefault()
              run(c.cmd)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                run(c.cmd)
              }
            }}
          >
            {c.glyph}
          </button>
        ))}
      </div>
      <div
        ref={ref}
        id={id}
        className="rte-area"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        aria-invalid={invalid || chars > maxLength || undefined}
        onInput={sync}
        onPaste={(e) => {
          // Paste as plain text: pasted HTML from Word or web pages carries styles and scripts.
          e.preventDefault()
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
        }}
      />
      <span className={`help ${chars > maxLength ? 'over' : ''}`} aria-live="polite">
        {t('rte.count', { n: chars, max: maxLength })}
      </span>
    </div>
  )
}
