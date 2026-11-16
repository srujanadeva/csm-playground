// A card that appears after hovering (or focusing) its trigger for a moment, and stays while the
// pointer moves onto it. Content can load lazily: `render` runs only once the card opens.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import './overlays.css'

interface Props {
  /** The visible trigger (a CIF, a staff name…). */
  children: ReactNode
  render: () => ReactNode
  /** ms before opening; hover must rest this long, so passing over a table doesn't flash cards. */
  openDelay?: number
  className?: string
  /** Tooltip text on the trigger: often its only hook (plan §3, TTL). */
  title?: string
}

/** Trigger + card. The trigger only carries a `title`, mirroring a legacy tooltip. */
export function HoverCard({ children, render, openDelay = 400, className, title }: Props) {
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const id = useId()
  const show = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(true), openDelay)
  }
  // A short grace period lets the pointer travel from the trigger onto the card.
  const hide = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(false), 150)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <span
      className={`hovercard-wrap ${className ?? ''}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      <span className="hovercard-trigger" tabIndex={0} title={title} aria-describedby={open ? id : undefined}>
        {children}
      </span>
      {open ? (
        <span className="hovercard" id={id} role="tooltip">
          {render()}
        </span>
      ) : null}
    </span>
  )
}
