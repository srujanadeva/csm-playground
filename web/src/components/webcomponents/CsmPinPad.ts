// <csm-pin-pad length="4">: a PIN keypad in a CLOSED shadow root, as banks use to keep scripts out.
// Its buttons can't be reached with selectors at all: tests must type digits while the host has
// focus, or click by coordinates. Emits "pinchange" { length } and "pincomplete" { pin } (composed).
import { define, sheet } from './sheet.ts'

const CSS = sheet(`
  :host { display: inline-block; outline: none; font-family: 'IBM Plex Sans', system-ui, sans-serif; }
  :host(:focus-visible) .pad { box-shadow: 0 0 0 2px #0d7564; }
  .pad { display: inline-flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 10px;
    background: #0f2d2a; color: #fff; }
  .dots { display: flex; gap: 10px; justify-content: center; height: 16px; }
  .dot { width: 12px; height: 12px; border-radius: 50%; border: 2px solid #7e9b95; }
  .dot.on { background: #fff; border-color: #fff; }
  .keys { display: grid; grid-template-columns: repeat(3, 52px); gap: 8px; }
  button { all: unset; height: 44px; border-radius: 8px; background: #163a36; text-align: center;
    font-size: 18px; cursor: pointer; }
  button:hover { background: #1f4b46; }
  button.fn { font-size: 13px; color: #bfd3ce; }
`)

/** The keypad. Call `clear()` to reset it. */
export class CsmPinPad extends HTMLElement {
  #root: ShadowRoot
  #pin = ''

  constructor() {
    super()
    this.#root = this.attachShadow({ mode: 'closed' })
    this.#root.adoptedStyleSheets = [CSS]
  }

  get #length(): number {
    return Math.max(4, Math.min(6, Number(this.getAttribute('length') ?? 4)))
  }

  connectedCallback() {
    this.tabIndex = 0
    this.setAttribute('role', 'group')
    if (!this.hasAttribute('aria-label')) this.setAttribute('aria-label', 'PIN keypad')
    this.addEventListener('keydown', this.#onKey)
    this.#render()
  }

  disconnectedCallback() {
    this.removeEventListener('keydown', this.#onKey)
  }

  /** Empties the entered PIN. */
  clear() {
    this.#pin = ''
    this.#update()
  }

  #onKey = (e: KeyboardEvent) => {
    if (/^\d$/.test(e.key)) this.#press(e.key)
    else if (e.key === 'Backspace') this.#press('back')
    else if (e.key === 'Escape') this.#press('clear')
    else return
    e.preventDefault()
  }

  #press(key: string) {
    if (key === 'back') this.#pin = this.#pin.slice(0, -1)
    else if (key === 'clear') this.#pin = ''
    else if (this.#pin.length < this.#length) this.#pin += key
    this.#update()
    this.dispatchEvent(
      new CustomEvent('pinchange', { detail: { length: this.#pin.length }, bubbles: true, composed: true }),
    )
    if (this.#pin.length === this.#length)
      this.dispatchEvent(
        new CustomEvent('pincomplete', { detail: { pin: this.#pin }, bubbles: true, composed: true }),
      )
  }

  #render() {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back']
    this.#root.innerHTML = `<div class="pad"><div class="dots"></div><div class="keys">${keys
      .map((k) => {
        const fn = k === 'clear' || k === 'back'
        const text = k === 'clear' ? 'Clear' : k === 'back' ? '⌫' : k
        const label = k === 'back' ? ' aria-label="Delete last digit"' : ''
        return `<button type="button" tabindex="-1" data-key="${k}"${label} class="${fn ? 'fn' : ''}">${text}</button>`
      })
      .join('')}</div></div>`
    this.#root.querySelector('.keys')!.addEventListener('click', (e) => {
      const key = (e.target as HTMLElement).closest('button')?.dataset.key
      if (key) this.#press(key)
    })
    this.#update()
  }

  #update() {
    const dots = this.#root.querySelector('.dots')
    if (!dots) return
    dots.innerHTML = Array.from(
      { length: this.#length },
      (_, i) => `<span class="dot ${i < this.#pin.length ? 'on' : ''}"></span>`,
    ).join('')
    this.setAttribute('data-filled', String(this.#pin.length))
  }
}

define('csm-pin-pad', CsmPinPad)
