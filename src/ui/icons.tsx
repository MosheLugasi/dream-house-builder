import type { ReactNode } from 'react';

const paths: Record<string, ReactNode> = {
  select: <path d="M5 3l6 16 2.5-6.5L20 10z" />,
  wall: (
    <>
      <path d="M3 6h18v12H3z" />
      <path d="M3 12h18M9 6v6M15 12v6" />
    </>
  ),
  room: (
    <>
      <path d="M4 4h16v16H4z" />
      <path d="M4 10h6v10" />
    </>
  ),
  erase: (
    <>
      <path d="M4 16l8-10 8 6-6 8H8z" />
      <path d="M9 10l8 6" />
    </>
  ),
  undo: <path d="M9 7L4 12l5 5M4 12h10a6 6 0 010 12" transform="scale(.85) translate(2 -1)" />,
  redo: <path d="M15 7l5 5-5 5M20 12H10a6 6 0 000 12" transform="scale(.85) translate(2 -1)" />,
  plan: (
    <>
      <path d="M3 4h18v16H3z" />
      <path d="M3 11h8M11 4v11M11 15h10M16 15v5" />
    </>
  ),
  cube: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
    </>
  ),
  walk: (
    <>
      <circle cx="13" cy="4.5" r="2" />
      <path d="M13 8l-3 5 3 3v5M10 13l-3 1M13 10l4 3M10.500 16L8 21" />
    </>
  ),
  door: (
    <>
      <path d="M6 21V3h12v18M4 21h16" />
      <circle cx="14.500" cy="12" r=".8" />
    </>
  ),
  sofa: (
    <>
      <path d="M5 11V8a2 2 0 012-2h10a2 2 0 012 2v3" />
      <path d="M3 13a2 2 0 014 0v2h10v-2a2 2 0 014 0v5H3zM6 18v2M18 18v2" />
    </>
  ),
  paint: (
    <>
      <path d="M4 4h13v6H4zM17 6h3v6h-8v3" />
      <path d="M10.500 15h3v6h-3z" />
    </>
  ),
  folder: <path d="M3 6h7l2 2h9v11H3z" />,
  download: <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />,
  upload: <path d="M12 16V5M7 9l5-5 5 5M5 20h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" />,
  copy: (
    <>
      <path d="M9 9h11v11H9z" />
      <path d="M5 15H4V4h11v1" />
    </>
  ),
  rotate: <path d="M20 12a8 8 0 11-3-6.200M20 4v5h-5" />,
  fit: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  flip: <path d="M12 3v18M8 7l-4 5 4 5zM16 7l4 5-4 5z" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.500 9.500a2.500 2.500 0 114 2c-1 .700-1.500 1.200-1.500 2.500M12 17.500v.01" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  home: <path d="M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
};

export function Icon({ name, size = 20 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? null}
    </svg>
  );
}
