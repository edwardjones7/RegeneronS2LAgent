import Link from 'next/link';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { AREA_LABELS, type TherapeuticArea } from '@/lib/trials/areas';
import { filtersHref, type TrialFilters } from '@/lib/trials/filters';
import { cn } from '@/lib/utils/cn';
import { AREA_STYLES } from './areaStyles';

const GAP = 8;

export const pillClass = (active: boolean) =>
  cn(
    'flex h-8 shrink-0 items-center rounded-full border px-3 text-[12.5px] font-medium transition-colors',
    active ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-2 hover:border-ink-3'
  );

interface AreaPillProps {
  area: TherapeuticArea;
  count: number;
  href?: string;
  active: boolean;
  /** Label always shown; otherwise it's a dot that opens on hover. */
  open: boolean;
  /** Called when a collapsed pill starts opening, so the row can keep it in view. */
  onReveal?: (el: HTMLElement) => void;
}

function AreaPill({ area, count, href, active, open, onReveal }: AreaPillProps) {
  const body = (
    <>
      <span className={cn('size-2.5 shrink-0 rounded-full', AREA_STYLES[area].dot)} />
      <span
        className={cn(
          'overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300 ease-out',
          open ? 'max-w-48 opacity-100' : 'max-w-0 opacity-0 group-hover/pill:max-w-48 group-hover/pill:opacity-100'
        )}
      >
        <span className="pl-1.5">
          {AREA_LABELS[area]} <span className="tabular-nums opacity-60">{count}</span>
        </span>
      </span>
    </>
  );
  const className = cn(pillClass(active), 'group/pill px-2.5');
  return href ? (
    <Link
      href={href}
      scroll={false}
      aria-label={AREA_LABELS[area]}
      className={className}
      onMouseEnter={open ? undefined : (e) => onReveal?.(e.currentTarget)}
      onFocus={open ? undefined : (e) => onReveal?.(e.currentTarget)}
    >
      {body}
    </Link>
  ) : (
    <span className={className}>{body}</span>
  );
}

interface AreaFilterProps {
  filters: TrialFilters;
  areaCounts: { area: TherapeuticArea; count: number }[];
  total: number;
}

/**
 * Area pills, labelled for as many as fit the row; the rest collapse to color dots
 * that open on hover. The selected area always keeps its label.
 */
export function AreaFilter({ filters, areaCounts, total }: AreaFilterProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  // Server render shows every label; the layout effect trims before first paint.
  const [openAreas, setOpenAreas] = useState<Set<TherapeuticArea>>(() => new Set(areaCounts.map((a) => a.area)));

  const fit = useCallback(() => {
    const row = rowRef.current;
    const measure = measureRef.current;
    if (!row || !measure) return;

    const widths = [...measure.children].map((el) => (el as HTMLElement).offsetWidth);
    const [allWidth, dotWidth, ...openWidths] = widths;
    let used = allWidth + areaCounts.length * (dotWidth + GAP);
    const open = new Set<TherapeuticArea>();

    const selected = areaCounts.findIndex((a) => a.area === filters.area);
    if (selected >= 0) {
      open.add(filters.area!);
      used += openWidths[selected] - dotWidth;
    }
    for (const [i, { area }] of areaCounts.entries()) {
      if (open.has(area)) continue;
      const extra = openWidths[i] - dotWidth;
      if (used + extra > row.clientWidth) break;
      open.add(area);
      used += extra;
    }
    setOpenAreas(open);
  }, [areaCounts, filters.area]);

  /** Follows a pill while it opens (the width animates for 300ms), scrolling the row so its right edge stays visible. */
  const reveal = useCallback((el: HTMLElement) => {
    const row = rowRef.current;
    if (!row) return;
    const start = performance.now();
    const follow = () => {
      const overflow = el.offsetLeft + el.offsetWidth + 2 - (row.scrollLeft + row.clientWidth);
      if (overflow > 0) row.scrollLeft += overflow;
      if (performance.now() - start < 350) requestAnimationFrame(follow);
    };
    requestAnimationFrame(follow);
  }, []);

  useLayoutEffect(() => {
    fit();
    const observer = new ResizeObserver(fit);
    if (rowRef.current) observer.observe(rowRef.current);
    return () => observer.disconnect();
  }, [fit]);

  return (
    <div className="relative min-w-0 flex-1 overflow-hidden">
      {/* Scrolls sideways without a scrollbar, so an opening pill near the edge can be brought into view. */}
      <div
        ref={rowRef}
        className="relative flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <Link href={filtersHref({ ...filters, area: null })} scroll={false} className={pillClass(!filters.area)}>
          All <span className="ml-1.5 tabular-nums opacity-60">{total}</span>
        </Link>
        {areaCounts.map(({ area, count }) => (
          <AreaPill
            key={area}
            area={area}
            count={count}
            href={filtersHref({ ...filters, area })}
            active={filters.area === area}
            open={openAreas.has(area)}
            onReveal={reveal}
          />
        ))}
      </div>

      {/* Off-screen copies used only to measure pill widths: [All, a dot, each area open]. */}
      <div ref={measureRef} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 flex">
        <span className={pillClass(!filters.area)}>
          All <span className="ml-1.5 tabular-nums">{total}</span>
        </span>
        <AreaPill area="other" count={0} active={false} open={false} />
        {areaCounts.map(({ area, count }) => (
          <AreaPill key={area} area={area} count={count} active={false} open />
        ))}
      </div>
    </div>
  );
}
