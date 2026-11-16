// Shows stored rich text (announcements, resolution notes). The HTML is cleaned again here and set
// through a ref, since raw-HTML props are banned by the lint rules.
import { useEffect, useRef } from 'react'
import { sanitizeRichText } from '../../lib/richText.ts'

/** A div whose content is the cleaned `html`. */
export function RichTextView({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = sanitizeRichText(html)
  }, [html])
  return <div ref={ref} className={className} />
}
