/**
 * Display formatting for the Indian locale: dd/mm/yyyy dates, ₹ with lakh/crore grouping,
 * and labels picked from { en, kn } objects for the current language.
 */
import type { Labels } from '@csm/shared'

const locale = (lang: string) => (lang === 'kn' ? 'kn-IN' : 'en-IN')

/** "2026-10-05" or an ISO timestamp → "05/10/2026". */
export function formatDate(value: string | null | undefined, lang = 'en'): string {
  if (!value) return '—'
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat(locale(lang), { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    d,
  )
}

/** ISO timestamp → "05/10/2026, 10:42". */
export function formatDateTime(value: string | null | undefined, lang = 'en'): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat(locale(lang), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

/** ISO timestamp → "10:42". */
export function formatTime(value: string | Date, lang = 'en'): string {
  return new Intl.DateTimeFormat(locale(lang), { hour: '2-digit', minute: '2-digit', hour12: false }).format(
    new Date(value),
  )
}

/** 120000 → "₹1,20,000". */
export function formatInr(amount: number | null | undefined, lang = 'en'): string {
  if (amount === null || amount === undefined) return '—'
  return new Intl.NumberFormat(locale(lang), {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

/** 1248 → "1,248". */
export function formatNumber(n: number, lang = 'en'): string {
  return new Intl.NumberFormat(locale(lang)).format(n)
}

/** Picks the label for the current language. */
export function label(labels: Labels | undefined, lang: string): string {
  if (!labels) return ''
  return lang === 'kn' ? labels.kn || labels.en : labels.en
}

/** "Kavya Hegde" → "KH" */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

/** Time until an SLA, as hours/days, or how long it is overdue (negative). */
export function slaParts(slaDueAt: string, now = Date.now()): { late: boolean; hours: number; days: number } {
  const diffH = (new Date(slaDueAt).getTime() - now) / 3_600_000
  const abs = Math.abs(diffH)
  return { late: diffH < 0, hours: Math.max(1, Math.round(abs)), days: Math.round(abs / 24) }
}

/** Local date + time inputs → ISO timestamp. */
export function toIso(date: string, time: string): string {
  return new Date(`${date}T${time || '00:00'}`).toISOString()
}

/** A Date → local "YYYY-MM-DD" and "HH:MM" for date/time inputs. */
export function toLocalInputs(d: Date): { date: string; time: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

/** Paise → "₹1,84,250.75" (balances keep paise; cash amounts show ".00"). */
export function formatPaise(paise: number | null | undefined, lang = 'en'): string {
  if (paise === null || paise === undefined) return '—'
  return new Intl.NumberFormat(locale(lang), {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(paise / 100)
}
