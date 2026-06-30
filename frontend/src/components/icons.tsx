import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = (props: IconProps) => ({
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props,
})

export const Logo = (props: IconProps) => (
  <svg {...base(props)} viewBox="0 0 24 24">
    <path d="M4 7h16M4 12h16M4 17h9" />
    <circle cx="18" cy="17" r="2.5" fill="currentColor" stroke="none" />
  </svg>
)

export const Sparkles = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
    <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" />
  </svg>
)

export const Check = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M5 12l5 5L20 7" />
  </svg>
)

export const CheckCircle = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12l2.5 2.5L16 9" />
  </svg>
)

export const X = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

export const XCircle = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9 9l6 6M15 9l-6 6" />
  </svg>
)

export const AlertTriangle = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 3L2 20h20L12 3z" />
    <path d="M12 9v5M12 17h.01" />
  </svg>
)

export const ArrowRight = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)

export const Clock = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)

export const ExternalLink = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M15 3h6v6M21 3l-9 9M19 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h5" />
  </svg>
)

export const Wallet = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M3 7a2 2 0 012-2h12a2 2 0 012 2v1h2v8h-2v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    <circle cx="16" cy="12" r="1.2" fill="currentColor" />
  </svg>
)

export const ShieldCheck = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 3l8 3v6c0 4.5-3 7.5-8 9-5-1.5-8-4.5-8-9V6l8-3z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
)

export const FileText = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M14 3v5h5" />
    <path d="M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
    <path d="M9 13h6M9 17h6M9 9h2" />
  </svg>
)

export const Cpu = (props: IconProps) => (
  <svg {...base(props)}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <rect x="9" y="9" width="6" height="6" rx="1" />
    <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
  </svg>
)

export const Send = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
)

export const Loader = (props: IconProps) => (
  <svg {...base(props)} className={`animate-spin ${props.className || ''}`}>
    <path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
  </svg>
)

export const Copy = (props: IconProps) => (
  <svg {...base(props)}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
)

export const Zap = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M13 2L4 14h8l-1 8 9-12h-8l1-8z" />
  </svg>
)

export const Eye = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

export const Layers = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 3l9 5-9 5-9-5 9-5z" />
    <path d="M3 13l9 5 9-5M3 17l9 5 9-5" />
  </svg>
)

export const Lock = (props: IconProps) => (
  <svg {...base(props)}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 018 0v4" />
  </svg>
)
