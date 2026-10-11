import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface StatCardProps {
  label: string;
  value: ReactNode;
  /** Small text after the value, e.g. "/ 147". */
  suffix?: string;
  hint?: string;
  selected?: boolean;
  /** Makes the card a filter link. */
  href?: string;
}

export function StatCard({ label, value, suffix, hint, selected, href }: StatCardProps) {
  const body = (
    <>
      <div className={cn('text-[11px] font-semibold uppercase tracking-[0.08em]', selected ? 'text-accent' : 'text-ink-3')}>
        {label}
      </div>
      <div className="mt-1.5 text-[28px] font-semibold tabular-nums tracking-[-0.03em]">
        {value}
        {suffix && <span className="ml-1 text-[13px] font-medium tracking-normal text-ink-3">{suffix}</span>}
      </div>
      {hint && <div className="mt-0.5 text-xs text-ink-3">{hint}</div>}
    </>
  );
  const className = cn(
    'block rounded-[10px] border px-4 py-3.5',
    selected ? 'border-accent-line bg-accent-weak' : 'border-line bg-surface',
    href && !selected && 'hover:border-ink-3'
  );

  return href ? (
    <Link href={href} scroll={false} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">{children}</div>;
}
