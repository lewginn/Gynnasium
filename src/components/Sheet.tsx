import { X } from 'lucide-react'
import { useEffect, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  /** Full height for long lists (exercise picker); auto for short menus. */
  tall?: boolean
}

/** Bottom sheet: slides up over the page, closes on backdrop tap or Escape. */
export default function Sheet({ title, onClose, children, tall }: Props) {
  const titleId = useId()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className={`sheet ${tall ? 'sheet-tall' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet-header">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={22} />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
