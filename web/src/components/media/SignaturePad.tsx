// A canvas to sign on with mouse, pen or finger. Keeps the strokes so Undo removes the last one,
// and treats very short scribbles as empty (MIN_INK px of ink). The canvas has an id but no text,
// so tests draw on it with pointer coordinates and read data-strokes / data-empty.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './media.css'

type Point = [number, number]

const MIN_INK = 60 // px of total stroke length below which a signature counts as empty

/** Total length of all strokes, in CSS pixels. */
function inkLength(strokes: Point[][]): number {
  let total = 0
  for (const s of strokes)
    for (let i = 1; i < s.length; i++) total += Math.hypot(s[i]![0] - s[i - 1]![0], s[i]![1] - s[i - 1]![1])
  return total
}

/** Clears the canvas and draws every stroke. */
function paint(c: HTMLCanvasElement | null, all: Point[][]) {
  const ctx = c?.getContext('2d')
  if (!c || !ctx) return
  ctx.clearRect(0, 0, c.width, c.height)
  ctx.lineWidth = 2.2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#15201e'
  for (const s of all) {
    ctx.beginPath()
    s.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    // A single tap still leaves a dot.
    if (s.length === 1) ctx.lineTo(s[0]![0] + 0.1, s[0]![1])
    ctx.stroke()
  }
}

interface Props {
  id: string
  label: string
  /** Called with a PNG blob after each stroke, or null when cleared / too short. */
  onChange: (png: Blob | null) => void
  height?: number
  disabled?: boolean
}

/** Canvas + Clear / Undo. */
export function SignaturePad({ id, label, onChange, height = 180, disabled }: Props) {
  const { t } = useTranslation('ui')
  const canvas = useRef<HTMLCanvasElement>(null)
  const [strokes, setStrokes] = useState<Point[][]>([])
  const drawing = useRef<Point[] | null>(null)
  const empty = inkLength(strokes) < MIN_INK

  // Size the bitmap to the element × devicePixelRatio, so lines stay sharp on high-DPI screens.
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const fit = () => {
      const r = c.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      c.width = Math.round(r.width * dpr)
      c.height = Math.round(r.height * dpr)
      c.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0)
      paint(c, strokes)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(c)
    return () => ro.disconnect()
  }, [strokes])

  const emit = (all: Point[][]) => {
    if (inkLength(all) < MIN_INK) onChange(null)
    else canvas.current?.toBlob((b) => onChange(b), 'image/png')
  }
  const point = (e: React.PointerEvent): Point => {
    const r = canvas.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  const update = (all: Point[][]) => {
    setStrokes(all)
    emit(all)
  }

  return (
    <div className="sigpad" data-strokes={strokes.length} data-empty={empty}>
      <canvas
        ref={canvas}
        id={id}
        className="sigpad-canvas"
        style={{ height }}
        role="img"
        aria-label={label}
        onPointerDown={(e) => {
          if (disabled) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drawing.current = [point(e)]
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return
          drawing.current.push(point(e))
          paint(canvas.current, [...strokes, drawing.current])
        }}
        onPointerUp={() => {
          if (!drawing.current) return
          const all = [...strokes, drawing.current]
          drawing.current = null
          update(all)
        }}
        onPointerCancel={() => {
          drawing.current = null
          paint(canvas.current, strokes)
        }}
      />
      <div className="sigpad-bar">
        <span className="help">{empty ? t('signature.hint') : t('signature.captured')}</span>
        <div className="grow" />
        <button
          type="button"
          className="btn sm"
          disabled={!strokes.length || disabled}
          onClick={() => update(strokes.slice(0, -1))}
        >
          {t('signature.undo')}
        </button>
        <button
          type="button"
          className="btn sm"
          disabled={!strokes.length || disabled}
          onClick={() => update([])}
        >
          {t('signature.clear')}
        </button>
      </div>
    </div>
  )
}
