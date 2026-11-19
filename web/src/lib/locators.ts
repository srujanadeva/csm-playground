// The locator styles practice elements are built with (plan §3). Plain data, so the user-guide
// generator can import it outside the browser.

export const LOCATOR_STYLES = [
  'TID',
  'ID',
  'NAME',
  'CLS',
  'TXT',
  'ARIA',
  'LBL',
  'TTL',
  'DATA',
  'DYN',
  'DUP',
  'XP',
  'CTX',
  'LINK',
  'ALT',
  'PH',
  'PART',
  'NTH',
] as const

/** Working example selectors for one element (plan §3.1): one CSS and one XPath technique. */
export interface ElementLocators {
  css: string
  xpath: string
}

export type LocatorStyle = (typeof LOCATOR_STYLES)[number]
