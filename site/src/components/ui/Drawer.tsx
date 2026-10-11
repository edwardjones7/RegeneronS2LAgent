import Link from 'next/link';
import type { ReactNode } from 'react';

interface DrawerProps {
  title: string;
  subtitle?: ReactNode;
  /** Shown left of the title, e.g. an avatar. */
  leading?: ReactNode;
  /** URL that closes the drawer (the page without the selection param). */
  closeHref: string;
  children: ReactNode;
}

/** Floating right-hand detail panel. Opened and closed through the URL. */
export function Drawer({ title, subtitle, leading, closeHref, children }: DrawerProps) {
  return (
    <>
      <Link href={closeHref} scroll={false} aria-label="Close" className="fixed inset-0 z-10 bg-ink/10 backdrop-blur-[2px]" />
      <aside className="fixed inset-y-3 right-3 z-20 flex w-[460px] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-3xl border border-line-2 bg-surface shadow-[0_24px_60px_-20px_rgba(30,36,48,0.35)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(360px_140px_at_15%_0%,#FFE3D1,transparent),radial-gradient(360px_140px_at_80%_0%,#D4E9FB,transparent)]" />
        <div className="relative flex items-start justify-between gap-4 px-6 pb-4 pt-6">
          <div className="flex min-w-0 items-center gap-3">
            {leading}
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold tracking-[-0.02em]">{title}</h2>
              {subtitle && <div className="mt-0.5 text-[13px] text-ink-2">{subtitle}</div>}
            </div>
          </div>
          <Link
            href={closeHref}
            scroll={false}
            aria-label="Close"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/80 text-ink-2 ring-1 ring-line-2 hover:text-ink"
          >
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </Link>
        </div>
        <div className="relative flex-1 overflow-y-auto px-6 pb-6">{children}</div>
      </aside>
    </>
  );
}

export function DrawerSection({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-6 first:mt-1">
      <h3 className="mb-2.5 text-[13px] font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}
