// A rotating carousel: previous/next, one dot per slide, pause/play, and auto-advance that pauses
// while the pointer or keyboard focus is inside. Only the current slide is visible; the others stay
// in the DOM with aria-hidden, so tests must check visibility, not just presence.
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import './media.css'

interface Props {
  slides: { key: string; content: ReactNode; label: string }[]
  label: string
  /** ms between slides; 0 disables auto-advance. */
  interval?: number
}

/** The carousel region. */
export function Carousel({ slides, label, interval = 6000 }: Props) {
  const { t } = useTranslation('ui')
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(interval > 0)
  const [hold, setHold] = useState(false)
  const n = slides.length
  const go = (i: number) => setIndex(((i % n) + n) % n)
  useEffect(() => {
    if (!playing || hold || n < 2 || interval <= 0) return
    const id = setInterval(() => setIndex((i) => (i + 1) % n), interval)
    return () => clearInterval(id)
  }, [playing, hold, n, interval])
  if (!n) return null
  return (
    <section
      className="carousel"
      aria-roledescription="carousel"
      aria-label={label}
      data-index={index}
      data-playing={playing}
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => setHold(false)}
      onFocus={() => setHold(true)}
      onBlur={() => setHold(false)}
    >
      {/* Announce slide changes only when the user moves; auto-rotation would be noisy. */}
      <div className="carousel-track" aria-live={playing ? 'off' : 'polite'}>
        {slides.map((s, i) => (
          <div
            key={s.key}
            className={`carousel-slide ${i === index ? 'current' : ''}`}
            role="group"
            aria-roledescription="slide"
            aria-label={t('carousel.slideOf', { n: i + 1, total: n, label: s.label })}
            aria-hidden={i !== index}
            inert={i !== index}
          >
            {s.content}
          </div>
        ))}
      </div>
      <div className="carousel-controls">
        <button
          type="button"
          className="carousel-btn"
          aria-label={playing ? t('carousel.pause') : t('carousel.play')}
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <button
          type="button"
          className="carousel-btn"
          aria-label={t('carousel.prev')}
          onClick={() => go(index - 1)}
        >
          ‹
        </button>
        <div className="carousel-dots">
          {slides.map((s, i) => (
            <button
              key={s.key}
              type="button"
              className="carousel-dot"
              aria-label={t('carousel.goTo', { n: i + 1 })}
              aria-current={i === index ? 'true' : undefined}
              onClick={() => go(i)}
            />
          ))}
        </div>
        <button
          type="button"
          className="carousel-btn"
          aria-label={t('carousel.next')}
          onClick={() => go(index + 1)}
        >
          ›
        </button>
      </div>
    </section>
  )
}
