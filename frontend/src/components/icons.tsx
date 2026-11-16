import type { SVGProps } from 'react'

/** A few line icons (24px grid, 2px stroke). Decorative: always next to text, so hidden from screen readers. */
const Svg = ({ children, className = '', ...rest }: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={`shrink-0 ${/(^|\s)size-/.test(className) ? '' : 'size-4'} ${className}`}
    {...rest}
  >
    {children}
  </svg>
)

type P = SVGProps<SVGSVGElement>

export const SearchIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
)
export const StarIcon = (p: P) => (
  <Svg {...p}>
    <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z" />
  </Svg>
)
export const RepoIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 5a2 2 0 0 1 2-2h12v15H6a2 2 0 0 0-2 2z" />
    <path d="M4 20a2 2 0 0 0 2 2h12v-4" />
  </Svg>
)
export const PulseIcon = (p: P) => (
  <Svg {...p}>
    <path d="M22 12h-4l-3 8-6-16-3 8H2" />
  </Svg>
)
export const ArrowLeftIcon = (p: P) => (
  <Svg {...p}>
    <path d="M19 12H5m6-6-6 6 6 6" />
  </Svg>
)
export const ArrowRightIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h14m-6-6 6 6-6 6" />
  </Svg>
)
export const ExternalIcon = (p: P) => (
  <Svg {...p}>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Svg>
)
export const CheckIcon = (p: P) => (
  <Svg {...p}>
    <path d="m5 12 5 5L20 7" />
  </Svg>
)
export const CheckCircleIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12 3 3 5-6" />
  </Svg>
)
export const AlertIcon = (p: P) => (
  <Svg {...p}>
    <path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4m0 4h.01" />
  </Svg>
)
export const ClockIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
)
export const CommentIcon = (p: P) => (
  <Svg {...p}>
    <path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z" />
  </Svg>
)
export const BookIcon = (p: P) => (
  <Svg {...p}>
    <path d="M2 5h6a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2zM22 5h-6a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h7z" />
  </Svg>
)
export const CopyIcon = (p: P) => (
  <Svg {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </Svg>
)
export const ChevronDownIcon = (p: P) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
)
export const PullRequestIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="6" cy="18" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    <path d="M6 8.5v7M18 15.5V9a3 3 0 0 0-3-3h-4m2-2.5L10.5 6 13 8.5" />
  </Svg>
)
export const RefreshIcon = (p: P) => (
  <Svg {...p}>
    <path d="M20 11a8 8 0 0 0-14.5-4.5L4 8m0-4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16m0 4v-4h-4" />
  </Svg>
)
