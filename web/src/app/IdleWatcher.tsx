/**
 * Idle timeout (OWASP A07). The server ends a session after a period without requests; this
 * keeps an active user signed in (a light /auth/me ping when they interact) and warns an
 * inactive one two minutes before the end, with a countdown and a "Stay signed in" button.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from './auth.tsx'
import { Modal } from '../components/Overlay.tsx'

const WARN_BEFORE_MS = 2 * 60_000
const PING_EVERY_MS = 60_000

/** Mount once inside the signed-in shell. */
export function IdleWatcher() {
  const { me, refresh, signOut } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const lastActivity = useRef(0)
  const lastPing = useRef(0)
  const [remaining, setRemaining] = useState<number | null>(null)
  const idleMs = (me?.session.idleTimeoutSeconds ?? 900) * 1000

  useEffect(() => {
    lastActivity.current = Date.now()
    lastPing.current = Date.now()
  }, [])

  useEffect(() => {
    const mark = () => {
      lastActivity.current = Date.now()
      if (Date.now() - lastPing.current > PING_EVERY_MS && remaining === null) {
        lastPing.current = Date.now()
        void refresh()
      }
    }
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }))
    return () => events.forEach((e) => window.removeEventListener(e, mark))
  }, [refresh, remaining])

  useEffect(() => {
    const timer = setInterval(() => {
      const left = idleMs - (Date.now() - lastActivity.current)
      if (left <= 0) {
        clearInterval(timer)
        void signOut().then(() => navigate('/login?reason=idle', { replace: true }))
      } else if (left <= WARN_BEFORE_MS) {
        setRemaining(Math.ceil(left / 1000))
      } else {
        setRemaining(null)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [idleMs, navigate, signOut])

  if (remaining === null) return null
  const mm = Math.floor(remaining / 60)
  const ss = String(remaining % 60).padStart(2, '0')
  const stay = () => {
    lastActivity.current = Date.now()
    lastPing.current = Date.now()
    setRemaining(null)
    void refresh()
  }
  return (
    <Modal
      testId="idle-warning"
      title={t('idle.title')}
      onClose={stay}
      footer={
        <>
          <button
            type="button"
            className="btn"
            data-testid="idle-warning-signout"
            onClick={() => void signOut().then(() => navigate('/login'))}
          >
            {t('signOut')}
          </button>
          <button
            type="button"
            className="btn pri"
            data-testid="idle-warning-stay"
            onClick={stay}
            data-autofocus
          >
            {t('idle.stay')}
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>
        {t('idle.message')}{' '}
        <b className="mono" data-testid="idle-warning-countdown">
          {mm}:{ss}
        </b>
      </p>
    </Modal>
  )
}
