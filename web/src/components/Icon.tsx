/** Inline stroke icons (no icon font or external sprite, so the strict CSP stays simple). */

const PATHS: Record<string, string> = {
  home: 'M3 11l9-7 9 7M5 10v10h14V10',
  'user-plus': 'M9 12a4 4 0 100-8 4 4 0 000 8zM2 21c0-4 3-6 7-6s7 2 7 6M19 8v6M16 11h6',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 3.5-6 8-6s8 2 8 6',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-4.5-4.5',
  board: 'M3 4h5v16H3zM10 4h5v10h-5zM17 4h4v13h-4z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.5M3 12h.5M3 18h.5',
  plus: 'M12 5v14M5 12h14',
  users: 'M9 12a4 4 0 100-8 4 4 0 000 8zM2 21c0-4 3-6 7-6s7 2 7 6M17 4a4 4 0 010 8M22 21c0-3-2-5-5-6',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M16 4v4M10 10v4M18 16v4',
  wallet: 'M3 7h18v12H3zM16 13h2M3 7l12-4v4',
  card: 'M3 6h18v12H3zM3 10h18',
  check: 'M5 12l5 5 9-10',
  bell: 'M6 16V11a6 6 0 0112 0v5l2 2H4zM10 21h4',
  globe: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  'eye-off':
    'M3 3l18 18M10.6 6.1A9.7 9.7 0 0112 6c6 0 10 6 10 6a17 17 0 01-3.2 3.8M6.6 6.6A17 17 0 002 12s4 7 10 7a9.6 9.6 0 004.4-1',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v4h16v-4',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 018 0v4',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  edit: 'M4 20h4L19 9l-4-4L4 16z',
  ban: 'M12 21a9 9 0 100-18 9 9 0 000 18zM6 6l12 12',
  back: 'M15 6l-6 6 6 6',
  next: 'M9 6l6 6-6 6',
  menu: 'M4 7h16M4 12h16M4 17h16',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v6M12 7.5v.5',
  warn: 'M12 3l10 18H2zM12 10v5M12 18v.5',
  logout: 'M15 4h4v16h-4M10 17l5-5-5-5M15 12H3',
  file: 'M14 3H6v18h12V7zM14 3v4h4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  refresh: 'M20 11a8 8 0 10-2.3 5.7M20 4v7h-7',
  filter: 'M3 5h18l-7 8v6l-4 2v-8z',
  x: 'M6 6l12 12M18 6L6 18',
}

/** An icon by name; decorative unless `label` is given. */
export function Icon({ name, label, size }: { name: string; label?: string; size?: number }) {
  const d = PATHS[name] ?? PATHS.info!
  return (
    <svg
      className="i"
      viewBox="0 0 24 24"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      style={size ? { width: size, height: size } : undefined}
    >
      <path d={d} />
    </svg>
  )
}
