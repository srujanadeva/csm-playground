/**
 * The simulated e-KYC provider, served on its own port (MOCK_PROVIDER_PORT, default 4002) so it is a
 * different origin from the app: the app frames it and the two talk only by postMessage.
 * It may be framed only by the app's origins, and posts its result only to the validated parent.
 */
import { randomBytes } from 'node:crypto'
import express, { type Express, type Response } from 'express'
import helmet from 'helmet'
import { EKYC_RESULT_MESSAGE, EKYC_SIMULATIONS, type EkycResultDTO } from '@csm/shared'
import type { Config } from '../config.ts'
import { completeSession, openSession } from '../modules/kyc/service.ts'

const OUTCOME_LABELS: Record<(typeof EKYC_SIMULATIONS)[number], string> = {
  match: 'Details match the registry',
  name_mismatch: 'Registry name differs',
  dob_mismatch: 'Registry date of birth differs',
  not_found: 'No record found',
}

const esc = (v: string) =>
  v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** "1994-03-12" → "••/••/1994": the provider shows only the year of the details it was given. */
const maskDob = (dob: string) => (dob ? `••/••/${dob.slice(0, 4)}` : '—')

const STYLE = `*{box-sizing:border-box}body{margin:0;padding:18px;font:14px/1.45 system-ui,sans-serif;color:#1d2433;background:#f3f6fb}
header{display:flex;align-items:center;gap:8px;margin-bottom:12px}.logo{width:26px;height:26px;border-radius:6px;background:#3949ab}
h1{font-size:16px;margin:0}.origin{font:11px monospace;color:#5c6b8a}dl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:0 0 12px}
dt{color:#5c6b8a}dd{margin:0;font-weight:600}fieldset{border:1px solid #c9d3e6;border-radius:8px;padding:10px 12px;margin:0 0 12px}
legend{font-size:12px;color:#5c6b8a;padding:0 4px}label{display:flex;gap:8px;align-items:center;margin:4px 0}
.row{display:flex;gap:8px}button{font:inherit;padding:8px 14px;border-radius:6px;border:1px solid #3949ab;cursor:pointer}
.go{background:#3949ab;color:#fff}.no{background:#fff;color:#3949ab}.err{color:#b3261e}.done{padding:16px;background:#fff;border-radius:8px}`

/** Sends a provider page with a fresh nonce for its one style block and script. Only the app may frame it. */
function page(res: Response, config: Config, body: string, script = '') {
  const nonce = randomBytes(16).toString('base64')
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'none'",
      `style-src 'nonce-${nonce}'`,
      `script-src 'nonce-${nonce}'`,
      "form-action 'self'",
      "base-uri 'none'",
      `frame-ancestors ${config.CORS_ORIGINS.join(' ')}`,
    ].join('; '),
  )
  res.setHeader('Cache-Control', 'no-store')
  res.type('html')
    .send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>IndiaVerify e-KYC (simulator)</title>
<style nonce="${nonce}">${STYLE}</style></head><body>
<header><span class="logo" aria-hidden="true"></span><div><h1>IndiaVerify e-KYC</h1><div class="origin" id="provider-origin"></div></div></header>
${body}
<script nonce="${nonce}">document.getElementById('provider-origin').textContent = location.origin + ' · simulator';${script}</script>
</body></html>`)
}

/** Builds the provider app. No database connection of its own: it shares the API process's. */
export function createMockProviderApp(config: Config): Express {
  const app = express()
  app.disable('x-powered-by')
  // Helmet for the rest of the baseline; the CSP is per page (nonce) and set in page().
  app.use(helmet({ contentSecurityPolicy: false, frameguard: false, strictTransportSecurity: false }))
  app.use(express.urlencoded({ extended: false, limit: '2kb' }))

  const validParent = (v: unknown) => (typeof v === 'string' && config.CORS_ORIGINS.includes(v) ? v : null)

  // GET /ekyc?session=…&parent=<app origin>
  app.get('/ekyc', async (req, res) => {
    const sessionId = String(req.query.session ?? '')
    const parent = validParent(req.query.parent)
    const s = await openSession(sessionId)
    if (!s || !parent) {
      page(
        res.status(404),
        config,
        '<p class="err" role="alert">This verification link is no longer valid.</p>',
      )
      return
    }
    const options = EKYC_SIMULATIONS.map(
      (o, i) =>
        `<label><input type="radio" name="outcome" value="${o}"${i === 0 ? ' checked' : ''}> ${OUTCOME_LABELS[o]}</label>`,
    ).join('')
    page(
      res,
      config,
      `<form method="post" action="/ekyc/complete" id="ekyc-form">
<input type="hidden" name="session" value="${esc(sessionId)}"><input type="hidden" name="parent" value="${esc(parent)}">
<dl><dt>Name</dt><dd id="ekyc-name">${esc(s.expectedName || '—')}</dd><dt>Date of birth</dt><dd>${esc(maskDob(s.expectedDob))}</dd></dl>
<fieldset><legend>Simulate the registry's answer (practice only)</legend>${options}</fieldset>
<label><input type="checkbox" name="consent" value="yes" id="ekyc-consent"> The customer consents to share their identity details with the bank.</label>
<p class="err" id="ekyc-error" role="alert" hidden>The customer must consent before verifying.</p>
<div class="row"><button type="submit" class="go" name="action" value="verify">Verify identity</button>
<button type="submit" class="no" name="action" value="cancel" formnovalidate>Cancel</button></div></form>`,
      `document.getElementById('ekyc-form').addEventListener('submit', function (e) {
  if (e.submitter && e.submitter.value === 'verify' && !document.getElementById('ekyc-consent').checked) {
    e.preventDefault(); document.getElementById('ekyc-error').hidden = false;
  }
});`,
    )
  })

  // POST /ekyc/complete (form: session, parent, action, outcome, consent)
  app.post('/ekyc/complete', async (req, res) => {
    const body = req.body as Record<string, string | undefined>
    const parent = validParent(body.parent)
    const cancel = body.action === 'cancel'
    const outcome = EKYC_SIMULATIONS.find((o) => o === body.outcome)
    if (!parent || (!cancel && (!outcome || body.consent !== 'yes'))) {
      page(
        res.status(400),
        config,
        '<p class="err" role="alert">Something was missing. Close this window and start again.</p>',
      )
      return
    }
    const result: EkycResultDTO | null = await completeSession(
      String(body.session ?? ''),
      cancel ? 'cancel' : outcome!,
    )
    if (!result) {
      page(
        res.status(410),
        config,
        '<p class="err" role="alert">This verification link is no longer valid.</p>',
      )
      return
    }
    const text =
      result.status === 'verified'
        ? `Verified. Reference ${esc(result.reference ?? '')}.`
        : result.status === 'cancelled'
          ? 'Verification cancelled.'
          : 'We could not verify this customer.'
    // Only the session id and status travel by message; the app reads the details from its own API.
    const message = JSON.stringify({
      type: EKYC_RESULT_MESSAGE,
      sessionId: result.sessionId,
      status: result.status,
    })
    page(
      res,
      config,
      `<div class="done" role="status" id="ekyc-done">${text} You can return to the bank's screen.</div>`,
      `window.parent.postMessage(${message.replace(/</g, '\\u003c')}, ${JSON.stringify(parent)});`,
    )
  })

  app.use((_req, res) => {
    res.status(404).type('text').send('Not found')
  })
  return app
}
