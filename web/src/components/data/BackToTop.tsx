// A floating button that appears once the page has scrolled a screen down and scrolls back up.
// Icon-only: its only hooks are the title and aria-label.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../Icon.tsx'
import './data.css'

/** Mount once on a long page. */
export function BackToTop({ threshold = 600 }: { threshold?: number }) {
  const { t } = useTranslation('ui')
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > threshold)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])
  if (!shown) return null
  return (
    <button
      type="button"
      className="to-top"
      title={t('toTop')}
      aria-label={t('toTop')}
      onClick={() => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
        document.getElementById('main')?.focus({ preventScroll: true })
      }}
    >
      <span style={{ display: 'inline-flex', transform: 'rotate(90deg)' }}>
        <Icon name="back" />
      </span>
    </button>
  )
}
