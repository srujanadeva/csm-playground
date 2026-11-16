// Becomes true once an element has scrolled near the viewport, and stays true.
import { useEffect, useState, type RefObject } from 'react'

/**
 * @param ref Element to watch.
 * @param enabled When false, reports true at once (eager loading).
 * @param rootMargin How far ahead of the viewport to trigger.
 */
export function useInView(ref: RefObject<Element | null>, enabled = true, rootMargin = '200px'): boolean {
  const [seen, setSeen] = useState(!enabled)
  useEffect(() => {
    if (seen || !ref.current) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setSeen(true)
      },
      { rootMargin },
    )
    io.observe(ref.current)
    return () => io.disconnect()
  }, [ref, seen, rootMargin])
  return seen
}
