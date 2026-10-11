import Head from 'next/head';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export type NavKey = 'trials' | 'patients';

export interface NavCounts {
  trials: number;
  patients: number;
}

interface NavItem {
  key: NavKey;
  label: string;
  href: string;
  count?: number;
}

interface AppShellProps {
  title: string;
  active: NavKey;
  counts: NavCounts;
  children: ReactNode;
}

/** Sidebar + main column. Every dashboard page renders inside this. */
export function AppShell({ title, active, counts, children }: AppShellProps) {
  const groups: { label: string; items: NavItem[] }[] = [
    { label: 'Trials', items: [{ key: 'trials', label: 'Open trials', href: '/trials', count: counts.trials }] },
    { label: 'Patients', items: [{ key: 'patients', label: 'All patients', href: '/patients', count: counts.patients }] },
  ];

  return (
    <>
      <Head>
        <title>{`${title} · trialmatch`}</title>
      </Head>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-line bg-surface-2 px-3 py-4">
          <Link href="/" className="px-3 pb-4 text-[15px] font-bold tracking-tight">
            trial<span className="text-accent">match</span>
          </Link>

          <nav className="flex flex-col">
            {groups.map((group) => (
              <div key={group.label}>
                <div className="px-3 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-ink-3">
                  {group.label}
                </div>
                {group.items.map((item) => {
                  const isActive = item.key === active;
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      className={cn(
                        'my-px flex items-center justify-between rounded-md px-3 py-2 text-[13px] font-medium',
                        isActive ? 'bg-surface font-semibold text-ink ring-1 ring-line' : 'text-ink-2 hover:bg-line-2'
                      )}
                    >
                      <span>{item.label}</span>
                      {item.count !== undefined && (
                        <span
                          className={cn(
                            'rounded-full px-2 py-px text-[11px] font-semibold tabular-nums',
                            isActive ? 'bg-accent text-white' : 'bg-line-2 text-ink-2'
                          )}
                        >
                          {item.count.toLocaleString()}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="mt-auto border-t border-line px-3 pt-3 text-[11.5px] leading-relaxed text-ink-2">
            <span className="block font-semibold text-ink">🔒 Patient data stays local</span>
            Patient records are read on this server and never sent to the database or the sponsor.
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-8 py-7">{children}</main>
      </div>
    </>
  );
}
