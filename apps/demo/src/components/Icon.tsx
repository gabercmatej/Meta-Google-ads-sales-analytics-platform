// Small monochrome inline-SVG icons (24x24, 1.7px stroke). Original drawings, no icon library.
import type { ReactNode } from 'react';

const P: Record<string, ReactNode> = {
  overview: (
    <>
      <rect x="3.5" y="3.5" width="7" height="8" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
      <rect x="3.5" y="14.5" width="7" height="6" rx="1.5" />
    </>
  ),
  sales: (
    <>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 15l3.5-4 3 2.5L20 7" />
    </>
  ),
  leads: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5" />
      <path d="M17 9v5M14.5 11.5h5" />
    </>
  ),
  attribution: (
    <>
      <circle cx="6" cy="6" r="2.3" />
      <circle cx="18" cy="12" r="2.3" />
      <circle cx="6" cy="18" r="2.3" />
      <path d="M8 7l8 4M8 17l8-4" />
    </>
  ),
  compare: (
    <>
      <rect x="3.5" y="5" width="7" height="14" rx="1.5" />
      <rect x="13.5" y="5" width="7" height="14" rx="1.5" />
      <path d="M7 15v-3M17 15V9" />
    </>
  ),
  campaigns: (
    <>
      <path d="M4 10v4l11 4V6L4 10z" />
      <path d="M18 9.5c1.2.6 1.8 1.4 1.8 2.5s-.6 1.9-1.8 2.5" />
      <path d="M7 15l1 4h2.5l-.8-3" />
    </>
  ),
  create: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  drafts: (
    <>
      <path d="M7 3.5h7l4 4V20a.5.5 0 01-.5.5h-10.5A.5.5 0 016.5 20V4a.5.5 0 01.5-.5z" />
      <path d="M14 3.5v4h4M9.5 12h5M9.5 15.5h5" />
    </>
  ),
  assistant: (
    <>
      <path d="M5 5.5h14a1.5 1.5 0 011.5 1.5v8a1.5 1.5 0 01-1.5 1.5h-7l-4 3.5V16.5H5A1.5 1.5 0 013.5 15V7A1.5 1.5 0 015 5.5z" />
      <path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01" />
    </>
  ),
  recommendations: (
    <>
      <path d="M12 3.5l1.9 4.6 4.6 1.9-4.6 1.9L12 16.5l-1.9-4.6L5.5 10l4.6-1.9L12 3.5z" />
      <path d="M18.5 15.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8.8-1.9z" />
    </>
  ),
  'data-sources': (
    <>
      <ellipse cx="12" cy="6" rx="7.5" ry="2.8" />
      <path d="M4.5 6v6c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6" />
      <path d="M4.5 12v6c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-6" />
    </>
  ),
  activity: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.2 2" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />,
};

export function Icon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {P[name] ?? <circle cx="12" cy="12" r="3" />}
    </svg>
  );
}
