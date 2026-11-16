// Layout for the signed-out pages (sign-in, forgot password, request access): brand panel on the
// left, the form card on the right, all behind the blocking cookie-consent banner.
import type { ReactNode } from 'react'
import { CookieConsent } from '../../app/CookieConsent.tsx'
import { AuthAside } from './LoginPage.tsx'
import './public.css'

/** Brand panel + centred content, behind the consent banner. */
export function PublicLayout({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <CookieConsent>
      <div className="login">
        <AuthAside />
        <div className={`lform ${wide ? 'wide' : ''}`}>{children}</div>
      </div>
    </CookieConsent>
  )
}
