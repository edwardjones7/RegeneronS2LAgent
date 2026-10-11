import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { AREA_STYLES } from '@/components/trials/areaStyles';
import { FilterMenu } from '@/components/trials/FilterMenu';
import { TrialCard } from '@/components/trials/TrialCard';
import { AppShell } from '@/components/ui';
import { getPatientStats } from '@/lib/patients';
import { DEMO_PRACTICE, greeting } from '@/lib/practice';
import { listOpenTrials, type TrialListItem } from '@/lib/trials';
import { AREA_LABELS, AREA_ORDER, type TherapeuticArea } from '@/lib/trials/areas';
import { filtersHref, matchesMenuFilters, parseFilters, type TrialFilters } from '@/lib/trials/filters';
import { cn } from '@/lib/utils/cn';

interface TrialsPageProps {
  filters: TrialFilters;
  trials: TrialListItem[];
  /** Trials per area, after the menu filters. */
  areaCounts: { area: TherapeuticArea; count: number }[];
  total: number;
  greeting: string;
  practicePatients: number;
}

export const getServerSideProps: GetServerSideProps<TrialsPageProps> = async ({ query }) => {
  const filters = parseFilters(query);
  const all = await listOpenTrials();

  const inScope = all.filter((t) => matchesMenuFilters(t, filters));
  const areaCounts = AREA_ORDER.map((area) => ({ area, count: inScope.filter((t) => t.area === area).length })).filter(
    (a) => a.count > 0 || a.area === filters.area
  );

  return {
    props: {
      filters,
      trials: filters.area ? inScope.filter((t) => t.area === filters.area) : inScope,
      areaCounts,
      total: inScope.length,
      greeting: greeting(),
      practicePatients: getPatientStats().counties.find((c) => c.name === DEMO_PRACTICE.county)?.count ?? 0,
    },
  };
};

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

export default function TrialsPage({ filters, trials, areaCounts, total, greeting, practicePatients }: TrialsPageProps) {
  return (
    <AppShell title="Trials" active="trials">
      <header>
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
        <Link href={filtersHref({ ...filters, area: null })} scroll={false} className={pillClass(!filters.area)}>
          All <span className="ml-1.5 tabular-nums opacity-60">{total}</span>
        </Link>
        {areaCounts.map(({ area, count }) => (
          <AreaPill key={area} area={area} count={count} href={filtersHref({ ...filters, area })} active={filters.area === area} />
        ))}
        <FilterMenu filters={filters} resultCount={trials.length} />
      </div>

      {trials.length === 0 ? (
        <p className="mt-10 text-center text-sm text-ink-3">No trials match these filters.</p>
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
