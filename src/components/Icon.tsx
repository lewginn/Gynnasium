// SF Symbols-style tab bar glyphs. SF Symbols themselves are licensed for Apple platforms only,
// so these are drawn to match their weight and proportions on a 24×24 grid. Content icons use lucide.
const ICONS = {
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
