/**
 * Translations: English and Kannada. Each module has its own namespace file in
 * locales/<lang>/<namespace>.json, loaded the first time a screen needs it. Locators never
 * depend on translated text, so tests work in either language.
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import resourcesToBackend from 'i18next-resources-to-backend'
import type { Language } from '@csm/shared'

export const LANG_STORAGE_KEY = 'csm.lang'

/** True once this browser has an explicit language choice (it then wins over the server's). */
export function hasStoredLanguage(): boolean {
  try {
    return localStorage.getItem(LANG_STORAGE_KEY) !== null
  } catch {
    return false
  }
}

function initialLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY)
    if (stored === 'en' || stored === 'kn') return stored
  } catch {
    // Storage can be unavailable (private mode); fall back to English.
  }
  return 'en'
}

void i18n
  .use(initReactI18next)
  .use(resourcesToBackend((lang: string, ns: string) => import(`./locales/${lang}/${ns}.json`)))
  .init({
    lng: initialLanguage(),
    fallbackLng: 'en',
    supportedLngs: ['en', 'kn'],
    ns: ['common', 'validation'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    react: { useSuspense: true },
  })

document.documentElement.lang = i18n.language

i18n.on('languageChanged', (lang) => {
  document.documentElement.lang = lang
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang)
  } catch {
    // Not fatal: the server also remembers the choice per user.
  }
})

export default i18n
