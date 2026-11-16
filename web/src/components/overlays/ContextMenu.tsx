// A right-click menu that replaces the browser's own. Opened from onContextMenu (or the
// ContextMenu key / Shift+F10 via openFromKeyboard); closes on Escape, Tab, a pick or a click away.
// Items are found by their visible text: they carry no ids or test ids.
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MenuItem } from '../Widgets.tsx'
import { Icon } from '../Icon.tsx'
import { focusItem, focusedIndex } from './menuKeys.ts'
import './overlays.css'

interface MenuState<T> {
  x: number
  y: number
  payload: T
  /** Element to return focus to on close. */
  from: HTMLElement | null
}

/**
 * State for one context menu shared by many targets (e.g. every row of a table).
 * @returns `open` for onContextMenu, `openFromKeyboard` for onKeyDown, and the current state.
 */
export function useContextMenu<T>() {
  const [state, setState] = useState<MenuState<T> | null>(null)
  const open = useCallback((e: React.MouseEvent, payload: T) => {
    e.preventDefault()
    setState({ x: e.clientX, y: e.clientY, payload, from: e.currentTarget as HTMLElement })
  }, [])
  const openFromKeyboard = useCallback((e: React.KeyboardEvent, payload: T) => {
    if (e.key !== 'ContextMenu' && !(e.shiftKey && e.key === 'F10')) return
    e.preventDefault()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setState({ x: r.left + 16, y: r.top + r.height / 2, payload, from: e.currentTarget as HTMLElement })
  }, [])
  const close = useCallback(() => setState(null), [])
  return { state, open, openFromKeyboard, close }
}

interface Props<T> {
  state: MenuState<T> | null
  items: (payload: T) => MenuItem[]
  onClose: () => void
  label: string
}

/** The floating menu itself (portalled to <body>, fixed at the pointer). */
export function ContextMenu<T>({ state, items, onClose, label }: Props<T>) {
  const ref = useRef<HTMLUListElement>(null)
  const close = useCallback(
    (refocus: boolean) => {
      const from = state?.from
      onClose()
      if (refocus) from?.focus()
    },
    [onClose, state],
  )
  useEffect(() => {
    if (!state) return
    focusItem(ref.current, 0)
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close(false)
    const gone = () => close(false)
    document.addEventListener('mousedown', away)
    window.addEventListener('scroll', gone, true)
    window.addEventListener('resize', gone)
    return () => {
      document.removeEventListener('mousedown', away)
      window.removeEventListener('scroll', gone, true)
      window.removeEventListener('resize', gone)
    }
  }, [state, close])
  if (!state) return null
  // Keep the menu on screen: 220 × 260 is roughly its largest size.
  const left = Math.min(state.x, window.innerWidth - 228)
  const top = Math.min(state.y, window.innerHeight - 268)
  return createPortal(
    <ul
      ref={ref}
      className="menu ctx-menu"
      role="menu"
      aria-label={label}
      style={{ left, top }}
      onKeyDown={(e) => {
        const i = focusedIndex(ref.current)
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          focusItem(ref.current, i + 1)
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          focusItem(ref.current, i - 1)
        } else if (e.key === 'Home' || e.key === 'End') {
          e.preventDefault()
          focusItem(ref.current, e.key === 'Home' ? 0 : -1)
        } else if (e.key === 'Escape' || e.key === 'Tab') {
          e.preventDefault()
          close(true)
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items(state.payload).map((item) => (
        <li key={item.key} role="none">
          {item.separatorBefore ? <hr /> : null}
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            aria-disabled={item.disabled || undefined}
            title={item.disabled ? item.disabledReason : undefined}
            onClick={() => {
              if (item.disabled) return
              close(true)
              item.onSelect?.()
            }}
          >
            {item.icon ? <Icon name={item.icon} /> : null}
            <span>{item.label}</span>
          </button>
        </li>
      ))}
    </ul>,
    document.body,
  )
}
