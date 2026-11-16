// Allow-list cleaning for rich text: only simple formatting tags survive, with no attributes.
// The server cleans again before saving; this copy protects what the editor itself displays.

const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'P', 'BR', 'DIV'])

/**
 * Rebuilds `html` keeping only allowed tags (attributes dropped) and text. DOMParser documents
 * never run scripts or load images, so parsing untrusted HTML here is safe.
 * @returns Clean HTML.
 */
export function sanitizeRichText(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const out = document.createElement('div')
  const copy = (from: Node, to: Node) => {
    from.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) to.appendChild(document.createTextNode(n.textContent ?? ''))
      else if (n.nodeType === Node.ELEMENT_NODE) {
        const el = n as Element
        if (ALLOWED.has(el.tagName)) {
          const clean = document.createElement(el.tagName.toLowerCase())
          copy(el, clean)
          to.appendChild(clean)
        } else if (!['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'TEMPLATE'].includes(el.tagName)) {
          // Unknown wrappers (span, a, font…) are unwrapped so their text is kept.
          copy(el, to)
        }
      }
    })
  }
  copy(doc.body, out)
  return out.innerHTML
}

/** Plain text of rich HTML (for length limits and empty checks). */
export function richTextLength(html: string): number {
  return (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '').trim().length
}
