import Link from 'next/link';
import { cn } from '@/lib/utils/cn';

export interface TabItem {
  key: string;
  label: string;
  href: string;
  count?: number;
}

/** Link-based tabs, so the active tab lives in the URL. */
export function Tabs({ items, active }: { items: TabItem[]; active: string }) {
  return (
    <div className="flex gap-6 border-b border-line">
      {items.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          scroll={false}
          className={cn(
            '-mb-px border-b-2 py-2.5 text-[13px] font-semibold',
            tab.key === active ? 'border-accent text-ink' : 'border-transparent text-ink-3 hover:text-ink-2'
          )}
        >
          {tab.label}
          {tab.count !== undefined && <span className="ml-1.5 tabular-nums text-ink-3">{tab.count.toLocaleString()}</span>}
        </Link>
      ))}
    </div>
  );
}
