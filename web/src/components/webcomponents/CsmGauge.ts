// <csm-gauge value="742" min="300" max="900">: a half-circle gauge in an open shadow root.
// Used inside <csm-bureau-score>, so reaching it means piercing two shadow roots.
import { define, sheet } from './sheet.ts'

const CSS = sheet(`
  :host { display: inline-block; width: 160px; font-family: inherit; }
  svg { width: 100%; height: auto; display: block; }
  .track { stroke: #d9e1df; }
  .fill { stroke: var(--gauge-color, #0d7564); transition: stroke-dashoffset .6s; }
  .value { font: 600 26px 'IBM Plex Mono', monospace; fill: #15201e; }
  .range { font: 11px 'IBM Plex Sans', sans-serif; fill: #8a9794; }
`)

const R = 70
const ARC = Math.PI * R // half-circle length

/** The gauge element; re-renders whenever value/min/max change. */
export class CsmGauge extends HTMLElement {
  static observedAttributes = ['value', 'min', 'max']
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
    this.render()
  }

  /** The number currently shown. */
  get value(): number {
    return Number(this.getAttribute('value') ?? 0)
  }

  private render() {
    const min = Number(this.getAttribute('min') ?? 0)
    const max = Number(this.getAttribute('max') ?? 100)
    const v = Math.min(max, Math.max(min, this.value))
    const frac = max > min ? (v - min) / (max - min) : 0
    this.setAttribute('role', 'meter')
    this.setAttribute('aria-valuemin', String(min))
    this.setAttribute('aria-valuemax', String(max))
    this.setAttribute('aria-valuenow', String(v))
    this.#root.innerHTML = `
      <svg viewBox="0 0 180 104" aria-hidden="true">
        <path class="track" d="M20 92 A${R} ${R} 0 0 1 160 92" fill="none" stroke-width="14" stroke-linecap="round"/>
        <path class="fill" part="arc" d="M20 92 A${R} ${R} 0 0 1 160 92" fill="none" stroke-width="14"
          stroke-linecap="round" stroke-dasharray="${ARC}" stroke-dashoffset="${ARC * (1 - frac)}"/>
        <text class="value" part="value" x="90" y="84" text-anchor="middle">${v}</text>
        <text class="range" x="20" y="104" text-anchor="middle">${min}</text>
        <text class="range" x="160" y="104" text-anchor="middle">${max}</text>
      </svg>`
  }
}

define('csm-gauge', CsmGauge)
