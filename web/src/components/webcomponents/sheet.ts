// Constructed stylesheets for shadow roots. A <style> element inside a shadow root would be blocked
// by the app's CSP (style-src 'self'); stylesheets built with CSSStyleSheet are not.

/** Builds a stylesheet once, for adoption by every instance of a component. */
export function sheet(css: string): CSSStyleSheet {
  const s = new CSSStyleSheet()
  s.replaceSync(css)
  return s
}

/** Defines a custom element unless it already exists (hot reload re-runs modules). */
export function define(name: string, ctor: CustomElementConstructor) {
  if (!customElements.get(name)) customElements.define(name, ctor)
}
