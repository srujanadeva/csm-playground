/**
 * Drag-and-drop file picker. The real <input type="file"> stays in the DOM (visually hidden)
 * so automation can use setInputFiles; dropping files or clicking the zone both work.
 * The browser checks size and type first for quick feedback; the server re-checks by content.
 */
import { useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from './Icon.tsx'

export const ACCEPTED = ['image/jpeg', 'image/png', 'application/pdf']
export const MAX_BYTES = 2 * 1024 * 1024

/** Returns an i18n key if the file is obviously unacceptable, otherwise null. */
export function precheck(file: File): string | null {
  if (!ACCEPTED.includes(file.type)) return 'upload.badType'
  if (file.size > MAX_BYTES) return 'upload.tooLarge'
  return null
}

interface Props {
  id: string
  multiple?: boolean
  disabled?: boolean
  title: ReactNode
  hint: ReactNode
  onFiles: (files: File[]) => void
}

/** The drop zone itself; the caller renders the file list. */
export function FileDropzone({ id, multiple, disabled, title, hint, onFiles }: Props) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <div
      className={`dz ${over ? 'over' : ''}`}
      data-testid={`${id}-zone`}
      data-state={over ? 'dragover' : 'idle'}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-label={t('upload.chooseFiles')}
      onClick={() => !disabled && input.current?.click()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          input.current?.click()
        }
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (!disabled) onFiles(Array.from(e.dataTransfer.files))
      }}
    >
      <Icon name="upload" size={26} />
      <div>
        <b>{title}</b>
        <br />
        {hint}
      </div>
      <input
        ref={input}
        id={id}
        data-testid={id}
        type="file"
        className="sr-only"
        accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
        multiple={multiple}
        disabled={disabled}
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />
    </div>
  )
}
