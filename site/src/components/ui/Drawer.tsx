import Link from 'next/link';
import type { ReactNode } from 'react';

interface DrawerProps {
  title: string;
  subtitle?: ReactNode;
  /** URL that closes the drawer (the page without the selection param). */
  closeHref: string;
  children: ReactNode;
}

/** Right-hand detail panel. Opened and closed through the URL. */
export function Drawer({ title, subtitle, closeHref, children }: DrawerProps) {
  return (
    <>
      <Link href={closeHref} scroll={false} aria-label="Close" className="fixed inset-0 z-10 bg-ink/10" />
      <aside className="fixed inset-y-0 right-0 z-20 flex w-[440px] max-w-full flex-col border-l border-line bg-surface shadow-[0_0_40px_rgba(30,36,48,0.08)]">
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            {subtitle && <div className="mt-0.5 text-[13px] text-ink-3">{subtitle}</div>}
          </div>
          <Link href={closeHref} scroll={false} className="text-ink-3 hover:text-ink" aria-label="Close">
            ✕
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </>
  );
}

export function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">{title}</h3>
      {children}
    </section>
  );
}
