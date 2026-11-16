// Takes a photo with the device camera (getUserMedia), with a file-upload fallback when the camera
// is unavailable or permission is refused. data-state: idle | requesting | live | captured |
// denied | unsupported. The camera is always stopped on capture, cancel and unmount.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../Icon.tsx'
import './media.css'

type CamState = 'idle' | 'requesting' | 'live' | 'captured' | 'denied' | 'unsupported'

interface Props {
  label: string
  /** The photo as a JPEG (or the uploaded file), or null when retaking. */
  onChange: (photo: Blob | null) => void
  /** name on the fallback file input. */
  fallbackName?: string
  /** Icon buttons named only by their title (and aria-label), instead of text buttons. */
  iconOnly?: boolean
}

const ICONS = { start: 'camera', capture: 'check', cancel: 'x', retake: 'refresh', upload: 'upload' } as const

/** Preview + Start camera / Capture / Retake, and the upload fallback. */
export function CameraCapture({ label, onChange, fallbackName, iconOnly }: Props) {
  const { t } = useTranslation('ui')
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const [state, setState] = useState<CamState>(() =>
    // mediaDevices is missing entirely on plain-HTTP pages, despite what the DOM types say.
    typeof navigator.mediaDevices?.getUserMedia === 'function' ? 'idle' : 'unsupported',
  )
  const [preview, setPreview] = useState<string | null>(null)
  /** Button text, or an icon with a title when iconOnly. */
  const face = (key: keyof typeof ICONS): { content: ReactNode; title?: string; 'aria-label'?: string } =>
    iconOnly
      ? { content: <Icon name={ICONS[key]} />, title: t(`camera.${key}`), 'aria-label': t(`camera.${key}`) }
      : { content: t(`camera.${key}`) }
  const icon = iconOnly ? ' icon' : ''

  const stop = () => {
    stream.current?.getTracks().forEach((tr) => tr.stop())
    stream.current = null
  }
  useEffect(() => () => stop(), [])
  // Revoke each preview URL when it is replaced, so blobs aren't kept alive.
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview])

  const start = async () => {
    setState('requesting')
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 } },
        audio: false,
      })
      setState('live')
      if (video.current) {
        video.current.srcObject = stream.current
        await video.current.play()
      }
    } catch (err) {
      stop()
      setState((err as DOMException)?.name === 'NotAllowedError' ? 'denied' : 'unsupported')
    }
  }
  const capture = () => {
    const v = video.current
    // No frame yet (the stream is still starting): a 0×0 canvas would give no photo.
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d')?.drawImage(v, 0, 0)
    c.toBlob(
      (b) => {
        stop()
        if (!b) return
        setPreview(URL.createObjectURL(b))
        setState('captured')
        onChange(b)
      },
      'image/jpeg',
      0.9,
    )
  }
  const retake = () => {
    setPreview(null)
    onChange(null)
    void start()
  }

  return (
    <div className="camera" data-state={state}>
      <div className="camera-view" aria-label={label} role="group">
        {state === 'captured' && preview ? (
          <img src={preview} alt={t('camera.preview')} />
        ) : (
          <video ref={video} muted playsInline hidden={state !== 'live'} />
        )}
        {state === 'idle' || state === 'requesting' ? (
          <span className="help">{state === 'requesting' ? t('camera.requesting') : t('camera.off')}</span>
        ) : null}
        {state === 'denied' || state === 'unsupported' ? (
          <span className="note warn" role="alert">
            {t(state === 'denied' ? 'camera.denied' : 'camera.unsupported')}
          </span>
        ) : null}
      </div>
      <div className="camera-bar">
        {state === 'idle' || state === 'requesting' ? (
          <button
            type="button"
            className={`btn sm pri${icon}`}
            disabled={state === 'requesting'}
            title={face('start').title}
            aria-label={face('start')['aria-label']}
            onClick={() => void start()}
          >
            {face('start').content}
          </button>
        ) : null}
        {state === 'live' ? (
          <>
            <button
              type="button"
              className={`btn sm pri${icon}`}
              title={face('capture').title}
              aria-label={face('capture')['aria-label']}
              onClick={capture}
            >
              {face('capture').content}
            </button>
            <button
              type="button"
              className={`btn sm${icon}`}
              title={face('cancel').title}
              aria-label={face('cancel')['aria-label']}
              onClick={() => {
                stop()
                setState('idle')
              }}
            >
              {face('cancel').content}
            </button>
          </>
        ) : null}
        {state === 'captured' ? (
          <button
            type="button"
            className={`btn sm${icon}`}
            title={face('retake').title}
            aria-label={face('retake')['aria-label']}
            onClick={retake}
          >
            {face('retake').content}
          </button>
        ) : null}
        <label className={`btn sm ghost camera-upload${icon}`} title={face('upload').title}>
          {face('upload').content}
          {iconOnly ? <span className="sr-only">{t('camera.upload')}</span> : null}
          <input
            type="file"
            name={fallbackName}
            accept="image/jpeg,image/png"
            capture="user"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              stop()
              setPreview(URL.createObjectURL(f))
              setState('captured')
              onChange(f)
            }}
          />
        </label>
      </div>
    </div>
  )
}
