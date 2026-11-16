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
] as const

export type LocatorStyle = (typeof LOCATOR_STYLES)[number]
