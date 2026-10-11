import Head from 'next/head';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { DEMO_PRACTICE } from '@/lib/practice';
import { cn } from '@/lib/utils/cn';

export type NavKey = 'trials' | 'patients';

interface AppShellProps {
  title: string;
  active: NavKey;
  children: ReactNode;
}

const ICON_PROPS = {
  className: 'size-[18px] shrink-0',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
} as const;

const NAV: { key: NavKey; label: string; href: string; icon: ReactNode }[] = [
  {
    key: 'trials',
    label: 'Recommended',
    href: '/trials',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
        <path d="M18 15l.8 1.9 1.9.8-1.9.8L18 20.4l-.8-1.9-1.9-.8 1.9-.8z" />
      </svg>
    ),
  },
  {
    key: 'patients',
    label: 'Patients',
    href: '/patients',
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5" />
        <path d="M16 4.8a3.5 3.5 0 010 6.4M18.5 14.8c1.7.8 2.8 2.6 3 5.2" />
      </svg>
    ),
  },
];

const initials = (name: string) =>
  name
    .replace(/^Dr\.?\s*/, '')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2);

/** Sidebar + main column. Every dashboard page renders inside this. */
export function AppShell({ title, active, children }: AppShellProps) {
  return (
    <>
      <Head>
        <title>{`${title} · trialmatch`}</title>
      </Head>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-line-2 bg-surface px-3 py-5">
          <Link href="/" className="flex items-center gap-2 px-2">
            <span className="size-6 rounded-lg bg-linear-to-br from-[#FF9F80] via-[#F7B6CF] to-[#78B4F4]" />
            <span className="text-[15px] font-semibold tracking-[-0.02em]">trialmatch</span>
          </Link>

          <div className="mt-6 flex items-center gap-2.5 rounded-2xl border border-line-2 p-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-[#A3CEF6] to-[#E0F2D3] text-[12px] font-semibold text-ink">
              {initials(DEMO_PRACTICE.doctor)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold">{DEMO_PRACTICE.doctor}</span>
              <span className="block truncate text-[11.5px] text-ink-3">{DEMO_PRACTICE.name}</span>
            </span>
          </div>

          <nav className="mt-5 flex flex-col gap-0.5">
            {NAV.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  'flex h-9 items-center gap-2.5 rounded-xl px-2.5 text-[13.5px] transition-colors',
                  item.key === active ? 'bg-surface-2 font-semibold text-ink' : 'font-medium text-ink-2 hover:bg-surface-2'
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-auto rounded-2xl bg-surface-2 p-3 text-[12px] leading-snug text-ink-2">
            <span className="flex items-center gap-1.5 font-semibold text-ink">
              <svg {...ICON_PROPS} className="size-3.5 shrink-0">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 018 0v3" />
              </svg>
              Patient data stays here
            </span>
            <span className="mt-1 block">Records never leave your practice. Patients stay with you.</span>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-8 py-7">{children}</main>
      </div>
    </>
  );
}
