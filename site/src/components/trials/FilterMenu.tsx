import { useRouter } from 'next/router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { countMenuFilters, FILTER_GROUPS, filtersToQuery, NO_MENU_FILTERS, type TrialFilters } from '@/lib/trials/filters';
import { cn } from '@/lib/utils/cn';

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-7 rounded-full border px-2.5 text-[12px] font-medium transition-colors',
        active ? 'border-ink bg-ink text-white' : 'border-line text-ink-2 hover:border-ink-3'
      )}
    >
      {children}
    </button>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/** "Filters" button with a dropdown of every fact on the trial card. Changes apply immediately via the URL. */
export function FilterMenu({ filters, resultCount }: { filters: TrialFilters; resultCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = countMenuFilters(filters);

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

  const apply = (next: TrialFilters) => router.push({ pathname: '/trials', query: filtersToQuery(next) }, undefined, { scroll: false });

  const toggle = (key: (typeof FILTER_GROUPS)[number]['key'], value: string) => {
    const current = filters.groups[key];
    const values = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    apply({ ...filters, groups: { ...filters.groups, [key]: values } });
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          'flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors',
          open || active ? 'border-ink text-ink' : 'border-line bg-surface text-ink-2 hover:border-ink-3'
        )}
      >
        <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M4 6h16M7 12h10M10 18h4" />
        </svg>
        Filters
        {active > 0 && (
          <span className="flex size-4.5 items-center justify-center rounded-full bg-ink text-[10.5px] font-semibold text-white">
            {active}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-[340px] rounded-2xl border border-line bg-surface p-4 shadow-[0_16px_40px_-16px_rgba(30,36,48,0.3)]">
          <div className="space-y-4">
            <Section label="Show only">
              <Chip active={filters.ready} onClick={() => apply({ ...filters, ready: !filters.ready })}>
                Criteria ready
              </Chip>
              <Chip active={filters.nj} onClick={() => apply({ ...filters, nj: !filters.nj })}>
                Recruiting in NJ
              </Chip>
            </Section>
            {FILTER_GROUPS.map((g) => (
              <Section key={g.key} label={g.label}>
                {g.options.map((o) => (
                  <Chip key={o.value} active={filters.groups[g.key].includes(o.value)} onClick={() => toggle(g.key, o.value)}>
                    {o.label}
                  </Chip>
                ))}
              </Section>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-line-2 pt-3 text-[12.5px]">
            <button
              type="button"
              onClick={() => apply({ ...filters, ...NO_MENU_FILTERS })}
              disabled={!active}
              className="font-medium text-ink-2 hover:text-ink disabled:text-ink-3"
            >
              Clear all
            </button>
            <span className="text-ink-3">
              {resultCount} {resultCount === 1 ? 'trial' : 'trials'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
