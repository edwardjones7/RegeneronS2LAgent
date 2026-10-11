import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AREA_STYLES } from '@/components/trials/areaStyles';
import { TrialCard } from '@/components/trials/TrialCard';
import { AppShell, type NavCounts, PageHeader } from '@/components/ui';
import { getNavCounts } from '@/lib/nav';
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

function Pill({ href: to, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={to}
      scroll={false}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition',
        active ? 'border-ink bg-ink text-white' : 'border-line text-ink-2 hover:border-ink-3'
      )}
    >
      {children}
    </Link>
  );
}

export default function TrialsPage({ counts, filters, trials, areaCounts, total }: TrialsPageProps) {
  return (
    <AppShell title="Trials" active="trials" counts={counts}>
      <PageHeader
        title="Trials"
        actions={
          <Pill href={href(filters, { nj: !filters.nj, area: null })} active={filters.nj}>
            Recruiting in NJ
          </Pill>
        }
      />

      <div className="mt-5 flex flex-wrap gap-2">
        <Pill href={href(filters, { area: null })} active={!filters.area}>
          All <span className="tabular-nums opacity-60">{total}</span>
        </Pill>
        {areaCounts.map(({ area, count }) => (
          <Pill key={area} href={href(filters, { area })} active={filters.area === area}>
            <span className={cn('size-2 rounded-full', AREA_STYLES[area].dot)} />
            {AREA_LABELS[area]} <span className="tabular-nums opacity-60">{count}</span>
          </Pill>
        ))}
      </div>

      {trials.length === 0 ? (
        <p className="mt-10 text-center text-sm text-ink-3">No trials here.</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {trials.map((t) => (
            <TrialCard key={t.nctId} trial={t} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
