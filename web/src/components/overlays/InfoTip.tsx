// The ⓘ button on a section header and its explanation box. Opens on hover, or on click / Enter
// (which pins it until a click elsewhere or Escape). The box is only in the DOM while open, so it
// can't sit over something a test is clicking.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import './overlays.css'

/** ⓘ + box. `children` is the explanation. */
export function InfoTip({ children, topic }: { children: ReactNode; topic: string }) {
  const { t } = useTranslation('ui')
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const wrap = useRef<HTMLSpanElement>(null)
  const boxId = useId()
  const open = hovered || pinned
  useEffect(() => {
    if (!pinned) return
    const away = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setPinned(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setPinned(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [pinned])
  return (
    <span
      ref={wrap}
      className="infotip"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className="infotip-btn"
        aria-label={t('infotip.about', { topic })}
        aria-expanded={open}
        aria-controls={open ? boxId : undefined}
        onClick={() => setPinned((p) => !p)}
      >
        i
      </button>
      {open ? (
        <span className="infotip-box" id={boxId} role="note">
          {children}
        </span>
      ) : null}
    </span>
  )
}
