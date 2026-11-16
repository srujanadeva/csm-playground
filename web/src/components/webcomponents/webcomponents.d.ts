// JSX typings for the custom elements, so React accepts them with their attributes.
import type { DetailedHTMLProps, HTMLAttributes } from 'react'

type El<A> = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & A

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'csm-gauge': El<{ value?: string | number; min?: string | number; max?: string | number }>
      'csm-bureau-score': El<{
        state?: 'loading' | 'ready' | 'error' | 'none'
        score?: string | number
        band?: string
        updated?: string
        heading?: string
        'loading-text'?: string
        'error-text'?: string
        'none-text'?: string
        'updated-text'?: string
        'band-text'?: string
      }>
      'csm-pin-pad': El<{ length?: string | number }>
    }
  }
}
