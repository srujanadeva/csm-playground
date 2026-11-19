/** The server's rich text cleaner: only simple formatting survives, never attributes or scripts. */
import { describe, expect, it } from 'vitest'
import { sanitizeRichText } from '../src/lib/richText.ts'

describe('sanitizeRichText', () => {
  it('keeps simple formatting and drops attributes', () => {
    expect(sanitizeRichText('<p class="x" onclick="evil()">Hi <b style="color:red">there</b></p>')).toBe(
      '<p>Hi <b>there</b></p>',
    )
    expect(sanitizeRichText('<ul><li>one</li><li>two</li></ul>line<br/>break')).toBe(
      '<ul><li>one</li><li>two</li></ul>line<br>break',
    )
  })

  it('removes scripts with their content and unwraps unknown tags', () => {
    expect(sanitizeRichText('a<script>alert(1)</script>b<a href="javascript:x">link</a>')).toBe('ablink')
    expect(sanitizeRichText('<img src=x onerror=alert(1)>ok<svg><script>1</script></svg>')).toBe('ok')
  })

  it('escapes stray angle brackets but keeps entities', () => {
    expect(sanitizeRichText('5 < 6 &amp; 7 > 3 &nbsp;"q"')).toBe(
      '5 &lt; 6 &amp; 7 &gt; 3 &nbsp;&quot;q&quot;',
    )
    // Removing a script can join the text around it into a tag; it is still only an allowed, bare tag.
    expect(sanitizeRichText('<<script>x</script>img src=x onerror=alert(1)>')).toBe('')
    expect(sanitizeRichText('<<script>x</script>b>')).toBe('<b>')
  })
})
