// Renders only the rows in view (plus a few either side) out of a list of any length, so a row
// that is scrolled away does not exist in the DOM. Rows carry data-index; aria-rowcount gives the total.
import { useRef, useState, type ReactNode } from 'react'
import './data.css'

interface Props {
  count: number
  rowHeight: number
  height: number
  renderRow: (index: number) => ReactNode
  /** Rows rendered beyond each edge, so fast scrolling doesn't show gaps. */
  overscan?: number
  label: string
  /** Called when the last rows come into view (to fetch more). */
  onEndReached?: () => void
}

/** The scrolling viewport (role="grid") with absolutely positioned rows. */
export function VirtualList({
  count,
  rowHeight,
  height,
  renderRow,
  overscan = 6,
  label,
  onEndReached,
}: Props) {
  const [top, setTop] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const first = Math.max(0, Math.floor(top / rowHeight) - overscan)
  const last = Math.min(count - 1, Math.ceil((top + height) / rowHeight) + overscan)
  const rows = []
  for (let i = first; i <= last; i++) {
    rows.push(
      <div
        key={i}
        className="vrow"
        role="row"
        aria-rowindex={i + 1}
        data-index={i}
        style={{ top: i * rowHeight, height: rowHeight }}
      >
        {renderRow(i)}
      </div>,
    )
  }
  return (
    <div
      ref={ref}
      className="vlist"
      role="grid"
      aria-label={label}
      aria-rowcount={count}
      tabIndex={0}
      data-first={first}
      data-last={last}
      style={{ height }}
      onScroll={(e) => {
        const t = e.currentTarget.scrollTop
        setTop(t)
        if (onEndReached && t + height >= count * rowHeight - rowHeight * 3) onEndReached()
      }}
      onKeyDown={(e) => {
        // Page keys and Home/End are native on a focused scroller; arrows step one row.
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          ref.current?.scrollBy({ top: e.key === 'ArrowDown' ? rowHeight : -rowHeight })
        }
      }}
    >
      <div className="vlist-inner" style={{ height: count * rowHeight }}>
        {rows}
      </div>
    </div>
  )
}
