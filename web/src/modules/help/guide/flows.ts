// The user guide's flows, by persona. Structure lives here; the words live in
// locales/<lang>/help.json under flows.<id>. Both the in-app Help centre and docs/user-guide.md
// (npm run guide:md) are built from these, so they can't drift apart. No React imports: the
// generator runs in Node.
import type { ElementLocators, LocatorStyle } from '../../../lib/locators.ts'

export const PERSONAS = ['visitor', 'csr', 'teller', 'supervisor', 'admin', 'everyone'] as const
export type Persona = (typeof PERSONAS)[number]

/** Demo sign-in for each persona (see README "Staff users"). */
export const DEMO_LOGIN: Record<Persona, string | null> = {
  visitor: null,
  csr: 'csr001',
  teller: 'tel001',
  supervisor: 'sup001',
  admin: 'admin001',
  everyone: 'csr001',
}

export interface GuideElement {
  /** Key under help.json `elements`. */
  key: string
  locator: LocatorStyle
}

export interface GuideFlow {
  id: string
  personas: Persona[]
  /** Where the flow starts (a route in the app). */
  route: string
  /** Files under testresources/ the flow uses. */
  samples?: string[]
  elements: GuideElement[]
  /** The plan phase that added it. */
  phase: number
}

export const FLOWS: GuideFlow[] = [
  {
    id: 'cookieConsent',
    personas: ['visitor'],
    route: '/login',
    elements: [{ key: 'cookieBanner', locator: 'TXT' }],
    phase: 1,
  },
  {
    id: 'requestAccess',
    personas: ['visitor'],
    route: '/request-access',
    elements: [
      { key: 'signupForm', locator: 'NAME' },
      { key: 'termsCheckboxes', locator: 'NAME' },
      { key: 'maskedMobile', locator: 'NAME' },
      { key: 'termsModal', locator: 'TXT' },
    ],
    phase: 1,
  },
  {
    id: 'forgotPassword',
    personas: ['visitor'],
    route: '/forgot-password',
    elements: [
      { key: 'forgotForm', locator: 'LBL' },
      { key: 'otpBoxes', locator: 'DYN' },
      { key: 'countdown', locator: 'TXT' },
      { key: 'passwordToggle', locator: 'ARIA' },
    ],
    phase: 1,
  },
  {
    id: 'devInbox',
    personas: ['visitor', 'everyone'],
    route: '/dev/inbox',
    elements: [{ key: 'inboxTable', locator: 'XP' }],
    phase: 1,
  },
  {
    id: 'decideAccessRequest',
    personas: ['admin'],
    route: '/admin/users',
    elements: [
      { key: 'requestRows', locator: 'DATA' },
      { key: 'decisionModal', locator: 'DATA' },
    ],
    phase: 1,
  },
  {
    id: 'commandPalette',
    personas: ['everyone'],
    route: '/dashboard',
    elements: [{ key: 'palette', locator: 'ARIA' }],
    phase: 1,
  },
  {
    id: 'sidebar',
    personas: ['everyone'],
    route: '/dashboard',
    elements: [
      { key: 'navGroups', locator: 'ARIA' },
      { key: 'pagesGroup', locator: 'TXT' },
    ],
    phase: 1,
  },
  {
    id: 'announcements',
    personas: ['everyone'],
    route: '/dashboard',
    elements: [{ key: 'announcementBar', locator: 'CLS' }],
    phase: 1,
  },
  {
    id: 'breadcrumbs',
    personas: ['everyone'],
    route: '/customers',
    elements: [{ key: 'breadcrumbLinks', locator: 'XP' }],
    phase: 1,
  },
  {
    id: 'onboardKyc',
    personas: ['csr'],
    route: '/customers/new',
    samples: ['ocr/id-clean.png', 'ocr/id-blurry.png', 'ocr/id-partial.png', 'media/testimage.jpg'],
    elements: [
      { key: 'ocrPanel', locator: 'DATA' },
      { key: 'cameraCapture', locator: 'TTL' },
      { key: 'ekycFrame', locator: 'CTX' },
      { key: 'signaturePad', locator: 'ID' },
    ],
    phase: 2,
  },
  {
    id: 'nominees',
    personas: ['csr'],
    route: '/customers/new',
    elements: [
      { key: 'nomineeFields', locator: 'XP' },
      { key: 'maskedMobile', locator: 'NAME' },
    ],
    phase: 2,
  },
  {
    id: 'unsavedChanges',
    personas: ['csr'],
    route: '/customers/new',
    elements: [{ key: 'unsavedDialog', locator: 'TXT' }],
    phase: 2,
  },
  {
    id: 'customerPhoto',
    personas: ['csr', 'supervisor'],
    route: '/customers',
    elements: [{ key: 'customerPhoto', locator: 'CLS' }],
    phase: 2,
  },
  {
    id: 'searchShortcuts',
    personas: ['csr', 'supervisor'],
    route: '/customers',
    elements: [
      { key: 'rowDoubleClick', locator: 'DATA' },
      { key: 'rowContextMenu', locator: 'TXT' },
      { key: 'hoverPreview', locator: 'TTL' },
    ],
    phase: 3,
  },
  {
    id: 'customer360Tools',
    personas: ['csr', 'supervisor'],
    route: '/customers',
    elements: [
      { key: 'actionsSubmenu', locator: 'ARIA' },
      { key: 'accountConfirm', locator: 'ID' },
      { key: 'offerBanner', locator: 'CLS' },
      { key: 'sectionInfoTips', locator: 'ARIA' },
      { key: 'backToTop', locator: 'TTL' },
    ],
    phase: 3,
  },
  {
    id: 'creditStanding',
    personas: ['csr', 'supervisor'],
    route: '/customers',
    elements: [
      { key: 'bureauWidget', locator: 'CTX' },
      { key: 'bureauDelayed', locator: 'DATA' },
      { key: 'bureauReport', locator: 'CTX' },
    ],
    phase: 3,
  },
  {
    id: 'triageBoard',
    personas: ['csr', 'supervisor'],
    route: '/service-requests',
    elements: [
      { key: 'srMultiFilter', locator: 'ARIA' },
      { key: 'srTagChips', locator: 'DUP' },
      { key: 'moveMenu', locator: 'PART' },
      { key: 'presentBoard', locator: 'TTL' },
      { key: 'desktopAlerts', locator: 'TXT' },
    ],
    phase: 4,
  },
  {
    id: 'scheduleCallback',
    personas: ['csr'],
    route: '/service-requests/new',
    elements: [
      { key: 'callbackFields', locator: 'NAME' },
      { key: 'srTagChips', locator: 'DUP' },
    ],
    phase: 4,
  },
  {
    id: 'resolveWithRating',
    personas: ['csr'],
    route: '/service-requests',
    elements: [
      { key: 'resolutionEditor', locator: 'ID' },
      { key: 'csatStars', locator: 'XP' },
      { key: 'csatReadOnly', locator: 'PART' },
    ],
    phase: 4,
  },
  {
    id: 'qualityReview',
    personas: ['supervisor'],
    route: '/service-requests?view=list&queue=branch&statuses=resolved,closed',
    elements: [{ key: 'qualitySlider', locator: 'ARIA' }],
    phase: 4,
  },
  {
    id: 'listEditing',
    personas: ['csr', 'supervisor'],
    route: '/service-requests?view=list',
    elements: [
      { key: 'listColumnCell', locator: 'XP' },
      { key: 'inlineEdit', locator: 'XP' },
      { key: 'splitPanels', locator: 'CLS' },
    ],
    phase: 4,
  },
  {
    id: 'tokenQueue',
    personas: ['teller'],
    route: '/teller',
    elements: [
      { key: 'tokenCounts', locator: 'NTH' },
      { key: 'lobbyLink', locator: 'LINK' },
      { key: 'lobbyDisplay', locator: 'ID' },
    ],
    phase: 5,
  },
  {
    id: 'checkedWithdrawal',
    personas: ['teller'],
    route: '/teller',
    elements: [
      { key: 'amountPlaceholder', locator: 'PH' },
      { key: 'denomStepper', locator: 'DUP' },
      { key: 'specimenImage', locator: 'ALT' },
      { key: 'withdrawalOtp', locator: 'DYN' },
      { key: 'postButton', locator: 'TXT' },
    ],
    phase: 5,
  },
  {
    id: 'branchActivity',
    personas: ['teller', 'supervisor'],
    route: '/teller',
    elements: [
      { key: 'liveFeed', locator: 'DATA' },
      { key: 'feedStaleRows', locator: 'XP' },
      { key: 'cutoffCountdown', locator: 'ID' },
    ],
    phase: 5,
  },
]

/**
 * A working CSS selector and XPath for each element (plan §3.1), shown in the guide. Example values
 * (CIF-000124, SR-2026-000012) stand for whatever record is on screen. Checked against the running
 * app with the browser smoke tests.
 */
export const ELEMENT_LOCATORS: Record<string, ElementLocators> = {
  // Phase 1
  maskedMobile: { css: "input[name='mobile']", xpath: "//input[@name='mobile']" },
  // Phase 2
  ocrPanel: {
    css: "[data-qa='ocr-row'][data-flagged='true']",
    xpath: "//tr[@data-qa='ocr-row' and @data-field='idNumber']",
  },
  cameraCapture: { css: "button[title='Start camera']", xpath: "//button[@title='Capture']" },
  ekycFrame: { css: "iframe[title='e-KYC provider']", xpath: "//iframe[@title='e-KYC provider']" },
  signaturePad: {
    css: '#customer-signature',
    xpath: "//canvas[@id='customer-signature']/ancestor::div[@data-strokes]",
  },
  nomineeFields: {
    css: "fieldset.nominee-row:nth-of-type(1) input[type='number']",
    xpath: "//fieldset[legend='Nominee 1']//span[.='Share (%)']/following-sibling::input",
  },
  unsavedDialog: {
    css: "[role='dialog'] .btn.danger-solid",
    xpath: "//div[@role='dialog']//button[normalize-space()='Discard changes']",
  },
  customerPhoto: {
    css: ".c360-photo[data-state='loaded'] img",
    xpath: "//span[contains(@class,'c360-photo')]",
  },
  // Phase 3
  rowDoubleClick: { css: "tr[data-row-id='CIF-000124']", xpath: "//tr[@data-row-id='CIF-000124']" },
  rowContextMenu: {
    css: ".ctx-menu [role='menuitem']",
    xpath: "//ul[@role='menu']//*[@role='menuitem'][normalize-space()='Copy CIF']",
  },
  hoverPreview: {
    css: "[title='Preview CIF-000124']",
    xpath: "//span[@title='Preview CIF-000124']/following-sibling::span[@role='tooltip']",
  },
  actionsSubmenu: {
    css: ".c360-actions [role='menuitem'][aria-haspopup='menu']",
    xpath: "//button[normalize-space()='Create request']/following-sibling::ul//button[@role='menuitem']",
  },
  accountConfirm: {
    css: "#confirm-account-result[data-source='pasted']",
    xpath: "//input[@id='confirm-account-no']/following-sibling::span[@role='status']",
  },
  offerBanner: { css: '.promo-banner > .btn', xpath: "//div[contains(@class,'promo-banner')]//button" },
  sectionInfoTips: { css: "button[aria-label='About KYC']", xpath: "//h3[contains(.,'KYC')]//button" },
  backToTop: { css: "button[title='Back to top']", xpath: "//button[@title='Back to top']" },
  bureauWidget: {
    css: 'csm-bureau-score csm-gauge',
    xpath: '//csm-bureau-score (XPath stops at the shadow root)',
  },
  bureauDelayed: {
    css: "[data-qa='bureau-panel'][data-state='ready']",
    xpath: "//section[@data-qa='bureau-panel' and @data-state='ready']",
  },
  bureauReport: { css: "iframe[title='Full bureau report']", xpath: "//iframe[@title='Full bureau report']" },
  // Phase 4
  srMultiFilter: {
    css: "[role='listbox'][aria-multiselectable='true'] [role='option'][aria-selected='true']",
    xpath: "//*[@role='option' and normalize-space()='In progress']",
  },
  srTagChips: {
    css: "section[aria-label='Tags'] li.chip-item:has(> span)",
    xpath: "(//li[contains(@class,'chip-item')][span[normalize-space()='VIP']])[2]",
  },
  moveMenu: { css: "button[aria-label^='Move SR-']", xpath: "//button[starts-with(@aria-label,'Move SR-')]" },
  presentBoard: { css: "button[title='present board' i]", xpath: "//button[@title='Present board']" },
  desktopAlerts: {
    css: '.desktop-alerts > button.btn',
    xpath:
      "//button[contains(translate(normalize-space(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'desktop alerts')]",
  },
  callbackFields: {
    css: "input[type='datetime-local'][name='callbackAt']",
    xpath: "//input[@name='windowStart' or @name='windowEnd']",
  },
  resolutionEditor: {
    css: "#resolution-notes[contenteditable='true']",
    xpath: "//*[@id='resolution-notes']/preceding-sibling::*[@role='toolbar']//button",
  },
  csatStars: {
    css: "fieldset.csat input[type='radio'][name='csat']:not(:checked)",
    xpath: "//fieldset[legend[normalize-space()='Customer rating']]//input[@type='radio' and @value='4']",
  },
  csatReadOnly: {
    css: "[role='img'][aria-label$='out of 5']",
    xpath: "//*[@role='img' and substring(@aria-label, string-length(@aria-label) - 7) = 'out of 5']",
  },
  qualitySlider: {
    css: "input[type='range'][aria-label='Quality score']",
    xpath: "//input[@type='range' and @aria-label='Quality score']",
  },
  listColumnCell: {
    css: "tbody > tr[aria-expanded='true'] + tr.detail-row",
    xpath:
      "//tr[td[2][normalize-space()='SR-2026-000012']]/td[count(//th[normalize-space()='Priority']/preceding-sibling::th)+1]",
  },
  inlineEdit: {
    css: 'tr:has(select.inline-select) td:nth-child(2)',
    xpath: "//select[@aria-label='Change priority']/ancestor::tr[1]/td[2]",
  },
  splitPanels: {
    css: ".sr-split [role='separator']",
    xpath: "//div[contains(concat(' ',normalize-space(@class),' '),' sr-split ')]//*[@role='separator']",
  },
  // Phase 5
  tokenCounts: {
    css: '.token-actions > button:nth-child(3) .count',
    xpath: "(//div[contains(@class,'token-actions')]/button)[3]/span[@class='count']",
  },
  lobbyLink: {
    css: "a[href='/teller/lobby'][target='_blank']",
    xpath: "//a[contains(text(),'lobby display')]",
  },
  lobbyDisplay: {
    css: '#lobby-display .lobby-counters > li:first-child .token-label',
    xpath: "//*[@id='lobby-fullscreen']",
  },
  amountPlaceholder: { css: "input[placeholder='₹0.00']", xpath: "//input[@placeholder='₹0.00']" },
  denomStepper: {
    css: 'table.denoms tbody tr:nth-child(1) .stepper-inc',
    xpath: "//tr[td[1][normalize-space()='₹500']]//button[normalize-space()='+']",
  },
  specimenImage: {
    css: "img[alt^='Specimen signature']",
    xpath: "//img[contains(@alt,'Specimen')]/following::input[@type='checkbox'][1]",
  },
  withdrawalOtp: {
    css: "input[id^='otp-'][id$='-0']",
    xpath: "//input[starts-with(@id,'otp-') and substring(@id, string-length(@id) - 1) = '-5']",
  },
  postButton: {
    css: "button[type='submit'][data-mode]:not(:disabled)",
    xpath:
      "//button[@type='submit' and (contains(normalize-space(),'Post') or contains(normalize-space(),'authorisation'))]",
  },
  liveFeed: { css: "li[data-event='posted'][data-seq]", xpath: '//ol/li[@data-event and @data-seq]' },
  feedStaleRows: {
    css: 'ol.feed-list > li:nth-child(-n+3)',
    xpath: "//ol[@aria-label='Branch activity']/li[position()<=3]",
  },
  cutoffCountdown: { css: '#cutoff-countdown[data-seconds]', xpath: "//*[@id='cutoff-countdown']" },
}
