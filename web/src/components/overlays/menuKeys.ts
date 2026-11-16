// Roving focus for role="menu" lists: shared by the context menu and the submenu dropdown.

/** The enabled-or-not menu items of a list, in order. */
export function menuItems(list: HTMLElement | null): HTMLElement[] {
  return list ? Array.from(list.querySelectorAll<HTMLElement>(':scope > li > [role="menuitem"]')) : []
}

/**
 * Moves focus within a menu. Negative indexes count from the end; past either end wraps.
 * @returns The index focused.
 */
export function focusItem(list: HTMLElement | null, index: number): number {
  const items = menuItems(list)
  if (!items.length) return -1
  const i = ((index % items.length) + items.length) % items.length
  items[i]!.focus()
  return i
}

/** Index of the focused item, or -1. */
export function focusedIndex(list: HTMLElement | null): number {
  return menuItems(list).indexOf(document.activeElement as HTMLElement)
}
