import Head from 'next/head';
import Link from 'next/link';
import { type ReactNode, useCallback, useState } from 'react';
import { PipelineWalkthrough } from '@/components/walkthrough/PipelineWalkthrough';
import { DEMO_PRACTICE } from '@/lib/practice';
import { cn } from '@/lib/utils/cn';

export type NavKey = 'trials' | 'outreach' | 'patients';

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
  const [walkthrough, setWalkthrough] = useState(false);
  const closeWalkthrough = useCallback(() => setWalkthrough(false), []);

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

          <nav className="mt-7 flex flex-col gap-0.5">
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

          {/* Demo: an animated walkthrough of the pipeline (fetch → Jev → dashboard). Visual only. */}
          <button
            type="button"
            onClick={() => setWalkthrough(true)}
            className="group mt-4 flex h-10 items-center gap-2.5 rounded-xl border border-white/80 bg-white/60 px-2.5 text-[13px] font-semibold text-ink shadow-[0_1px_2px_rgba(30,36,48,0.05)] backdrop-blur-sm transition-colors hover:bg-white"
          >
            <span className="flex size-6 items-center justify-center rounded-full bg-linear-to-br from-[#FF9F80] via-[#F7B6CF] to-[#78B4F4] text-white">
              <svg className="ml-px size-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M8 5.5v13a1 1 0 001.5.86l10.5-6.5a1 1 0 000-1.72L9.5 4.64A1 1 0 008 5.5z" />
              </svg>
            </span>
            Run pre-screen
          </button>

          <div className="mt-auto flex items-center gap-2.5 rounded-2xl border border-white/80 bg-white/60 p-2.5 backdrop-blur-sm">
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
        </aside>

        <main className="min-w-0 flex-1 px-8 py-7">{children}</main>
      </div>
      {walkthrough && <PipelineWalkthrough onClose={closeWalkthrough} />}
    </>
  );
}
