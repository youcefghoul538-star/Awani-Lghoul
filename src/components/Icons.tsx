import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }
const base = (size = 20): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
})

export const IconSearch = ({ size, ...r }: P) => (
  <svg {...base(size)} {...r}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
)
export const IconCart = ({ size, ...r }: P) => (
  <svg {...base(size)} {...r}>
    <path d="M3 4h2l2.2 11h10.6L20 7H6.2" />
    <circle cx="9" cy="19.5" r="1.3" />
    <circle cx="17" cy="19.5" r="1.3" />
  </svg>
)
export const IconQuote = ({ size, ...r }: P) => (
  <svg {...base(size)} {...r}>
    <path d="M7 3h8l4 4v14H7z" />
    <path d="M15 3v4h4M10 12h6M10 16h6" />
  </svg>
)
export const IconPhone = ({ size, ...r }: P) => (
  <svg {...base(size)} {...r}>
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z" />
  </svg>
)
export const IconGlobe = ({ size, ...r }: P) => (
  <svg {...base(size)} {...r}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </svg>
)
export const IconPlus = ({ size, ...r }: P) => (
  <svg {...base(size)} {...r}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)
export const IconMinus = ({ size, ...r }: P) => (
  <svg {...base(size)} {...r}>
    <path d="M5 12h14" />
  </svg>
)
export const IconTrash = ({ size, ...r }: P) => (
  <svg {...base(size)} {...r}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
)
export const IconCheck = ({ size, ...r }: P) => (
  <svg {...base(size)} {...r}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
)
export const IconClose = ({ size, ...r }: P) => (
  <svg {...base(size)} {...r}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)
export const IconChevron = ({ size, ...r }: P) => (
  <svg {...base(size)} {...r}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)
export const IconPackage = ({ size, ...r }: P) => (
  <svg {...base(size)} {...r}>
    <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
  </svg>
)
export const IconStore = ({ size, ...r }: P) => (
  <svg {...base(size)} {...r}>
    <path d="M4 9 5.5 4h13L20 9M4 9v11h16V9M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9" />
    <path d="M10 20v-5h4v5" />
  </svg>
)

/** Original logo mark: a house with an arched door. */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="14" fill="currentColor" />
      <path d="M12 31 32 14l20 17" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 30v19h24V30" fill="none" stroke="#fff" strokeWidth="5" strokeLinejoin="round" />
      <path d="M27 49V38a5 5 0 0 1 10 0v11" fill="#f0a36f" />
    </svg>
  )
}
