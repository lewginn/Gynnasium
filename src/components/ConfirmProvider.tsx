import { useCallback, useRef, useState, type ReactNode } from 'react'
import { ConfirmContext, type ConfirmOptions } from '../state/confirm'
import Sheet from './Sheet'

/** Provides `useConfirm()`: one confirmation sheet for the whole app, instead of the browser's confirm(). */
export default function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolve = useRef<(ok: boolean) => void>(() => {})

  const confirm = useCallback(
    (next: ConfirmOptions) =>
      new Promise<boolean>((done) => {
        resolve.current = done
        setOptions(next)
      }),
    [],
  )
  const close = useCallback((ok: boolean) => {
    resolve.current(ok)
    setOptions(null)
  }, [])
  const cancel = useCallback(() => close(false), [close])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <Sheet title={options.title} onClose={cancel}>
          {options.message && <p className="muted">{options.message}</p>}
          <button className={`btn btn-block ${options.destructive ? 'btn-destructive' : 'btn-primary'}`} onClick={() => close(true)}>
            {options.action}
          </button>
          <button className="btn btn-block" onClick={cancel}>
            Cancel
          </button>
        </Sheet>
      )}
    </ConfirmContext.Provider>
  )
}
