// An image that reports its state (data-state: loading | loaded | broken) and swaps in a fallback
// when it fails, e.g. a customer's initials when their photo is missing.
import { useRef, useState, type ReactNode } from 'react'
import { useInView } from './useInView.ts'
import './media.css'

interface Props {
  src: string
  alt: string
  /** Shown instead of the image when it fails to load. */
  fallback: ReactNode
  /** Loads only near the viewport (IntersectionObserver, not just loading="lazy"). */
  lazy?: boolean
  className?: string
  width?: number
  height?: number
}

/** <img> with loading/broken states. */
export function SafeImage({ src, alt, fallback, lazy, className, width, height }: Props) {
  const box = useRef<HTMLSpanElement>(null)
  const visible = useInView(box, !!lazy)
  const [state, setState] = useState<{ src: string; status: 'loading' | 'loaded' | 'broken' }>({
    src,
    status: 'loading',
  })
  // A new src starts over (stored state is for the previous image).
  const status = state.src === src ? state.status : 'loading'
  return (
    <span
      ref={box}
      className={`safeimg ${status} ${className ?? ''}`}
      data-state={visible ? status : 'deferred'}
      style={{ width, height }}
    >
      {status === 'broken' ? (
        <span className="safeimg-fallback" role="img" aria-label={alt}>
          {fallback}
        </span>
      ) : visible ? (
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={lazy ? 'lazy' : undefined}
          onLoad={() => setState({ src, status: 'loaded' })}
          onError={() => setState({ src, status: 'broken' })}
        />
      ) : null}
    </span>
  )
}
