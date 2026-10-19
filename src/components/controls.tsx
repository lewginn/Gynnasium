import type { InputHTMLAttributes, SelectHTMLAttributes } from 'react'
import Icon from './Icon'

/** iOS switch. A real checkbox sits on top of the track, so it stays accessible and tappable. */
export function Switch(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role'>) {
  return (
    <span className="switch">
      <input type="checkbox" role="switch" {...props} />
      <span className="switch-track" aria-hidden="true" />
    </span>
  )
}

/** iOS pop-up button: the current value with ⌃⌄, opening the platform's native picker. */
export function PopUpSelect({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={`popup ${className}`}>
      <select {...props}>{children}</select>
      <Icon name="chevronUpDown" size={15} />
    </span>
  )
}
