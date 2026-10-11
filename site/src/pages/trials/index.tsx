import type { GetServerSideProps } from 'next';
import { AreaFilter } from '@/components/trials/AreaFilter';
import { FilterMenu } from '@/components/trials/FilterMenu';
import { TrialCard } from '@/components/trials/TrialCard';
import { TrialModal } from '@/components/trials/TrialModal';
import { AppShell } from '@/components/ui';
import { getAcceptedTrials } from '@/lib/caller';
import { getPatientStats } from '@/lib/patients';
import { DEMO_PRACTICE, greeting } from '@/lib/practice';
import { canFill, listOpenTrials, type TrialListItem } from '@/lib/trials';
import { AREA_ORDER, type TherapeuticArea } from '@/lib/trials/areas';
import { formatDate } from '@/lib/utils/format';
import { filtersToQuery, matchesMenuFilters, parseFilters, type TrialFilters } from '@/lib/trials/filters';

interface TrialsPageProps {
  filters: TrialFilters;
  /** Trials the practice's patients fit (candidates or chart review), most candidates first. */
  trials: TrialListItem[];
  /** Open trials with no candidates in the panel, or not pre-screened yet. */
  noFit: TrialListItem[];
  /** Open trials pre-screened against this practice's patients, before any filter. */
  screened: number;
  /** When the matcher last ran for this practice, if ever. */
  evaluatedAt: string | null;
  /** Trials that fit, per area, after the menu filters, largest first. */
  areaCounts: { area: TherapeuticArea; count: number }[];
  total: number;
  greeting: string;
  practicePatients: number;
  /** Trials this practice accepted, with Ava's progress. */
  outreach: Record<string, { booked: number; called: number }>;
}

export const getServerSideProps: GetServerSideProps<TrialsPageProps> = async ({ query }) => {
  const filters = parseFilters(query);
  const [all, outreach] = await Promise.all([listOpenTrials(DEMO_PRACTICE.practiceId), getAcceptedTrials()]);

  const inScope = all.filter((t) => matchesMenuFilters(t, filters));
  const fitting = inScope.filter((t) => canFill(t.prescreen));
  const shown = filters.area ? inScope.filter((t) => t.area === filters.area) : inScope;
  const evaluated = all.map((t) => t.prescreen?.evaluatedAt).filter((d): d is string => Boolean(d));
  // Biggest areas first, so they're the ones that keep their labels when the row is tight.
  const areaCounts = AREA_ORDER.map((area) => ({ area, count: fitting.filter((t) => t.area === area).length }))
    .filter((a) => a.count > 0 || a.area === filters.area)
    .sort((a, b) => b.count - a.count);

  return {
    props: {
      filters,
      // listOpenTrials already ranks by candidates, then chart review.
      trials: shown.filter((t) => canFill(t.prescreen)),
      noFit: shown.filter((t) => !canFill(t.prescreen)),
      screened: all.filter((t) => t.prescreen).length,
      evaluatedAt: evaluated.length ? evaluated.reduce((a, b) => (a > b ? a : b)) : null,
      areaCounts,
      total: fitting.length,
      greeting: greeting(),
      outreach,
      practicePatients: getPatientStats().counties.find((c) => c.name === DEMO_PRACTICE.county)?.count ?? 0,
    },
  };
};

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export default function TrialsPage({
  filters,
  trials,
  noFit,
  screened,
  evaluatedAt,
  areaCounts,
  total,
  greeting,
  practicePatients,
  outreach,
}: TrialsPageProps) {
  const hrefFor = (t: TrialListItem) => ({ pathname: '/trials', query: { ...filtersToQuery(filters), trial: t.nctId } });
  const candidates = trials.reduce((n, t) => n + (t.prescreen?.candidates ?? 0), 0);

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
          {screened === 0 ? (
            <>Your patients haven&apos;t been pre-screened against any open trial yet.</>
          ) : (
            <>
              <span className="font-semibold text-ink">{plural(trials.length, 'trial fits', 'trials fit')} your patients</span>
              {trials.length > 0 && <>, with {plural(candidates, 'pre-screen candidate', 'pre-screen candidates')} between them</>}.
              {' '}
              Ranked by how many of your patients could join. We pre-screened your panel against {plural(screened, 'open trial', 'open trials')}
              {evaluatedAt && <> on {formatDate(evaluatedAt.slice(0, 10))}</>}; patient records never left your practice.
            </>
          )}
        </p>
      </header>

      <div className="mt-7 flex items-center gap-3">
        <AreaFilter filters={filters} areaCounts={areaCounts} total={total} />
        <FilterMenu filters={filters} resultCount={trials.length} />
      </div>

      {trials.length === 0 ? (
        <p className="mt-10 text-center text-sm text-ink-3">
          {noFit.length ? 'None of your patients fit the trials that match these filters.' : 'No trials match these filters.'}
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-5 lg:grid-cols-3">
          {trials.map((t) => (
            <TrialCard key={t.nctId} trial={t} href={hrefFor(t)} outreach={outreach[t.nctId]} prescreen={t.prescreen} />
          ))}
        </div>
      )}

      {noFit.length > 0 && (
        <details className="group mt-10 border-t border-line-2 pt-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-[13.5px] font-medium text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
            <svg className="size-4 text-ink-3 transition-transform group-open:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
            No candidates in your panel
            <span className="text-ink-3">· {noFit.length.toLocaleString()}</span>
          </summary>
          <p className="mt-2 text-[12.5px] text-ink-3">
            Open trials where none of your patients pre-screened as a candidate or for chart review, or that haven&apos;t been
            pre-screened yet.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-5 lg:grid-cols-3">
            {noFit.map((t) => (
              <TrialCard key={t.nctId} trial={t} href={hrefFor(t)} outreach={outreach[t.nctId]} prescreen={t.prescreen} />
            ))}
          </div>
        </details>
      )}

      <TrialModal order={[...trials, ...noFit].map((t) => t.nctId)} />
    </AppShell>
  );
}
