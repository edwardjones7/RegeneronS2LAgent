import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { PipelineWalkthrough } from '@/components/walkthrough/PipelineWalkthrough';
import { DEMO_PRACTICE } from '@/lib/practice';
import { cn } from '@/lib/utils/cn';
import { TrialistLogo } from './TrialistLogo';

export type NavKey = 'trials' | 'campaigns' | 'calendar' | 'patients';

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
    key: 'campaigns',
    label: 'Campaigns',
    href: '/campaigns',
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

/** The signed-in doctor, at the foot of the sidebar. Tap for a menu with Sign out (back to the landing page). */
function DoctorMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative mt-2">
      {open && (
        <div
          role="menu"
          className="absolute inset-x-0 bottom-full z-20 mb-2 rounded-2xl border border-line-2 bg-surface p-1.5 shadow-[0_16px_40px_-16px_rgba(30,36,48,0.35)] motion-safe:animate-slide-up"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void router.push('/')}
            className="flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 text-[13.5px] font-medium text-ink-2 transition-colors hover:bg-ink/[0.04] hover:text-ink"
          >
            <svg {...ICON_PROPS}>
              <path d="M14 4h3.5A2.5 2.5 0 0120 6.5v11a2.5 2.5 0 01-2.5 2.5H14M10 16l-4-4 4-4M6 12h9" />
            </svg>
            Sign out
          </button>
        </div>
      )}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full cursor-pointer items-center gap-2.5 rounded-2xl border border-white/80 p-2.5 text-left backdrop-blur-sm transition-colors',
          open ? 'bg-white/90' : 'bg-white/60 hover:bg-white/80'
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-[#A3CEF6] to-[#E0F2D3] text-[12px] font-semibold text-ink">
          {initials(DEMO_PRACTICE.doctor)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{DEMO_PRACTICE.doctor}</span>
          <span className="block truncate text-[11.5px] text-ink-3" title="Illustrative practice name for the demo">
            {DEMO_PRACTICE.name}
          </span>
        </span>
        <svg className="size-4 shrink-0 text-ink-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 10l4-4 4 4M8 14l4 4 4-4" />
        </svg>
      </button>
    </div>
  );
}

/** Sidebar + main column. Every dashboard page renders inside this. */
export function AppShell({ title, active, children }: AppShellProps) {
  const router = useRouter();
  const [walkthrough, setWalkthrough] = useState(false);
  const closeWalkthrough = useCallback(() => setWalkthrough(false), []);

  // Signing in arrives with ?welcome=1 (the app plays the walkthrough, see _app). Drop it from the
  // URL so a refresh doesn't replay it.
  useEffect(() => {
    if (router.query.welcome === undefined) return;
    const query = Object.fromEntries(Object.entries(router.query).filter(([key]) => key !== 'welcome'));
    void router.replace({ pathname: router.pathname, query }, undefined, { shallow: true, scroll: false });
  }, [router]);

  return (
    <>
      <Head>
        <title>{`${title} · Trialist`}</title>
      </Head>
      <div className="relative isolate flex min-h-screen">
        {/* Soft wash of the area colors across the top, behind the sidebar and the page. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(640px_260px_at_6%_0%,#FFD9C7,transparent),radial-gradient(640px_240px_at_42%_0%,#D4E9FB,transparent),radial-gradient(600px_220px_at_78%_0%,#E0F2D3,transparent)] [mask-image:linear-gradient(to_bottom,black_35%,transparent)]" />

        <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-ink/[0.06] px-3 py-5">
          <Link href="/trials" className="flex items-center gap-2 px-2">
            <TrialistLogo className="h-6 text-ink" />
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

          {/* Replays the last pipeline run as an animated walkthrough (fetch → match → dashboard). Fetches and matches nothing. */}
          <button
            type="button"
            onClick={() => setWalkthrough(true)}
            className="group mt-auto flex h-10 items-center gap-2.5 rounded-xl px-2.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-ink/[0.04] hover:text-ink"
          >
            <svg
              {...ICON_PROPS}
              className={cn('size-[18px] shrink-0 transition-transform duration-500 group-hover:rotate-180', walkthrough && 'animate-spin')}
            >
              <path d="M20 11a8 8 0 00-14.9-3.9M4 4v4h4" />
              <path d="M4 13a8 8 0 0014.9 3.9M20 20v-4h-4" />
            </svg>
            Replay pipeline
          </button>

          <DoctorMenu />
        </aside>

        <main className="min-w-0 flex-1 px-8 py-7">{children}</main>
      </div>
      {walkthrough && <PipelineWalkthrough onClose={closeWalkthrough} />}
    </>
  );
}
