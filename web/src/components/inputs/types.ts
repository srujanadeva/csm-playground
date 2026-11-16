// Extra attributes a caller can put on a control's main element. Callers choose the locator
// style (id, name, class, data-*), so the components never add a data-testid of their own.
import type { InputHTMLAttributes } from 'react'

export type DataAttrs = { [key: `data-${string}`]: string | number | boolean | undefined }

/** Attributes spread onto an <input>, excluding the ones the component controls. */
export type InputAttrs = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> &
  DataAttrs
