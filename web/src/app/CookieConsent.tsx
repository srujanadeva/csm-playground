// Blocking cookie-consent banner for the signed-out pages. Until a choice is made the page behind
// is inert (no clicks, no focus); the choice is kept in this browser. Buttons are found by their
// text only: no ids or test ids, as on many real consent banners.
import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { readStored, writeStored } from '../lib/storage.ts'
import '../modules/auth/public.css'

const KEY = 'csm.cookieConsent'
const VERSION = 1

interface Consent {
  version: number
  analytics: boolean
  personalisation: boolean
  at: string
}

/** The stored choice, if it is for the current banner version. */
export function storedConsent(): Consent | null {
  const c = readStored<Consent | null>(KEY, null)
  return c && c.version === VERSION ? c : null
}

/** Wraps a public page; renders the banner over it until the visitor decides. */
export function CookieConsent({ children }: { children: ReactNode }) {
  const { t } = useTranslation('auth')
  const [consent, setConsent] = useState<Consent | null>(storedConsent)
  const [reopened, setReopened] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [analytics, setAnalytics] = useState(false)
  const [personalisation, setPersonalisation] = useState(false)
  const titleId = useId()
  const open = !consent || reopened

  const decide = (a: boolean, p: boolean) => {
    const c = { version: VERSION, analytics: a, personalisation: p, at: new Date().toISOString() }
    writeStored(KEY, c)
    setConsent(c)
    setReopened(false)
    setChoosing(false)
  }

  return (
    <>
      <div inert={open} className="consent-host">
        {children}
        {!open ? (
          <button type="button" className="consent-reopen" onClick={() => setReopened(true)}>
            {t('consent.settings')}
          </button>
        ) : null}
      </div>
      {open ? (
        <>
          <div className="consent-scrim" />
          <div className="consent" role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <h2 id={titleId}>{t('consent.title')}</h2>
            <p>{t('consent.body')}</p>
            {choosing ? (
              <fieldset>
                <legend className="sr-only">{t('consent.categories')}</legend>
                <label>
                  <input type="checkbox" checked disabled /> <b>{t('consent.necessary')}</b>
                  <span className="help">{t('consent.necessaryHelp')}</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={analytics}
                    onChange={(e) => setAnalytics(e.target.checked)}
                  />{' '}
                  <b>{t('consent.analytics')}</b>
                  <span className="help">{t('consent.analyticsHelp')}</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={personalisation}
                    onChange={(e) => setPersonalisation(e.target.checked)}
                  />{' '}
                  <b>{t('consent.personalisation')}</b>
                  <span className="help">{t('consent.personalisationHelp')}</span>
                </label>
              </fieldset>
            ) : null}
            <div className="consent-actions">
              {choosing ? (
                <button type="button" className="btn" onClick={() => decide(analytics, personalisation)}>
                  {t('consent.save')}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setAnalytics(consent?.analytics ?? false)
                    setPersonalisation(consent?.personalisation ?? false)
                    setChoosing(true)
                  }}
                >
                  {t('consent.choose')}
                </button>
              )}
              <div className="grow" />
              <button type="button" className="btn" onClick={() => decide(false, false)}>
                {t('consent.reject')}
              </button>
              <button type="button" className="btn pri" onClick={() => decide(true, true)}>
                {t('consent.accept')}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </>
  )
}
