import type { ReactNode } from 'react';

export function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-5 rounded-lg border border-line border-l-[3px] border-l-accent bg-surface-2 px-4 py-3 text-[13px] text-ink-2">
      <span className="font-semibold text-ink">{title}</span> {children}
    </div>
  );
}
