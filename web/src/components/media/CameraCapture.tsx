// Takes a photo with the device camera (getUserMedia), with a file-upload fallback when the camera
// is unavailable or permission is refused. data-state: idle | requesting | live | captured |
// denied | unsupported. The camera is always stopped on capture, cancel and unmount.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './media.css'

type CamState = 'idle' | 'requesting' | 'live' | 'captured' | 'denied' | 'unsupported'

interface Props {
  label: string
  /** The photo as a JPEG (or the uploaded file), or null when retaking. */
  onChange: (photo: Blob | null) => void
  /** name on the fallback file input. */
  fallbackName?: string
}

/** Preview + Start camera / Capture / Retake, and the upload fallback. */
export function CameraCapture({ label, onChange, fallbackName }: Props) {
  const { t } = useTranslation('ui')
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const [state, setState] = useState<CamState>(() =>
    // mediaDevices is missing entirely on plain-HTTP pages, despite what the DOM types say.
    typeof navigator.mediaDevices?.getUserMedia === 'function' ? 'idle' : 'unsupported',
  )
  const [preview, setPreview] = useState<string | null>(null)

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
    if (!v) return
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
            className="btn sm pri"
            disabled={state === 'requesting'}
            onClick={() => void start()}
          >
            {t('camera.start')}
          </button>
        ) : null}
        {state === 'live' ? (
          <>
            <button type="button" className="btn sm pri" onClick={capture}>
              {t('camera.capture')}
            </button>
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                stop()
                setState('idle')
              }}
            >
              {t('camera.cancel')}
            </button>
          </>
        ) : null}
        {state === 'captured' ? (
          <button type="button" className="btn sm" onClick={retake}>
            {t('camera.retake')}
          </button>
        ) : null}
        <label className="btn sm ghost camera-upload">
          {t('camera.upload')}
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
