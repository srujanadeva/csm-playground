// Length of rich text as the user sees it: tags removed, each entity (&amp;, &nbsp;, &#39;) one character.
// Pure string work, so the server and the browser count the same way.

/**
 * Visible character count of an HTML fragment.
 * @param html Output of the rich text editor.
 */
export function richTextTextLength(html: string): number {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, 'x')
    .trim().length
}
