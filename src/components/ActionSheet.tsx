import { useEffect, useId, useRef } from 'react'

export type SheetAction = { label: string; onSelect: () => void; destructive?: boolean }

type Props = {
  open: boolean
  title: string
  message?: string
  actions: SheetAction[]
  onClose: () => void
}

/** iOS action sheet on a native <dialog>, so focus trapping and Escape come for free. */
export default function ActionSheet({ open, title, message, actions, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="sheet-group">
        <div className="sheet-header">
          <p id={titleId} className="sheet-title">
            {title}
          </p>
          {message && <p className="sheet-message">{message}</p>}
        </div>
        {actions.map((a) => (
          <button
            key={a.label}
            className={`sheet-action${a.destructive ? ' destructive' : ''}`}
            onClick={() => {
              onClose()
              a.onSelect()
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
      <button className="sheet-action sheet-cancel" onClick={onClose} autoFocus>
        Cancel
      </button>
    </dialog>
  )
}
