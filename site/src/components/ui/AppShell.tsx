import Head from 'next/head';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { DEMO_PRACTICE } from '@/lib/practice';
import { cn } from '@/lib/utils/cn';

export type NavKey = 'trials' | 'outreach' | 'calendar' | 'patients';

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
    key: 'outreach',
    label: 'Outreach',
    href: '/outreach',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" />
        <path d="M15 3.5a6 6 0 015.5 5.5M15 7a2.5 2.5 0 012 2" />
      </svg>
    ),
  },
  {
    key: 'calendar',
    label: 'Calendar',
    href: '/calendar',
    icon: (
      <svg {...ICON_PROPS}>
        <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
        <path d="M8 14h2M14 14h2M8 17.5h2" />
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
      <div className="relative isolate flex min-h-screen">
        {/* Soft wash of the area colors across the top, behind the sidebar and the page. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(640px_260px_at_6%_0%,#FFD9C7,transparent),radial-gradient(640px_240px_at_42%_0%,#D4E9FB,transparent),radial-gradient(600px_220px_at_78%_0%,#E0F2D3,transparent)] [mask-image:linear-gradient(to_bottom,black_35%,transparent)]" />

        <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-ink/[0.06] px-3 py-5">
          <Link href="/" className="flex items-center gap-2 px-2">
            <span className="size-6 rounded-lg bg-linear-to-br from-[#FF9F80] via-[#F7B6CF] to-[#78B4F4]" />
            <span className="text-[15px] font-semibold tracking-[-0.02em]">trialmatch</span>
          </Link>

          <div className="mt-6 flex items-center gap-2.5 rounded-2xl border border-white/80 bg-white/60 p-2.5 backdrop-blur-sm">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-[#A3CEF6] to-[#E0F2D3] text-[12px] font-semibold text-ink">
              {initials(DEMO_PRACTICE.doctor)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold">{DEMO_PRACTICE.doctor}</span>
              <span className="block truncate text-[11.5px] text-ink-3" title="Illustrative practice name for the demo">
                {DEMO_PRACTICE.name}
              </span>
            </span>
          </div>

          <nav className="mt-5 flex flex-col gap-0.5">
            {NAV.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  'flex h-9 items-center gap-2.5 rounded-xl px-2.5 text-[13.5px] transition-colors',
                  item.key === active ? 'bg-ink/[0.05] font-semibold text-ink' : 'font-medium text-ink-2 hover:bg-ink/[0.04]'
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
            <span className="mt-1 block">Records stay scoped to your practice. Sponsors only see counts. Patients stay with you.</span>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-8 py-7">{children}</main>
      </div>
    </>
  );
}
