// An SVG line or bar chart whose exact values appear only in a tooltip on hover or keyboard focus,
// so tests must hover a point (or focus it) to read a value. Points carry data-index and data-series.
import { useState } from 'react'
import './data.css'

export interface Series {
  key: string
  label: string
  /** A CSS colour, normally a token like var(--accent). */
  color: string
}

export interface Datum {
  label: string
  values: Record<string, number>
}

interface Props {
  data: Datum[]
  series: Series[]
  kind?: 'line' | 'bar'
  /** Accessible summary, e.g. "Requests opened per day, last 14 days". */
  title: string
  height?: number
  format?: (n: number) => string
}

const W = 640
const PAD = { top: 16, right: 16, bottom: 28, left: 40 }

/** Rounds up to a "nice" axis maximum (1, 2, 5 × 10ⁿ). */
function niceMax(n: number): number {
  if (n <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(n))
  return ([1, 2, 5, 10].find((m) => m * p >= n) ?? 10) * p
}

/** The chart, its legend, and the tooltip for the hovered point. */
export function Chart({ data, series, kind = 'line', title, height = 220, format = String }: Props) {
  const [hover, setHover] = useState<{ i: number; s: string } | null>(null)
  const max = niceMax(Math.max(0, ...data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0))))
  const innerW = W - PAD.left - PAD.right
  const innerH = height - PAD.top - PAD.bottom
  const step = innerW / Math.max(1, data.length)
  const x = (i: number) => PAD.left + step * i + step / 2
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f)
  const barW = Math.max(4, (step * 0.7) / series.length)
  // Show every label when there's room, otherwise every other one.
  const labelEvery = data.length > 16 ? 3 : data.length > 10 ? 2 : 1

  const hovered = hover ? data[hover.i] : undefined
  const hoveredSeries = hover ? series.find((s) => s.key === hover.s) : undefined
  return (
    <figure className="chart" data-kind={kind}>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={title} className="chart-svg">
        {ticks.map((v) => (
          <g key={v} className="chart-grid">
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
            <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end">
              {Math.round(v)}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={d.label} className="chart-xlabel" x={x(i)} y={height - 8} textAnchor="middle">
              {d.label}
            </text>
          ) : null,
        )}
        {series.map((s, si) => {
          const pts = data.map((d, i) => [x(i), y(d.values[s.key] ?? 0)] as const)
          return (
            <g key={s.key} style={{ color: s.color }}>
              {kind === 'line' ? (
                <polyline className="chart-line" points={pts.map((p) => p.join(',')).join(' ')} />
              ) : null}
              {data.map((d, i) => {
                const v = d.values[s.key] ?? 0
                const handlers = {
                  tabIndex: 0,
                  'data-index': i,
                  'data-series': s.key,
                  onMouseEnter: () => setHover({ i, s: s.key }),
                  onMouseLeave: () => setHover(null),
                  onFocus: () => setHover({ i, s: s.key }),
                  onBlur: () => setHover(null),
                  // The name is "label: series" with no value: the number is only in the tooltip.
                  'aria-label': `${d.label}: ${s.label}`,
                }
                return kind === 'bar' ? (
                  <rect
                    key={i}
                    {...handlers}
                    className="chart-bar"
                    x={x(i) - (barW * series.length) / 2 + barW * si}
                    y={y(v)}
                    width={barW - 1}
                    height={Math.max(0, PAD.top + innerH - y(v))}
                  />
                ) : (
                  <circle
                    key={i}
                    {...handlers}
                    className="chart-point"
                    cx={pts[i]![0]}
                    cy={pts[i]![1]}
                    r={4}
                  />
                )
              })}
            </g>
          )
        })}
      </svg>
      {hovered && hoveredSeries ? (
        <div
          className="chart-tip"
          role="tooltip"
          style={{
            left: `${(x(hover!.i) / W) * 100}%`,
            top: `${(y(hovered.values[hoveredSeries.key] ?? 0) / height) * 100}%`,
          }}
        >
          <b>{hovered.label}</b>
          <span>
            <i style={{ background: hoveredSeries.color }} /> {hoveredSeries.label}:{' '}
            <span className="mono">{format(hovered.values[hoveredSeries.key] ?? 0)}</span>
          </span>
        </div>
      ) : null}
      <figcaption className="chart-legend">
        {series.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </figcaption>
    </figure>
  )
}
