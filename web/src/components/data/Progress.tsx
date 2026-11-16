// A progress bar in four states: active (determinate when `value` is given, indeterminate when not),
// stalled (no progress for a while: striped amber), failed (red) and done. data-state reports which.
import './data.css'

export type ProgressState = 'active' | 'stalled' | 'failed' | 'done'

interface Props {
  /** 0–100; leave out for indeterminate. */
  value?: number
  state?: ProgressState
  label: string
  /** Text under the bar ("Importing 340 of 1,200 rows"). */
  detail?: string
  className?: string
}

/** role="progressbar" with aria-valuenow only when determinate (as ARIA requires). */
export function Progress({ value, state = 'active', label, detail, className }: Props) {
  const determinate = value !== undefined
  const pct = determinate ? Math.max(0, Math.min(100, Math.round(value))) : undefined
  return (
    <div
      className={`progress ${state} ${determinate ? '' : 'indeterminate'} ${className ?? ''}`}
      data-state={state}
    >
      <div className="progress-head">
        <span>{label}</span>
        {determinate ? <span className="mono">{pct}%</span> : null}
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={determinate ? 0 : undefined}
        aria-valuemax={determinate ? 100 : undefined}
        aria-valuenow={pct}
        aria-valuetext={detail}
        aria-invalid={state === 'failed' || undefined}
      >
        <b style={determinate ? { width: `${pct}%` } : undefined} />
      </div>
      {detail ? <span className="help">{detail}</span> : null}
    </div>
  )
}
