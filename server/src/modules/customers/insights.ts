/**
 * Customer 360 extras (Phase 3): the simulated credit bureau score and report, the cross-sell offer,
 * the customer's accounts, and the small card shown when hovering a CIF elsewhere in the app.
 */
import { randomBytes } from 'node:crypto'
import type { Request, Response } from 'express'
import {
  bureauBand,
  maskMobile,
  type BureauScoreDTO,
  type CustomerAccountDTO,
  type CustomerCardDTO,
  type OfferDTO,
} from '@csm/shared'
import { AppError, notFound } from '../../lib/errors.ts'
import { bureauFor, type BureauRecord } from '../../fixtures/bureau.ts'
import { AccountModel } from '../teller/account.model.ts'
import { fullName, formatMobile } from './dto.ts'
import { offerFor } from './offers.ts'
import { findScoped } from './service.ts'

/** Loads a submitted customer (drafts have no bureau record, accounts or offers). */
async function submitted(req: Request, ref: string) {
  const doc = await findScoped(ref, req)
  if (!doc.cif) throw notFound('Customer not found.')
  return doc
}

/**
 * The bureau score.
 * @param fail Practice only: answer as if the bureau were down.
 */
export async function bureauScore(req: Request, ref: string, fail: boolean): Promise<BureauScoreDTO> {
  const doc = await submitted(req, ref)
  if (fail) {
    throw new AppError(503, 'Bureau unavailable', "The credit bureau didn't answer. Try again.", undefined, {
      code: 'bureau_unavailable',
    })
  }
  const r = bureauFor(doc.cif!)
  return r ? { status: 'ready', score: r.score, band: bureauBand(r.score), asOf: r.asOf } : { status: 'none' }
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`
const esc = (v: string) =>
  v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** The full report as a standalone page, framed by Customer 360 below the score panel. */
function reportHtml(name: string, cif: string, r: BureauRecord | null, nonce: string): string {
  const rows = (r?.tradelines ?? [])
    .map(
      (t) =>
        `<tr><td>${esc(t.lender)}</td><td>${t.kind}</td><td>${t.opened}</td><td class="n">${inr(t.limit)}</td><td class="n">${inr(t.balance)}</td><td class="n">${t.worstDpd || '—'}</td></tr>`,
    )
    .join('')
  const enquiries = (r?.enquiries ?? [])
    .map((e) => `<li>${e.date} · ${esc(e.lender)} · ${e.purpose}</li>`)
    .join('')
  const body = r
    ? `<p class="meta">Score <b>${r.score}</b> (${bureauBand(r.score)}) · data as of ${r.asOf}</p>
<h2>Credit facilities</h2><table><thead><tr><th>Lender</th><th>Type</th><th>Opened</th><th class="n">Limit</th><th class="n">Balance</th><th class="n">Worst DPD</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Enquiries in the last 12 months</h2>${enquiries ? `<ul>${enquiries}</ul>` : '<p class="meta">None.</p>'}`
    : '<p class="meta">The bureau holds no record for this customer.</p>'
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Bureau report ${esc(cif)}</title>
<style nonce="${nonce}">body{margin:0;padding:14px 16px;font:13px/1.45 system-ui,sans-serif;color:#15201e}
h1{font-size:15px;margin:0 0 4px}h2{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#5b6967;margin:14px 0 6px}
table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #d9e1df;padding:5px 6px;text-align:left}.n{text-align:right}
.meta{color:#5b6967;margin:0}ul{margin:0;padding-left:18px}</style></head>
<body><h1>${esc(name)} · ${esc(cif)}</h1>${body}</body></html>`
}

/** Sends the bureau report page. Its own CSP: only its nonce'd styles, and only this app may frame it. */
export async function sendBureauReport(req: Request, res: Response, ref: string): Promise<void> {
  const doc = await submitted(req, ref)
  const nonce = randomBytes(16).toString('base64')
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'none'; style-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`,
  )
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  // A framed page must use the same agent-cluster keying as its parent; the dev server's page sends none.
  res.removeHeader('Origin-Agent-Cluster')
  res.type('html').send(reportHtml(fullName(doc.toObject()), doc.cif!, bureauFor(doc.cif!), nonce))
}

/** The one offer to show, if any. */
export async function offer(req: Request, ref: string): Promise<{ offer: OfferDTO | null }> {
  return { offer: offerFor((await submitted(req, ref)).toObject()) }
}

/** The customer's accounts, oldest first. */
export async function accounts(req: Request, ref: string): Promise<{ items: CustomerAccountDTO[] }> {
  const doc = await submitted(req, ref)
  const rows = await AccountModel.find({ cif: doc.cif }).sort({ openedAt: 1 }).lean()
  return {
    items: rows.map((a) => ({
      accountNo: a.accountNo,
      type: a.type,
      status: a.status,
      openedAt: a.openedAt.toISOString(),
    })),
  }
}

/** The hover card: always masked, whatever the caller's PII rights. */
export async function card(req: Request, ref: string): Promise<CustomerCardDTO> {
  const doc = (await findScoped(ref, req)).toObject()
  const mobile = doc.contact?.mobile as string | undefined
  return {
    ref: doc.cif ?? doc.draftNo!,
    name: fullName(doc),
    status: doc.status,
    kycStatus: doc.kyc?.status ?? 'pending',
    riskRating: doc.kyc?.riskRating ?? null,
    branchCode: doc.branchCode,
    mobile: mobile ? maskMobile(formatMobile(mobile)) : '',
  }
}
