// A menu button whose items can open a submenu (ARIA menu pattern). ↓/↑ on the button open the
// menu on the first/last item; → opens a submenu and ← closes it; Escape or Tab closes all.
// Hovering an item with children opens its submenu too.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { MenuItem } from '../Widgets.tsx'
import { Icon } from '../Icon.tsx'
import { focusItem, focusedIndex } from './menuKeys.ts'
import './overlays.css'

export interface NestedMenuItem extends MenuItem {
  children?: MenuItem[]
}

interface Props {
  label: ReactNode
  /** Accessible name when `label` isn't plain text. */
  ariaLabel?: string
  items: NestedMenuItem[]
  /** id on the trigger button. */
  id?: string
  className?: string
}

/** The trigger button and its menus. */
export function MenuWithSubmenu({ label, ariaLabel, items, id, className }: Props) {
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLUListElement>(null)
  const sub = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [subKey, setSubKey] = useState<string | null>(null)
  const menuId = useId()

  const close = (refocus = true) => {
    setOpen(false)
    setSubKey(null)
    if (refocus) btn.current?.focus()
  }
  // Focus moves on the next tick, once the list has rendered.
  const openMenu = (last = false) => {
    setOpen(true)
    setSubKey(null)
    setTimeout(() => focusItem(menu.current, last ? -1 : 0))
  }
  const openSub = (key: string) => {
    setSubKey(key)
    setTimeout(() => focusItem(sub.current, 0))
  }
  const pick = (item: MenuItem) => {
    if (item.disabled) return
    close()
    item.onSelect?.()
  }

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (btn.current?.parentElement?.contains(e.target as Node)) return
      setOpen(false)
      setSubKey(null)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  return (
    <div className={`menuwrap ${className ?? ''}`}>
      <button
        ref={btn}
        id={id}
        type="button"
        className="btn sm"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            openMenu(e.key === 'ArrowUp')
          }
        }}
      >
        {label} <span aria-hidden>▾</span>
      </button>
      {open ? (
        <ul
          ref={menu}
          id={menuId}
          className="menu"
          role="menu"
          onKeyDown={(e) => {
            // The submenu sits inside this list, so its keys bubble here; it stops them itself.
            const i = focusedIndex(menu.current)
            const item = items[i]
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              setSubKey(null)
              focusItem(menu.current, i + (e.key === 'ArrowDown' ? 1 : -1))
            } else if (e.key === 'ArrowRight' && item?.children) {
              e.preventDefault()
              openSub(item.key)
            } else if (e.key === 'Escape' || e.key === 'Tab') {
              e.preventDefault()
              close()
            }
          }}
        >
          {items.map((item) => (
            <li
              key={item.key}
              role="none"
              className={item.children ? 'has-sub' : undefined}
              onMouseEnter={() => setSubKey(item.children ? item.key : null)}
            >
              {item.separatorBefore ? <hr /> : null}
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-haspopup={item.children ? 'menu' : undefined}
                aria-expanded={item.children ? subKey === item.key : undefined}
                aria-disabled={item.disabled || undefined}
                title={item.disabled ? item.disabledReason : undefined}
                onClick={() => (item.children ? openSub(item.key) : pick(item))}
              >
                {item.icon ? <Icon name={item.icon} /> : null}
                <span>{item.label}</span>
                {item.children ? (
                  <span aria-hidden className="sub-arrow">
                    ▸
                  </span>
                ) : null}
              </button>
              {item.children && subKey === item.key ? (
                <ul
                  ref={sub}
                  className="menu submenu"
                  role="menu"
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    const i = focusedIndex(sub.current)
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                      e.preventDefault()
                      focusItem(sub.current, i + (e.key === 'ArrowDown' ? 1 : -1))
                    } else if (e.key === 'ArrowLeft' || e.key === 'Escape') {
                      e.preventDefault()
                      setSubKey(null)
                      focusItem(menu.current, items.indexOf(item))
                    } else if (e.key === 'Tab') {
                      e.preventDefault()
                      close()
                    }
                  }}
                >
                  {item.children.map((c) => (
                    <li key={c.key} role="none">
                      <button
                        type="button"
                        role="menuitem"
                        tabIndex={-1}
                        aria-disabled={c.disabled || undefined}
                        title={c.disabled ? c.disabledReason : undefined}
                        onClick={() => pick(c)}
                      >
                        {c.label}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
