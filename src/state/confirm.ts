import { createContext, useContext } from 'react'

export interface ConfirmOptions {
  title: string
  message?: string
  /** The button that goes ahead, e.g. "Delete plan". Say what it does; never "OK". */
  action: string
  destructive?: boolean
}

export type Confirm = (options: ConfirmOptions) => Promise<boolean>

export const ConfirmContext = createContext<Confirm | null>(null)

/** Asks before something you can't undo, in a sheet. Resolves true if they go ahead. */
export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext)
  if (!confirm) throw new Error('useConfirm needs a <ConfirmProvider> above it')
  return confirm
}
