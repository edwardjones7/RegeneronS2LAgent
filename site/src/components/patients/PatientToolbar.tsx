import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { AREA_STYLES } from '@/components/trials/areaStyles';
import { classifyTrial } from '@/lib/trials/areas';
import { cn } from '@/lib/utils/cn';

export interface PatientFilters {
  conditions: string[];
  q: string;
}

/** Query for /patients. Conditions repeat (?condition=A&condition=B) since names can contain commas. */
export function patientsQuery(f: PatientFilters, extra: Record<string, string> = {}): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = { ...extra };
  if (f.conditions.length) query.condition = f.conditions;
  if (f.q) query.q = f.q;
  return query;
}

const SEARCH_DELAY_MS = 250;

const areaDot = (name: string) => AREA_STYLES[classifyTrial([name], [])].dot;

function ConditionPill({ name, count, active, onClick }: { name: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors',
        active ? 'border-ink bg-ink text-white' : 'border-line text-ink-2 hover:border-ink-3'
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', areaDot(name))} />
      {name}
      <span className="tabular-nums opacity-60">{count}</span>
    </button>
  );
}

interface PatientToolbarProps {
  filters: PatientFilters;
  /** Most common conditions in the practice, with patient counts. */
  conditions: { name: string; count: number }[];
  resultCount: number;
}

/** Search as the main control, with a Filters menu of condition pills. Everything applies through the URL. */
export function PatientToolbar({ filters, conditions, resultCount }: PatientToolbarProps) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const apply = (next: PatientFilters) =>
    router.replace({ pathname: '/patients', query: patientsQuery(next) }, undefined, { scroll: false });

  // Search as you type, a beat after the last keystroke.
  useEffect(() => {
    if (q === filters.q) return;
    const timer = setTimeout(() => apply({ ...filters, q }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (name: string) =>
    apply({
      q,
      conditions: filters.conditions.includes(name) ? filters.conditions.filter((c) => c !== name) : [...filters.conditions, name],
    });

  const active = filters.conditions.length;

  return (
    <div className="mt-7">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="6.5" />
            <path d="M20 20l-4-4" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or condition"
            aria-label="Search patients"
            className="h-11 w-full rounded-full border border-line bg-surface pl-11 pr-10 text-[14px] shadow-[0_1px_2px_rgba(30,36,48,0.04)] placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
            >
              <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>

        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className={cn(
              'flex h-11 items-center gap-2 rounded-full border px-4 text-[13px] font-medium transition-colors',
              open || active ? 'border-ink text-ink' : 'border-line bg-surface text-ink-2 hover:border-ink-3'
            )}
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            Filters
            {active > 0 && (
              <span className="flex size-5 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-white">
                {active}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute right-0 top-full z-20 mt-2 w-[420px] rounded-2xl border border-line bg-surface p-4 shadow-[0_16px_40px_-16px_rgba(30,36,48,0.3)]">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">Conditions</span>
                <span className="text-[11.5px] text-ink-3">Shows patients with all selected</span>
              </div>
              <div className="flex max-h-72 flex-wrap gap-1.5 overflow-y-auto">
                {conditions.map((c) => (
                  <ConditionPill
                    key={c.name}
                    name={c.name}
                    count={c.count}
                    active={filters.conditions.includes(c.name)}
                    onClick={() => toggle(c.name)}
                  />
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-line-2 pt-3 text-[12.5px]">
                <button
                  type="button"
                  onClick={() => apply({ q, conditions: [] })}
                  disabled={!active}
                  className="font-medium text-ink-2 hover:text-ink disabled:text-ink-3"
                >
                  Clear all
                </button>
                <span className="text-ink-3">
                  {resultCount} {resultCount === 1 ? 'patient' : 'patients'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {active > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {filters.conditions.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => toggle(name)}
              aria-label={`Remove ${name}`}
              className="flex h-7 items-center gap-1.5 rounded-full bg-ink px-2.5 text-[12px] font-medium text-white"
            >
              <span className={cn('size-1.5 rounded-full', areaDot(name))} />
              {name}
              <svg className="size-3 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
