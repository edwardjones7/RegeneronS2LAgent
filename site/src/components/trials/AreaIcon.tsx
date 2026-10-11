import type { ReactNode } from 'react';
import type { TherapeuticArea } from '@/lib/trials/areas';

const PATHS: Record<TherapeuticArea, ReactNode> = {
  'solid-tumors': (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="10" cy="10.5" r="2.2" />
      <circle cx="15" cy="14.5" r="1.3" />
    </>
  ),
  'blood-cancers': <path d="M12 3.5s6 6.4 6 10.7a6 6 0 01-12 0C6 9.9 12 3.5 12 3.5z" />,
  immunology: <path d="M12 3.5l7 2.8v5.2c0 4.3-2.9 7.6-7 9.5-4.1-1.9-7-5.2-7-9.5V6.3z" />,
  respiratory: (
    <>
      <path d="M12 4v8m0 0l-2.5-2m2.5 2l2.5-2" />
      <path d="M9 8.5C6 8.5 4 12.5 4 16c0 2 1 3 2.5 3S9 17.8 9 16z" />
      <path d="M15 8.5c3 0 5 4 5 7.5 0 2-1 3-2.5 3S15 17.8 15 16z" />
    </>
  ),
  cardiovascular: <path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0112 7.3a4.2 4.2 0 017.5 2.5C19.5 15.4 12 20 12 20z" />,
  metabolic: <path d="M12 3.5c.8 3.2 5 5.2 5 10a5 5 0 01-10 0c0-2.1 1-3.6 2-4.6 0 2 .9 3.1 2 3.1 0-3.2-.8-5.3 1-8.5z" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  neurology: <path d="M13 3.5L5.5 13H11l-1 7.5 7.5-9.5H12z" />,
  other: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8.5v7M8.5 12h7" />
    </>
  ),
};

export function AreaIcon({ area, className }: { area: TherapeuticArea; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[area]}
    </svg>
  );
}
