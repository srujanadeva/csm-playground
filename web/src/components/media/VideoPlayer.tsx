// A video with its own play/pause, mute and seek controls (the native controls are off), a
// loading state, an error state for a missing file, and optional lazy loading: the source is only
// attached once the player scrolls into view. The <video> exposes data-state for tests.
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useInView } from './useInView.ts'
import './media.css'

interface Props {
  src: string
  title: string
  poster?: string
  lazy?: boolean
  className?: string
}

type State = 'deferred' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error'

/** "1:05" from seconds. */
function clock(s: number): string {
  if (!Number.isFinite(s)) return '0:00'
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

/** The player. Buttons are icon-only and found by title / aria-label. */
export function VideoPlayer({ src, title, poster, lazy, className }: Props) {
  const { t } = useTranslation('ui')
  const box = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const visible = useInView(box, !!lazy)
  const [state, setState] = useState<State>('loading')
  const [muted, setMuted] = useState(true)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const shown: State = visible ? state : 'deferred'

  const toggle = () => {
    const v = video.current
    if (!v) return
    if (v.paused) void v.play().catch(() => setState('error'))
    else v.pause()
  }
  return (
    <div ref={box} className={`player ${className ?? ''}`} data-state={shown}>
      {visible ? (
        <video
          ref={video}
          src={src}
          poster={poster}
          muted={muted}
          playsInline
          preload="metadata"
          aria-label={title}
          data-state={shown}
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration)
            setState('ready')
          }}
          onPlay={() => setState('playing')}
          onPause={() => setState('paused')}
          onEnded={() => setState('ended')}
          onError={() => setState('error')}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onClick={toggle}
        />
      ) : (
        <div className="player-placeholder">{t('video.deferred')}</div>
      )}
      {shown === 'error' ? (
        <div className="player-error" role="alert">
          {t('video.error')}
        </div>
      ) : null}
      {shown === 'loading' ? (
        <div className="player-loading">
          <span className="spin" />
        </div>
      ) : null}
      <div className="player-bar">
        <button
          type="button"
          title={shown === 'playing' ? t('video.pause') : t('video.play')}
          aria-label={shown === 'playing' ? t('video.pause') : t('video.play')}
          disabled={!['ready', 'playing', 'paused', 'ended'].includes(shown)}
          onClick={toggle}
        >
          {shown === 'playing' ? '❚❚' : '▶'}
        </button>
        <input
          type="range"
          className="player-seek"
          aria-label={t('video.seek')}
          aria-valuetext={`${clock(time)} / ${clock(duration)}`}
          min={0}
          max={duration || 0}
          step={0.1}
          value={time}
          disabled={!duration}
          onChange={(e) => {
            if (video.current) video.current.currentTime = Number(e.target.value)
          }}
        />
        <span className="mono player-time">
          {clock(time)} / {clock(duration)}
        </span>
        <button
          type="button"
          title={muted ? t('video.unmute') : t('video.mute')}
          aria-label={muted ? t('video.unmute') : t('video.mute')}
          aria-pressed={muted}
          onClick={() => setMuted((m) => !m)}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </div>
    </div>
  )
}
