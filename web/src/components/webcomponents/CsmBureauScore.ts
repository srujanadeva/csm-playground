// <csm-bureau-score state="ready" score="742" band="Good" updated="2026-11-02">: a credit bureau
// widget in an open shadow root. It contains a nested <csm-gauge> (a second shadow root) and two
// slots: a named "footer" slot and the default slot, so light-DOM content is projected inside.
// Text comes from attributes (heading, band-text, loading-text, error-text, none-text, updated-text "Updated {date}")
// so the host page can translate it; the English defaults are only a fallback.
import { define, sheet } from './sheet.ts'
import './CsmGauge.ts'

const CSS = sheet(`
  :host { display: block; border: 1px solid #d9e1df; border-radius: 8px; background: #fff;
    padding: 14px 16px; font: 14px/1.45 'IBM Plex Sans', system-ui, sans-serif; color: #15201e; }
  header { display: flex; justify-content: space-between; align-items: baseline; }
  h3 { margin: 0; font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: #5b6967; }
  .band { font-weight: 600; padding: 2px 8px; border-radius: 999px; font-size: 12px; }
  .band[data-band="Excellent"], .band[data-band="Good"] { background: #e3f3e8; color: #1e7f45; }
  .band[data-band="Fair"] { background: #fbf0dc; color: #a86a12; }
  .band[data-band="Poor"] { background: #fde8e6; color: #b42318; }
  .body { display: flex; gap: 16px; align-items: center; margin-top: 8px; }
  .meta { font-size: 12px; color: #5b6967; }
  .msg { color: #5b6967; font-size: 13px; padding: 18px 0; }
  .msg.error { color: #b42318; }
  footer { margin-top: 10px; border-top: 1px solid #d9e1df; padding-top: 8px; font-size: 12px; }
`)

/** States: loading | ready | error | none (no bureau record). */
export class CsmBureauScore extends HTMLElement {
  static observedAttributes = [
    'state',
    'score',
    'band',
    'updated',
    'heading',
    'loading-text',
    'error-text',
    'none-text',
    'updated-text',
    'band-text',
  ]
  #root: ShadowRoot

  constructor() {
    super()
    this.#root = this.attachShadow({ mode: 'open' })
    this.#root.adoptedStyleSheets = [CSS]
  }

  connectedCallback() {
    this.render()
  }

  attributeChangedCallback() {
    if (this.isConnected) this.render()
  }

  private render() {
    const state = this.getAttribute('state') ?? 'loading'
    const heading = this.getAttribute('heading') ?? 'Credit score'
    const score = this.getAttribute('score') ?? ''
    const band = this.getAttribute('band') ?? ''
    const updated = this.getAttribute('updated') ?? ''
    // Values are written with textContent below, never into the HTML string, so they can't inject markup.
    this.#root.innerHTML = `
      <header><h3 part="heading"></h3><span class="band" part="band"></span></header>
      <div class="content"></div>
      <slot></slot>
      <footer><slot name="footer"></slot></footer>`
    this.#root.querySelector('h3')!.textContent = heading
    const bandEl = this.#root.querySelector<HTMLElement>('.band')!
    const content = this.#root.querySelector('.content')!
    if (state === 'ready') {
      // `band` is the English key (it drives the colour); `band-text` is what's shown.
      bandEl.textContent = this.getAttribute('band-text') ?? band
      bandEl.dataset.band = band
      content.innerHTML = `<div class="body"><csm-gauge min="300" max="900"></csm-gauge><div class="meta"></div></div>`
      content.querySelector('csm-gauge')!.setAttribute('value', score)
      const updatedText = this.getAttribute('updated-text') ?? 'Updated {date}'
      content.querySelector('.meta')!.textContent = updated ? updatedText.replace('{date}', updated) : ''
    } else {
      bandEl.remove()
      const msg = document.createElement('div')
      msg.className = `msg ${state === 'error' ? 'error' : ''}`
      msg.setAttribute('role', state === 'error' ? 'alert' : 'status')
      msg.textContent =
        state === 'error'
          ? (this.getAttribute('error-text') ?? 'Bureau unavailable')
          : state === 'none'
            ? (this.getAttribute('none-text') ?? 'No bureau record')
            : (this.getAttribute('loading-text') ?? 'Fetching bureau score…')
      content.append(msg)
    }
  }
}

define('csm-bureau-score', CsmBureauScore)
