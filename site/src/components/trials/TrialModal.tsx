import { useRouter } from 'next/router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { TrialOutreach } from '@/lib/caller';
import type { ProtocolCriterion } from '@/lib/protocols';
import type { TrialArm, TrialDetail, TrialLocation } from '@/lib/trials';
import { AREA_LABELS } from '@/lib/trials/areas';
import { fetchJson, getErrorMessage } from '@/lib/utils/api';
import { cn } from '@/lib/utils/cn';
import { formatAgeRange, formatDate, formatStatus } from '@/lib/utils/format';
import type { TrialDetailResponse } from '@/pages/api/trials/[nctId]';
import { AcceptCard } from './AcceptCard';
import { AreaIcon } from './AreaIcon';
import { AREA_STYLES } from './areaStyles';
import { PhaseBadge } from './PhaseBadge';

const HOME_STATE = 'New Jersey';

/* ————————— Loading, with a small cache so stepping back and forth is instant ————————— */

const cache = new Map<string, Promise<TrialDetailResponse>>();

function loadTrial(nctId: string): Promise<TrialDetailResponse> {
  let request = cache.get(nctId);
  if (!request) {
    request = fetchJson<TrialDetailResponse>(`/api/trials/${nctId}`, { fallbackError: 'Could not load this trial' });
    request.catch(() => cache.delete(nctId));
    cache.set(nctId, request);
  }
  return request;
}

function useTrial(nctId: string | null) {
  const [state, setState] = useState<{ id: string; data?: TrialDetailResponse; error?: string } | null>(null);
  useEffect(() => {
    if (!nctId) return;
    let live = true;
    loadTrial(nctId).then(
      (data) => live && setState({ id: nctId, data }),
      (err) => live && setState({ id: nctId, error: getErrorMessage(err, 'Could not load this trial') })
    );
    return () => {
      live = false;
    };
  }, [nctId]);
  return state?.id === nctId ? state : null;
}

/* ————————— Registry codes in plain words ————————— */

const MASKING: Record<string, string> = {
  NONE: 'open label',
  SINGLE: 'single-blind',
  DOUBLE: 'double-blind',
  TRIPLE: 'double-blind',
  QUADRUPLE: 'double-blind',
};

const COMPARATORS: Record<string, string> = {
  PLACEBO_COMPARATOR: 'placebo',
  ACTIVE_COMPARATOR: 'standard treatment',
  NO_INTERVENTION: 'observation',
  SHAM_COMPARATOR: 'sham',
};

const ARM_TYPES: Record<string, string> = {
  EXPERIMENTAL: 'Experimental',
  PLACEBO_COMPARATOR: 'Placebo',
  ACTIVE_COMPARATOR: 'Comparator',
  NO_INTERVENTION: 'No treatment',
  SHAM_COMPARATOR: 'Sham',
  OTHER: 'Other',
};

/** "Randomized, open label" + "vs observation", or "Single arm". */
function describeDesign(trial: TrialDetail): { headline: string; detail: string | null } {
  const { allocation, masking } = trial.design;
  const parts = [
    allocation === 'RANDOMIZED' ? 'Randomized' : allocation === 'NON_RANDOMIZED' ? 'Non-randomized' : trial.arms.length <= 1 ? 'Single arm' : null,
    masking ? MASKING[masking] : null,
  ].filter(Boolean);
  const comparators = [...new Set(trial.arms.map((a) => (a.type ? COMPARATORS[a.type] : undefined)).filter(Boolean))];
  const headline = parts.join(', ');
  return {
    headline: headline ? headline.charAt(0).toUpperCase() + headline.slice(1) : '—',
    detail: comparators.length ? `vs ${comparators.join(' or ')}` : null,
  };
}

/** Months between two partial ISO dates ("2026-01-12", "2029-03"). */
function monthsBetween(start: string, end: string): number {
  const [sy, sm = 1] = start.split('-').map(Number);
  const [ey, em = 1] = end.split('-').map(Number);
  return (ey - sy) * 12 + (em - sm);
}

function describeTimeline(trial: TrialDetail): { headline: string; detail: string | null } {
  const { startDate, primaryCompletion } = trial;
  if (!startDate || !primaryCompletion) return { headline: formatDate(primaryCompletion), detail: null };
  const months = monthsBetween(startDate, primaryCompletion);
  const span = months >= 18 ? `about ${Math.round(months / 12)} years` : `about ${Math.max(months, 1)} months`;
  return {
    headline: `${formatDate(startDate.slice(0, 7))} – ${formatDate(primaryCompletion.slice(0, 7))}`,
    detail: `${span} to primary results`,
  };
}

const SEX_TEXT: Record<string, string> = { ALL: 'all sexes', FEMALE: 'women only', MALE: 'men only' };

/** Arm labels often repeat their type: "Experimental Arm: Cemiplimab" → "Cemiplimab". */
const armName = (arm: TrialArm) => arm.label.replace(/^(experimental|control|comparator)( arm)?\s*[:\-–]\s*/i, '');

/* ————————— Pieces ————————— */

/** Criteria the "Who can join" line already covers. */
const COVERED_BY_SUMMARY = new Set(['age', 'sex']);

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-10 first:mt-0">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-[17px] font-semibold tracking-[-0.015em]">{title}</h3>
        {aside && <span className="text-[12.5px] text-ink-3">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function Disclosure({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="group mt-4 rounded-2xl border border-line-2" open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[13.5px] font-medium text-ink-2 [&::-webkit-details-marker]:hidden">
        {title}
        <Chevron className="size-4 text-ink-3 transition-transform group-open:rotate-90" />
      </summary>
      <div className="border-t border-line-2 px-4 py-3">{children}</div>
    </details>
  );
}

function Chevron({ className, dir = 'right' }: { className?: string; dir?: 'left' | 'right' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === 'right' ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} />
    </svg>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-8 items-center justify-center rounded-full bg-white/80 text-ink-2 ring-1 ring-line-2 transition-colors hover:text-ink disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Criterion({ criterion }: { criterion: ProtocolCriterion }) {
  const include = criterion.type === 'inclusion';
  return (
    <li className="flex items-start gap-3 py-3">
      <span
        className={cn(
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full',
          include ? 'bg-pass-bg text-pass' : 'bg-fail-bg text-fail'
        )}
        aria-label={include ? 'Required' : 'Excluded'}
      >
        <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path d={include ? 'M5 12.5l4.5 4.5L19 7.5' : 'M7 7l10 10M17 7L7 17'} />
        </svg>
      </span>
      <div className="min-w-0 flex-1 text-[14.5px] leading-snug">{criterion.text}</div>
      {/* Only flag what the chart can't answer: these patients land in chart review. */}
      {criterion.check === 'review' && (
        <span
          title={criterion.reason ?? 'Not in the chart; confirmed at the screening visit.'}
          className="shrink-0 rounded-full bg-unk-bg px-2 py-0.5 text-[11.5px] font-semibold text-unk"
        >
          At screening
        </span>
      )}
    </li>
  );
}

function CriteriaGroup({ title, criteria }: { title: string; criteria: ProtocolCriterion[] }) {
  if (!criteria.length) return null;
  return (
    <div className="mt-5">
      <div className="text-[12.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">{title}</div>
      <ul className="divide-y divide-line-2">
        {criteria.map((c) => (
          <Criterion key={c.id} criterion={c} />
        ))}
      </ul>
    </div>
  );
}

function LocationList({ locations }: { locations: TrialLocation[] }) {
  return (
    <ul className="divide-y divide-line-2">
      {locations.map((l, idx) => (
        <li key={`${l.facility}-${idx}`} className="flex items-center justify-between gap-3 py-2.5 text-[13.5px]">
          <span className="min-w-0">
            <span className="block truncate font-medium">{l.facility ?? 'Unnamed site'}</span>
            <span className="block truncate text-[12.5px] text-ink-3">
              {[l.city, l.state, l.country === 'United States' ? null : l.country].filter(Boolean).join(', ')}
            </span>
          </span>
          {l.status && (
            <span className={cn('flex shrink-0 items-center gap-1.5 text-[12.5px]', l.status === 'RECRUITING' ? 'text-pass' : 'text-ink-3')}>
              <span className={cn('size-1.5 rounded-full', l.status === 'RECRUITING' ? 'bg-pass' : 'bg-ink-3/50')} />
              {formatStatus(l.status)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function GlanceRow({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="text-[12px] font-medium text-ink-3">{label}</div>
      <div className="mt-0.5 text-[14.5px] font-semibold leading-snug">{value}</div>
      {detail && <div className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{detail}</div>}
    </div>
  );
}

/** The decision facts, beside the reading column. */
function AtAGlance({ trial }: { trial: TrialDetail }) {
  const design = describeDesign(trial);
  const timeline = describeTimeline(trial);
  const outcome = trial.primaryOutcomes[0];

  return (
    <div className="divide-y divide-line-2 rounded-2xl border border-line-2 bg-surface p-5 shadow-[0_1px_2px_rgba(30,36,48,0.04)]">
      <GlanceRow label="Design" value={design.headline} detail={design.detail} />
      <GlanceRow
        label="Enrolling"
        value={trial.enrollment ? `${trial.enrollment.toLocaleString()} patients` : '—'}
        detail={trial.locations.length ? `across ${trial.locations.length.toLocaleString()} sites` : null}
      />
      <GlanceRow label="Timeline" value={timeline.headline} detail={timeline.detail} />
      {outcome && (
        <GlanceRow
          label="Main outcome"
          value={outcome.measure}
          detail={trial.primaryOutcomes.length > 1 ? `and ${trial.primaryOutcomes.length - 1} more` : null}
        />
      )}
      <GlanceRow
        label="In New Jersey"
        value={trial.njRecruiting ? `${trial.njRecruiting} recruiting ${trial.njRecruiting === 1 ? 'site' : 'sites'}` : 'No sites yet'}
        detail={trial.njRecruiting ? null : 'A chance to be the first site here'}
      />
      {trial.contact?.name && (
        <GlanceRow
          label="Study contact"
          value={trial.contact.name}
          detail={
            <span className="flex flex-col">
              {trial.contact.email && (
                <a href={`mailto:${trial.contact.email}`} className="truncate text-accent hover:underline">
                  {trial.contact.email}
                </a>
              )}
              {trial.contact.phone && <span>{trial.contact.phone}</span>}
            </span>
          }
        />
      )}
    </div>
  );
}

/** The doctor's yes, above the facts. Loaded fresh each time (not cached): it changes once accepted. */
function AcceptPanel({ nctId }: { nctId: string }) {
  const [outreach, setOutreach] = useState<{ id: string; data: TrialOutreach } | null>(null);
  useEffect(() => {
    let live = true;
    fetchJson<TrialOutreach>(`/api/trials/${nctId}/outreach`)
      .then((data) => live && setOutreach({ id: nctId, data }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [nctId]);
  if (outreach?.id !== nctId) return <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />;
  return <AcceptCard key={nctId} nctId={nctId} initial={outreach.data} />;
}

function Skeleton() {
  return (
    <div className="animate-pulse px-8 pt-2">
      <div className="h-7 w-48 rounded-full bg-surface-2" />
      <div className="mt-4 h-9 w-2/3 rounded-lg bg-surface-2" />
      <div className="mt-2 h-4 w-1/3 rounded bg-surface-2" />
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-2.5">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="h-3.5 rounded bg-surface-2" />
          ))}
        </div>
        <div className="h-72 rounded-2xl bg-surface-2" />
      </div>
    </div>
  );
}

/* ————————— Modal ————————— */

interface TrialModalProps {
  /** NCT ids of the cards on the page, in order, for previous / next. */
  order: string[];
}

/**
 * Trial detail over the trial grid. Lives in the URL as ?trial=NCT…, using shallow routing
 * so the grid isn't reloaded and keeps its scroll position.
 */
export function TrialModal({ order }: TrialModalProps) {
  const router = useRouter();
  const nctId = typeof router.query.trial === 'string' ? router.query.trial : null;
  const state = useTrial(nctId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  const index = nctId ? order.indexOf(nctId) : -1;
  const prev = index > 0 ? order[index - 1] : null;
  const next = index >= 0 && index < order.length - 1 ? order[index + 1] : null;

  const withTrial = (id: string | null) => {
    const query = { ...router.query };
    if (id) query.trial = id;
    else delete query.trial;
    return { pathname: '/trials', query };
  };
  const close = () => router.push(withTrial(null), undefined, { shallow: true, scroll: false });
  const go = (id: string | null) => id && router.replace(withTrial(id), undefined, { shallow: true, scroll: false });

  // Keyboard: Escape closes, arrows step through the grid.
  useEffect(() => {
    if (!nctId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') go(prev);
      else if (e.key === 'ArrowRight') go(next);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  // The page behind stays put while the modal scrolls.
  useEffect(() => {
    if (!nctId) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [nctId]);

  // New trial: start at the top, and warm up its neighbours.
  useEffect(() => {
    // Scrolling to the top fires onScroll, which clears the top bar's scrolled state.
    scrollRef.current?.scrollTo({ top: 0 });
    if (prev) void loadTrial(prev).catch(() => {});
    if (next) void loadTrial(next).catch(() => {});
  }, [nctId, prev, next]);

  if (!nctId) return null;

  const trial = state?.data?.trial;
  const protocol = state?.data?.protocol;
  const homeLocations = trial?.locations.filter((l) => l.state === HOME_STATE) ?? [];
  const otherLocations = trial?.locations.filter((l) => l.state !== HOME_STATE) ?? [];
  const criteria = protocol?.criteria.filter((c) => !COVERED_BY_SUMMARY.has(c.id)) ?? [];
  const withRegeneron =
    trial && !/regeneron/i.test(trial.sponsor ?? '') && trial.collaborators.some((c) => /regeneron/i.test(c));

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-6">
      <button type="button" aria-label="Close" onClick={close} className="absolute inset-0 animate-fade-in bg-ink/20 backdrop-blur-[3px]" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={trial?.indication ?? 'Trial'}
        className="relative flex h-full max-h-[900px] w-full max-w-5xl animate-modal-in flex-col overflow-hidden rounded-3xl bg-surface shadow-[0_30px_80px_-24px_rgba(30,36,48,0.45)]"
      >
        <div
          ref={scrollRef}
          onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 8)}
          className="relative flex-1 overflow-y-auto pb-12"
        >
          {/* Area gradient at the top of the content; it scrolls away with it. */}
          {trial && (
            <div
              className={cn(
                'pointer-events-none absolute inset-x-0 top-0 h-72 bg-linear-to-br opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent)]',
                AREA_STYLES[trial.area].gradient
              )}
            />
          )}

          {/* Top bar: registry id, position in the grid, previous / next, close. */}
          <div
            className={cn(
              'sticky top-0 z-10 flex items-center justify-between gap-3 px-6 py-3 transition-colors',
              scrolled ? 'border-b border-line-2 bg-surface/85 backdrop-blur-md' : 'border-b border-transparent'
            )}
          >
            <a
              href={`https://clinicaltrials.gov/study/${nctId}`}
              target="_blank"
              rel="noreferrer"
              className="flex h-8 items-center gap-1.5 rounded-full bg-white/80 px-3 text-[12.5px] font-medium text-ink-2 ring-1 ring-line-2 hover:text-ink"
            >
              {nctId}
              <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 17L17 7M9 7h8v8" />
              </svg>
            </a>
            <span className="flex items-center gap-1.5">
              {index >= 0 && (
                <span className="mr-1.5 text-[12.5px] tabular-nums text-ink-2">
                  {index + 1} of {order.length}
                </span>
              )}
              <IconButton label="Previous trial (←)" onClick={() => go(prev)} disabled={!prev}>
                <Chevron dir="left" className="size-4" />
              </IconButton>
              <IconButton label="Next trial (→)" onClick={() => go(next)} disabled={!next}>
                <Chevron className="size-4" />
              </IconButton>
              <span className="ml-1.5">
                <IconButton label="Close (Esc)" onClick={close}>
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </IconButton>
              </span>
            </span>
          </div>

          {state?.error && <p className="px-8 pt-10 text-center text-[13px] text-ink-3">{state.error}</p>}
          {!state && <Skeleton />}

          {trial && (
            <div className="relative px-8 pt-2">
              <header>
                <div className="flex items-center gap-2">
                  <span className="flex h-7 items-center gap-1.5 rounded-full bg-white/80 px-2.5 text-[11.5px] font-semibold ring-1 ring-white/70 backdrop-blur-md">
                    <AreaIcon area={trial.area} className={cn('size-3.5', AREA_STYLES[trial.area].text)} />
                    {AREA_LABELS[trial.area]}
                  </span>
                  <PhaseBadge phases={trial.phases} className="h-7 rounded-full bg-white/80 px-2.5 ring-1 ring-white/70 backdrop-blur-md" />
                  {trial.status === 'NOT_YET_RECRUITING' && (
                    <span className="flex h-7 items-center rounded-full bg-white/80 px-2.5 text-[11.5px] font-semibold text-accent ring-1 ring-white/70">
                      Opening soon
                    </span>
                  )}
                </div>
                <h2 className="mt-4 max-w-3xl text-[32px] font-semibold leading-[1.15] tracking-[-0.025em]">{trial.indication}</h2>
                <p className="mt-2 text-[15px] text-ink-2">
                  <span className="font-medium text-ink">{trial.drug ?? 'Intervention not listed'}</span>
                  {trial.sponsor && ` · ${trial.sponsor}`}
                  {withRegeneron && ' with Regeneron'}
                </p>
              </header>

              <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="min-w-0">
                  <Section title="About the study">
                    <p className="max-w-[68ch] whitespace-pre-line text-[15px] leading-7 text-ink-2">
                      {trial.summary ?? 'No summary provided.'}
                    </p>
                  </Section>

                  {trial.arms.length > 0 && (
                    <Section title="Treatment arms" aside={trial.arms.length > 1 ? `${trial.arms.length} arms` : undefined}>
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        {trial.arms.slice(0, 6).map((arm, idx) => (
                          <div key={`${arm.label}-${idx}`} className="rounded-2xl border border-line-2 p-4">
                            <div className="text-[12px] font-semibold text-ink-3">{arm.type ? (ARM_TYPES[arm.type] ?? formatStatus(arm.type)) : 'Arm'}</div>
                            <div className="mt-0.5 text-[14.5px] font-semibold leading-snug">{armName(arm)}</div>
                            {arm.description && arm.description !== armName(arm) && (
                              <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-ink-2">{arm.description}</p>
                            )}
                          </div>
                        ))}
                      </div>
                      {trial.arms.length > 6 && <p className="mt-2 text-[12.5px] text-ink-3">And {trial.arms.length - 6} more arms.</p>}
                    </Section>
                  )}

                  <Section title="Who can join">
                    <p className="text-[15px] text-ink-2">
                      <span className="font-semibold text-ink">Ages {formatAgeRange(trial.minimumAge, trial.maximumAge)}</span>
                      {trial.sex && `, ${SEX_TEXT[trial.sex] ?? formatStatus(trial.sex).toLowerCase()}`}
                      {trial.healthyVolunteers ? ', healthy volunteers accepted' : ''}.
                      {protocol && ' Key criteria from the protocol:'}
                    </p>

                    {protocol ? (
                      <>
                        <CriteriaGroup title="Must have" criteria={criteria.filter((c) => c.type === 'inclusion')} />
                        <CriteriaGroup title="Must not have" criteria={criteria.filter((c) => c.type === 'exclusion')} />
                        {protocol.note && <p className="mt-3 text-[12.5px] text-ink-3">{protocol.note}</p>}
                      </>
                    ) : (
                      <p className="mt-2 text-[13.5px] text-ink-3">
                        No pre-screening criteria written for this trial yet. The full registry text is below.
                      </p>
                    )}
                    <Disclosure title="Full eligibility text from ClinicalTrials.gov" open={!protocol}>
                      <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2">{trial.eligibilityCriteria ?? 'Not provided.'}</p>
                    </Disclosure>
                  </Section>

                  <Section title="Sites" aside={`${trial.locations.length.toLocaleString()} worldwide`}>
                    {homeLocations.length > 0 ? (
                      <LocationList locations={homeLocations} />
                    ) : (
                      <p className="text-[13.5px] text-ink-3">No sites in New Jersey yet.</p>
                    )}
                    {otherLocations.length > 0 && (
                      <Disclosure title={`Sites outside New Jersey · ${otherLocations.length.toLocaleString()}`}>
                        <LocationList locations={otherLocations} />
                      </Disclosure>
                    )}
                  </Section>

                  <p className="mt-10 text-[12px] text-ink-3">Registry record last updated {formatDate(trial.lastUpdate)}.</p>
                </div>

                <aside className="flex flex-col gap-4 lg:sticky lg:top-16 lg:self-start">
                  <AcceptPanel nctId={trial.nctId} />
                  <AtAGlance trial={trial} />
                </aside>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
