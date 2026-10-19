// SF Symbols-style glyphs. SF Symbols themselves are licensed for Apple platforms only,
// so these are drawn to match their weight and proportions on a 24×24 grid.
const ICONS = {
  // Tab bar glyphs are filled in both states, as in iOS; selection is shown by colour.
  today: (
    <>
      <path
        fillRule="evenodd"
        d="M6.5 4h11A3.5 3.5 0 0 1 21 7.5v10a3.5 3.5 0 0 1-3.5 3.5h-11A3.5 3.5 0 0 1 3 17.5v-10A3.5 3.5 0 0 1 6.5 4zM5 9.5v8A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5v-8z"
      />
      <rect x="7" y="2" width="2" height="4" rx="1" />
      <rect x="15" y="2" width="2" height="4" rx="1" />
      <rect x="7" y="11.5" width="3" height="3" rx=".8" />
      <rect x="10.5" y="11.5" width="3" height="3" rx=".8" />
      <rect x="14" y="11.5" width="3" height="3" rx=".8" />
      <rect x="7" y="15" width="3" height="2.5" rx=".8" />
    </>
  ),
  plans: (
    <path
      fillRule="evenodd"
      d="M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM6.4 8.5a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0zM6.4 12a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0zM6.4 15.5a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0zM10.5 7.7h6a.8.8 0 0 1 0 1.6h-6a.8.8 0 0 1 0-1.6zM10.5 11.2h6a.8.8 0 0 1 0 1.6h-6a.8.8 0 0 1 0-1.6zM10.5 14.7h6a.8.8 0 0 1 0 1.6h-6a.8.8 0 0 1 0-1.6z"
    />
  ),
  dumbbell: (
    <>
      <rect x="1" y="9" width="2.6" height="6" rx="1" />
      <rect x="4.3" y="6" width="3.6" height="12" rx="1.3" />
      <rect x="7" y="10.9" width="10" height="2.2" rx=".6" />
      <rect x="16.1" y="6" width="3.6" height="12" rx="1.3" />
      <rect x="20.4" y="9" width="2.6" height="6" rx="1" />
    </>
  ),
  chart: (
    <>
      <rect x="3.5" y="13" width="4.2" height="8" rx="1.3" />
      <rect x="9.9" y="8" width="4.2" height="13" rx="1.3" />
      <rect x="16.3" y="3" width="4.2" height="18" rx="1.3" />
    </>
  ),
  gear: (
    <path
      fillRule="evenodd"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
      d="M19.67 9.11L22.34 9.69L22.34 14.31L19.67 14.89L19.47 15.38L20.95 17.68L17.68 20.95L15.38 19.47L14.89 19.67L14.31 22.34L9.69 22.34L9.11 19.67L8.62 19.47L6.32 20.95L3.05 17.68L4.53 15.38L4.33 14.89L1.66 14.31L1.66 9.69L4.33 9.11L4.53 8.62L3.05 6.32L6.32 3.05L8.62 4.53L9.11 4.33L9.69 1.66L14.31 1.66L14.89 4.33L15.38 4.53L17.68 3.05L20.95 6.32L19.47 8.62ZM8.2 12a3.8 3.8 0 1 0 7.6 0a3.8 3.8 0 1 0 -7.6 0Z"
    />
  ),
  weight: (
    <path d="M9.2 7a3 3 0 1 1 5.6 0H17a1.5 1.5 0 0 1 1.46 1.15l2.3 10A1.5 1.5 0 0 1 19.3 20H4.7a1.5 1.5 0 0 1-1.46-1.85l2.3-10A1.5 1.5 0 0 1 7 7z" />
  ),
  timer: (
    <path
      fillRule="evenodd"
      d="M10 1.5h4a1 1 0 0 1 0 2h-1v1.56A8.5 8.5 0 1 1 11 5.06V3.5h-1a1 1 0 0 1 0-2zM11 9v5a1 1 0 0 0 2 0V9a1 1 0 0 0-2 0z"
    />
  ),
  flame: (
    <path d="M12.6 1.8c.4 3.1 5.9 5.6 5.9 11.7a6.5 6.5 0 0 1-13 0c0-2.9 1.4-4.9 2.9-6.2.2 2 1.1 3.4 2.5 3.6-.4-3.9.3-6.7 1.7-9.1z" />
  ),
  star: (
    <path d="M12 2.6l2.75 5.8 6.33.78-4.67 4.36 1.2 6.27L12 16.7l-5.61 3.11 1.2-6.27-4.67-4.36 6.33-.78z" strokeLinejoin="round" stroke="currentColor" strokeWidth="1.2" />
  ),
  // Line glyphs.
  chevronDown: <path d="M5 9l7 7 7-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />,
  plus: <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />,
  minus: <path d="M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />,
  ellipsis: (
    <>
      <circle cx="5.5" cy="12" r="1.9" />
      <circle cx="12" cy="12" r="1.9" />
      <circle cx="18.5" cy="12" r="1.9" />
    </>
  ),
  chevronRight: <path d="M9.5 5.5L16 12l-6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />,
  chevronLeft: <path d="M14.5 5L7.5 12l7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />,
  chevronUpDown: (
    <path d="M8 9.5l4-4 4 4M8 14.5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  ),
  search: (
    <path d="M10.5 4.5a6 6 0 1 1 0 12a6 6 0 0 1 0-12zM15 15l5 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  ),
  clear: (
    <path
      fillRule="evenodd"
      d="M12 2a10 10 0 1 1 0 20a10 10 0 0 1 0-20zM8.7 7.3a1 1 0 0 0-1.4 1.4L10.6 12l-3.3 3.3a1 1 0 1 0 1.4 1.4l3.3-3.3 3.3 3.3a1 1 0 0 0 1.4-1.4L13.4 12l3.3-3.3a1 1 0 0 0-1.4-1.4L12 10.6z"
    />
  ),
} as const

export type IconName = keyof typeof ICONS

export default function Icon({ name, size = 24, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  )
}
