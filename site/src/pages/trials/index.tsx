import type { GetServerSideProps } from 'next';
import { AreaFilter } from '@/components/trials/AreaFilter';
import { FilterMenu } from '@/components/trials/FilterMenu';
import { TrialCard } from '@/components/trials/TrialCard';
import { AppShell } from '@/components/ui';
import { getAcceptedTrials } from '@/lib/caller';
import { getPatientStats } from '@/lib/patients';
import { DEMO_PRACTICE, greeting } from '@/lib/practice';
import { listOpenTrials, type TrialListItem } from '@/lib/trials';
import { AREA_ORDER, type TherapeuticArea } from '@/lib/trials/areas';
import { matchesMenuFilters, parseFilters, type TrialFilters } from '@/lib/trials/filters';

interface TrialsPageProps {
  filters: TrialFilters;
  trials: TrialListItem[];
  /** Trials per area after the menu filters, largest first. */
  areaCounts: { area: TherapeuticArea; count: number }[];
  total: number;
  greeting: string;
  practicePatients: number;
  /** Trials this practice accepted, with Ava's progress. */
  outreach: Record<string, { booked: number; called: number }>;
}

export const getServerSideProps: GetServerSideProps<TrialsPageProps> = async ({ query }) => {
  const filters = parseFilters(query);
  const [all, outreach] = await Promise.all([listOpenTrials(), getAcceptedTrials()]);

  const inScope = all.filter((t) => matchesMenuFilters(t, filters));
  // Biggest areas first, so they're the ones that keep their labels when the row is tight.
  const areaCounts = AREA_ORDER.map((area) => ({ area, count: inScope.filter((t) => t.area === area).length }))
    .filter((a) => a.count > 0 || a.area === filters.area)
    .sort((a, b) => b.count - a.count);

  return {
    props: {
      filters,
      trials: filters.area ? inScope.filter((t) => t.area === filters.area) : inScope,
      areaCounts,
      total: inScope.length,
      greeting: greeting(),
      practicePatients: getPatientStats().counties.find((c) => c.name === DEMO_PRACTICE.county)?.count ?? 0,
      outreach,
    },
  };
};

export default function TrialsPage({ filters, trials, areaCounts, total, greeting, practicePatients, outreach }: TrialsPageProps) {
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

      <div className="mt-7 flex items-center gap-3">
        <AreaFilter filters={filters} areaCounts={areaCounts} total={total} />
        <FilterMenu filters={filters} resultCount={trials.length} />
      </div>

      {trials.length === 0 ? (
        <p className="mt-10 text-center text-sm text-ink-3">No trials match these filters.</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-5 lg:grid-cols-3">
          {trials.map((t) => (
            <TrialCard key={t.nctId} trial={t} outreach={outreach[t.nctId]} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
