import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { AREA_STYLES } from '@/components/trials/areaStyles';
import { TrialCard } from '@/components/trials/TrialCard';
import { AppShell, type NavCounts } from '@/components/ui';
import { getNavCounts } from '@/lib/nav';
import { getPatientStats } from '@/lib/patients';
import { DEMO_PRACTICE, greeting } from '@/lib/practice';
import { listOpenTrials, type TrialListItem } from '@/lib/trials';
import { AREA_LABELS, AREA_ORDER, isTherapeuticArea, type TherapeuticArea } from '@/lib/trials/areas';
import { cn } from '@/lib/utils/cn';

interface Filters {
  area: TherapeuticArea | null;
  nj: boolean;
}

interface TrialsPageProps {
  counts: NavCounts;
  filters: Filters;
  trials: TrialListItem[];
  /** Trials per area, after the NJ filter. */
  areaCounts: { area: TherapeuticArea; count: number }[];
  total: number;
  greeting: string;
  practicePatients: number;
}

export const getServerSideProps: GetServerSideProps<TrialsPageProps> = async ({ query }) => {
  const filters: Filters = { area: isTherapeuticArea(query.area) ? query.area : null, nj: query.nj === '1' };
  const [counts, all] = await Promise.all([getNavCounts(), listOpenTrials()]);

  const inScope = filters.nj ? all.filter((t) => t.njRecruiting > 0) : all;
  const areaCounts = AREA_ORDER.map((area) => ({ area, count: inScope.filter((t) => t.area === area).length })).filter(
    (a) => a.count > 0
  );

  return {
    props: {
      counts,
      filters,
      trials: filters.area ? inScope.filter((t) => t.area === filters.area) : inScope,
      areaCounts,
      total: inScope.length,
      greeting: greeting(),
      practicePatients: getPatientStats().counties.find((c) => c.name === DEMO_PRACTICE.county)?.count ?? 0,
    },
  };
};

function href(filters: Filters, changes: Partial<Filters>): string {
  const next = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (next.area) params.set('area', next.area);
  if (next.nj) params.set('nj', '1');
  const qs = params.toString();
  return qs ? `/trials?${qs}` : '/trials';
}

const pillClass = (active: boolean) =>
  cn(
    'flex h-8 shrink-0 items-center rounded-full border px-3 text-[12.5px] font-medium transition-colors',
    active ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-2 hover:border-ink-3'
  );

/** A color dot that opens up to show its label on hover, and stays open when selected. */
function AreaPill({ area, count, href: to, active }: { area: TherapeuticArea; count: number; href: string; active: boolean }) {
  return (
    <Link href={to} scroll={false} aria-label={AREA_LABELS[area]} className={cn(pillClass(active), 'group/pill px-2.5')}>
      <span className={cn('size-2.5 shrink-0 rounded-full', AREA_STYLES[area].dot)} />
      <span
        className={cn(
          'overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300 ease-out',
          active ? 'max-w-48 opacity-100' : 'max-w-0 opacity-0 group-hover/pill:max-w-48 group-hover/pill:opacity-100'
        )}
      >
        <span className="pl-1.5">
          {AREA_LABELS[area]} <span className="tabular-nums opacity-60">{count}</span>
        </span>
      </span>
    </Link>
  );
}

export default function TrialsPage({ counts, filters, trials, areaCounts, total, greeting, practicePatients }: TrialsPageProps) {
  return (
    <AppShell title="Trials" active="trials" counts={counts}>
      <header className="relative isolate">
        {/* Soft wash of the area colors behind the greeting. */}
        <div className="pointer-events-none absolute -inset-x-8 -top-7 -z-10 h-64 bg-[radial-gradient(520px_200px_at_8%_0%,#FFD9C7,transparent),radial-gradient(520px_200px_at_40%_0%,#D4E9FB,transparent),radial-gradient(480px_180px_at_70%_0%,#E0F2D3,transparent)] [mask-image:linear-gradient(to_bottom,black_40%,transparent)]" />
        <p className="text-[13px] font-medium text-ink-2">
          {DEMO_PRACTICE.name} · {practicePatients.toLocaleString()} patients
        </p>
        <h1 className="mt-1 text-[34px] font-semibold leading-tight tracking-[-0.03em]">
          {greeting}, {DEMO_PRACTICE.doctor}.
        </h1>
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-2">
          We checked your patients against every open Regeneron trial. Here&apos;s what we&apos;d recommend for your
          practice.
        </p>
      </header>

      <div className="mt-7 flex items-center gap-2">
        <Link href={href(filters, { area: null })} scroll={false} className={pillClass(!filters.area)}>
          All <span className="ml-1.5 tabular-nums opacity-60">{total}</span>
        </Link>
        {areaCounts.map(({ area, count }) => (
          <AreaPill key={area} area={area} count={count} href={href(filters, { area })} active={filters.area === area} />
        ))}
        <Link href={href(filters, { nj: !filters.nj, area: null })} scroll={false} className={cn(pillClass(filters.nj), 'ml-auto')}>
          Recruiting in NJ
        </Link>
      </div>

      {trials.length === 0 ? (
        <p className="mt-10 text-center text-sm text-ink-3">No trials here.</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-5 lg:grid-cols-3">
          {trials.map((t) => (
            <TrialCard key={t.nctId} trial={t} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
