import Link from 'next/link';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
  /** Usually a <Tabs />. */
  tabs?: ReactNode;
}

export function PageHeader({ title, description, back, actions, tabs }: PageHeaderProps) {
  return (
    <header>
      {back && (
        <Link href={back.href} className="mb-2 inline-block text-xs font-semibold text-ink-3 hover:text-ink-2">
          ← {back.label}
        </Link>
      )}
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em]">{title}</h1>
          {description && <p className="mt-2 text-sm font-medium text-accent">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </div>
      {tabs && <div className="mt-5">{tabs}</div>}
    </header>
  );
}
