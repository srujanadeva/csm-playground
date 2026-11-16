// Two side-by-side panels with a draggable divider (role="separator"). Drag with the mouse or
// touch, or focus the divider and use ←/→ (Shift for bigger steps); Home/End jump to the limits.
import { useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import './data.css'

interface Props {
  start: ReactNode
  end: ReactNode
  /** Width of the start panel in percent. */
  size: number
  onSize: (pct: number) => void
  min?: number
  max?: number
  label: string
  height?: number | string
}

/** The panels; the caller owns `size` so it can remember it. */
export function ResizablePanels({
  start,
  end,
  size,
  onSize,
  min = 20,
  max = 80,
  label,
  height = 480,
}: Props) {
  const { t } = useTranslation('ui')
  const wrap = useRef<HTMLDivElement>(null)
  const clamp = (n: number) => Math.round(Math.min(max, Math.max(min, n)))
  const fromPointer = (clientX: number) => {
    const r = wrap.current?.getBoundingClientRect()
    if (r) onSize(clamp(((clientX - r.left) / r.width) * 100))
  }
  return (
    <div className="split" ref={wrap} style={{ height, gridTemplateColumns: `${size}% 8px 1fr` }}>
      <div className="split-pane">{start}</div>
      <div
        className="split-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={size}
        aria-valuetext={t('split.value', { n: size })}
        tabIndex={0}
        onPointerDown={(e) => {
          // Capturing the pointer keeps the drag alive when it leaves the thin handle.
          e.currentTarget.setPointerCapture(e.pointerId)
          e.preventDefault()
        }}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && fromPointer(e.clientX)}
        onKeyDown={(e) => {
          const big = e.shiftKey ? 10 : 2
          if (e.key === 'ArrowLeft') onSize(clamp(size - big))
          else if (e.key === 'ArrowRight') onSize(clamp(size + big))
          else if (e.key === 'Home') onSize(min)
          else if (e.key === 'End') onSize(max)
          else return
          e.preventDefault()
        }}
      />
      <div className="split-pane">{end}</div>
    </div>
  )
}
