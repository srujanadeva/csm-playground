// Grey placeholder shapes shown while content loads, in the shape of what's coming.
// The wrapper is aria-busy with a hidden "Loading" label; the shapes themselves are decorative.
import { useTranslation } from 'react-i18next'
import './data.css'

/** A single bar; width as CSS (e.g. "60%"). */
export function SkeletonLine({ width = '100%', height = 12 }: { width?: string; height?: number }) {
  return <span className="sk" style={{ width, height }} aria-hidden />
}

/** A group of placeholders with the loading semantics. */
export function Skeleton({
  kind,
  rows = 4,
  className,
  testId,
}: {
  kind: 'tiles' | 'lines' | 'header' | 'table'
  rows?: number
  className?: string
  /** Kept for screens whose tests already wait on a loading test id. */
  testId?: string
}) {
  const { t } = useTranslation('ui')
  return (
    <div
      className={`skeleton ${kind} ${className ?? ''}`}
      aria-busy="true"
      role="status"
      data-state="loading"
      data-testid={testId}
    >
      <span className="sr-only">{t('loading')}</span>
      {kind === 'tiles'
        ? Array.from({ length: rows }, (_, i) => (
            <div className="sk-tile" key={i}>
              <SkeletonLine width="40%" height={24} />
              <SkeletonLine width="70%" />
            </div>
          ))
        : null}
      {kind === 'header' ? (
        <div className="sk-header">
          <span className="sk sk-avatar" aria-hidden />
          <div>
            <SkeletonLine width="220px" height={18} />
            <SkeletonLine width="320px" />
          </div>
        </div>
      ) : null}
      {kind === 'lines' || kind === 'table'
        ? Array.from({ length: rows }, (_, i) => (
            <div className={kind === 'table' ? 'sk-row' : 'sk-line'} key={i}>
              <SkeletonLine width={kind === 'table' ? '18%' : `${90 - ((i * 17) % 40)}%`} />
              {kind === 'table' ? (
                <>
                  <SkeletonLine width="32%" />
                  <SkeletonLine width="20%" />
                  <SkeletonLine width="14%" />
                </>
              ) : null}
            </div>
          ))
        : null}
    </div>
  )
}
