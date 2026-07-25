import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "dashboard"
  | "profiles"
  | "skills"
  | "quests"
  | "levelling"
  | "exchange"
  | "shopping"
  | "goals"
  | "status"
  | "updates"
  | "settings"
  | "spark"
  | "about"
  | "menu"
  | "search"
  | "refresh"
  | "download"
  | "chevron"
  | "check"
  | "warning"
  | "offline"
  | "close"
  | "plus"
  | "trash";

const paths: Record<IconName, ReactNode> = {
  dashboard: (
    <>
      <path d="M4 13h6V4H4v9Zm10 7h6v-9h-6v9ZM4 20h6v-3H4v3Zm10-13h6V4h-6v3Z" />
    </>
  ),
  profiles: (
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M2.5 20c.7-4 2.9-6 6.5-6s5.8 2 6.5 6M16 7h6M19 4v6" />
    </>
  ),
  skills: (
    <>
      <path d="m5 19 5-5M14 10l5-5M8 4l12 12-4 4L4 8l4-4Z" />
      <path d="m14 4 6 6" />
    </>
  ),
  quests: (
    <>
      <path d="M5 3h11a3 3 0 0 1 3 3v15H7a3 3 0 0 1-3-3V4a1 1 0 0 1 1-1Z" />
      <path d="M7 17h12M8 7h7M8 11h5" />
    </>
  ),
  levelling: (
    <>
      <path d="m4 17 5-5 4 3 7-9" />
      <path d="M15 6h5v5" />
      <path d="M4 21h16" />
    </>
  ),
  exchange: (
    <>
      <path d="M4 7h14l-3-3M20 17H6l3 3" />
      <path d="M18 7v4M6 13v4" />
    </>
  ),
  shopping: (
    <>
      <path d="M3 5h2l2 11h11l2-8H6" />
      <circle cx="9" cy="20" r="1" />
      <circle cx="17" cy="20" r="1" />
    </>
  ),
  goals: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  status: (
    <>
      <path d="M4 19V9M10 19V5M16 19v-7M22 19V3" />
      <path d="M2 19h22" />
    </>
  ),
  updates: (
    <>
      <path d="M20 7v5h-5" />
      <path d="M19 12a7 7 0 1 1-2-5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1-2.9 2.9-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21H10v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1-2.9-2.9.1-.1a1.6 1.6 0 0 0 .3-1.8A1.6 1.6 0 0 0 3.1 14H3v-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1 2.9-2.9.1.1A1.6 1.6 0 0 0 9 4.6a1.6 1.6 0 0 0 1-1.5V3h4v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1 2.9 2.9-.1.1a1.6 1.6 0 0 0-.3 1.8 1.6 1.6 0 0 0 1.5 1h.1v4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
    </>
  ),
  spark: (
    <>
      <path d="m12 2 1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2Z" />
      <path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" />
    </>
  ),
  about: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7h.01" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 7v5h-5" />
      <path d="M19 12a7 7 0 1 1-2-5" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M4 19h16" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  check: <path d="m4 12 5 5L20 6" />,
  warning: (
    <>
      <path d="M12 3 2 21h20L12 3Z" />
      <path d="M12 9v5M12 18h.01" />
    </>
  ),
  offline: (
    <>
      <path d="m3 3 18 18M8.5 8.5A7.6 7.6 0 0 1 12 7c4 0 7 3 7 7M5 14a7 7 0 0 1 1-3.6M9.5 17.5A3.5 3.5 0 0 1 12 16c1.4 0 2.6.8 3.2 2" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: (
    <>
      <path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" />
    </>
  ),
};

export function Icon({
  name,
  size = 20,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
