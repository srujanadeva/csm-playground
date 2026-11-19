// Allow-list cleaning for rich text from the editor (OWASP A03): only b/strong/i/em/u, lists,
// paragraphs and line breaks survive, always without attributes. Script-like elements are dropped
// with their content; any other tag is removed but its text kept. Text is re-escaped, so a stray
// "<" can never open a tag in the browser.

const ALLOWED = new Set(['b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'p', 'br', 'div'])
const DROP_WITH_CONTENT =
  /<(script|style|iframe|object|embed|template|textarea|noscript|svg|math)\b[\s\S]*?<\/\1\s*>/gi
const TAG = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g

/** Escapes text, keeping entities that are already escaped (&amp; &nbsp; &#39;). */
const escapeText = (t: string) =>
  t
    .replace(/&(?!(#\d+|#x[0-9a-f]+|[a-z]+);)/gi, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/**
 * Cleans editor HTML for storage and display.
 * @param html Untrusted HTML from a client.
 * @returns HTML containing only allowed tags with no attributes.
 */
export function sanitizeRichText(html: string): string {
  const input = html.replace(/<!--[\s\S]*?-->/g, '').replace(DROP_WITH_CONTENT, '')
  let out = ''
  let last = 0
  for (const m of input.matchAll(TAG)) {
    out += escapeText(input.slice(last, m.index))
    last = m.index + m[0].length
    const name = m[1]!.toLowerCase()
    if (!ALLOWED.has(name)) continue
    out += name === 'br' ? '<br>' : m[0].startsWith('</') ? `</${name}>` : `<${name}>`
  }
  return (out + escapeText(input.slice(last))).trim()
}
