import { useRouter } from 'next/router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { CriterionCheck, ProtocolCriterion } from '@/lib/protocols';
import type { TrialLocation } from '@/lib/trials';
import { AREA_LABELS } from '@/lib/trials/areas';
import { fetchJson, getErrorMessage } from '@/lib/utils/api';
import { cn } from '@/lib/utils/cn';
import { formatAgeRange, formatDate, formatStatus } from '@/lib/utils/format';
import type { TrialDetailResponse } from '@/pages/api/trials/[nctId]';
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

/* ————————— Pieces ————————— */

const CHECKS: Record<CriterionCheck, { label: string; className: string }> = {
  code: { label: 'Chart data', className: 'bg-accent-weak text-accent' },
  jev: { label: 'Jev judgment', className: 'bg-surface-2 text-ink-2' },
  review: { label: 'Confirm at screening', className: 'bg-unk-bg text-unk' },
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5">
      <div className="text-[11px] font-medium text-ink-3">{label}</div>
      <div className="mt-0.5 truncate text-[14px] font-semibold tabular-nums">{children}</div>
    </div>
  );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
        {aside && <span className="text-[12px] text-ink-3">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function Disclosure({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="group mt-3 rounded-xl border border-line-2" open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-2.5 text-[13px] font-medium text-ink-2 [&::-webkit-details-marker]:hidden">
        {title}
        <Chevron className="size-4 text-ink-3 transition-transform group-open:rotate-90" />
      </summary>
      <div className="border-t border-line-2 px-3.5 py-3">{children}</div>
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

function CriteriaList({ title, criteria }: { title: string; criteria: ProtocolCriterion[] }) {
  if (!criteria.length) return null;
  return (
    <div className="mt-3">
      <div className="mb-1.5 text-[12px] font-semibold text-ink-3">{title}</div>
      <ul className="divide-y divide-line-2 rounded-xl border border-line-2">
        {criteria.map((c) => (
          <li key={c.id} className="flex items-start justify-between gap-4 px-3.5 py-2.5">
            <div className="min-w-0 text-[13px] leading-relaxed">
              {c.text}
              {c.reason && <div className="mt-0.5 text-[12px] text-ink-3">{c.reason}</div>}
            </div>
            <span className={cn('mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', CHECKS[c.check].className)}>
              {CHECKS[c.check].label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LocationList({ locations }: { locations: TrialLocation[] }) {
  return (
    <ul className="divide-y divide-line-2">
      {locations.map((l, idx) => (
        <li key={`${l.facility}-${idx}`} className="flex items-center justify-between gap-3 py-2 text-[13px]">
          <span className="min-w-0">
            <span className="block truncate font-medium">{l.facility ?? 'Unnamed site'}</span>
            <span className="block truncate text-[12px] text-ink-3">
              {[l.city, l.state, l.country === 'United States' ? null : l.country].filter(Boolean).join(', ')}
            </span>
          </span>
          {l.status && (
            <span className={cn('flex shrink-0 items-center gap-1.5 text-[12px]', l.status === 'RECRUITING' ? 'text-pass' : 'text-ink-3')}>
              <span className={cn('size-1.5 rounded-full', l.status === 'RECRUITING' ? 'bg-pass' : 'bg-ink-3/50')} />
              {formatStatus(l.status)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse px-8 pt-4">
      <div className="h-6 w-40 rounded-full bg-surface-2" />
      <div className="mt-4 h-8 w-3/4 rounded-lg bg-surface-2" />
      <div className="mt-2 h-4 w-1/2 rounded bg-surface-2" />
      <div className="mt-6 grid grid-cols-3 gap-2 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-14 rounded-xl bg-surface-2" />
        ))}
      </div>
      <div className="mt-8 space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-3.5 rounded bg-surface-2" />
        ))}
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

  const data = state?.data;
  const trial = data?.trial;
  const protocol = data?.protocol;
  const homeLocations = trial?.locations.filter((l) => l.state === HOME_STATE) ?? [];
  const otherLocations = trial?.locations.filter((l) => l.state !== HOME_STATE) ?? [];

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-6">
      <button type="button" aria-label="Close" onClick={close} className="absolute inset-0 animate-fade-in bg-ink/20 backdrop-blur-[3px]" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={trial?.indication ?? 'Trial'}
        className="relative flex h-full max-h-[880px] w-full max-w-5xl animate-modal-in flex-col overflow-hidden rounded-3xl bg-surface shadow-[0_30px_80px_-24px_rgba(30,36,48,0.45)]"
      >
        <div
          ref={scrollRef}
          onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 8)}
          className="relative flex-1 overflow-y-auto pb-10"
        >
          {/* Area gradient at the top of the content; it scrolls away with it. */}
          {trial && (
            <div
              className={cn(
                'pointer-events-none absolute inset-x-0 top-0 h-64 bg-linear-to-br opacity-70 [mask-image:linear-gradient(to_bottom,black_10%,transparent)]',
                AREA_STYLES[trial.area].gradient
              )}
            />
          )}

          {/* Top bar: position in the grid, previous / next, registry link, close. */}
          <div
            className={cn(
              'sticky top-0 z-10 flex items-center justify-between gap-3 px-6 py-3 transition-colors',
              scrolled ? 'border-b border-line-2 bg-surface/85 backdrop-blur-md' : 'border-b border-transparent'
            )}
          >
            <span className="text-[12px] font-medium text-ink-2">
              {index >= 0 ? `${index + 1} of ${order.length}` : nctId}
            </span>
            <span className="flex items-center gap-1.5">
              <IconButton label="Previous trial (←)" onClick={() => go(prev)} disabled={!prev}>
                <Chevron dir="left" className="size-4" />
              </IconButton>
              <IconButton label="Next trial (→)" onClick={() => go(next)} disabled={!next}>
                <Chevron className="size-4" />
              </IconButton>
              <a
                href={`https://clinicaltrials.gov/study/${nctId}`}
                target="_blank"
                rel="noreferrer"
                className="ml-1.5 flex h-8 items-center gap-1 rounded-full bg-white/80 px-3 text-[12px] font-medium text-ink-2 ring-1 ring-line-2 hover:text-ink"
              >
                ClinicalTrials.gov
                <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 17L17 7M9 7h8v8" />
                </svg>
              </a>
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
              <div className="flex items-center gap-2">
                <span className="flex h-7 items-center gap-1.5 rounded-full bg-white/80 px-2.5 text-[11px] font-semibold ring-1 ring-white/70 backdrop-blur-md">
                  <AreaIcon area={trial.area} className={cn('size-3.5', AREA_STYLES[trial.area].text)} />
                  {AREA_LABELS[trial.area]}
                </span>
                <PhaseBadge phases={trial.phases} className="h-7 rounded-full bg-white/80 px-2.5 ring-1 ring-white/70 backdrop-blur-md" />
                {trial.hasProtocol && (
                  <span className="flex h-7 items-center gap-1 rounded-full bg-white/80 px-2.5 text-[11px] font-semibold text-pass ring-1 ring-white/70">
                    <span className="size-1.5 rounded-full bg-pass" />
                    Criteria ready
                  </span>
                )}
              </div>

              <h2 className="mt-4 text-[28px] font-semibold leading-tight tracking-[-0.025em]">{trial.indication}</h2>
              <p className="mt-1.5 text-[14px] text-ink-2">
                {[trial.drug, trial.sponsor, trial.nctId].filter(Boolean).join(' · ')}
              </p>

              <div className="mt-6 grid grid-cols-3 gap-2 lg:grid-cols-6">
                <Fact label="Ages">{formatAgeRange(trial.minimumAge, trial.maximumAge)}</Fact>
                <Fact label="Sex">{trial.sex ? formatStatus(trial.sex) : '—'}</Fact>
                <Fact label="Enrolling">{trial.enrollment?.toLocaleString() ?? '—'}</Fact>
                <Fact label="Status">{formatStatus(trial.status)}</Fact>
                <Fact label="Primary completion">{formatDate(trial.primaryCompletion)}</Fact>
                <Fact label="Recruiting in NJ">
                  {trial.njRecruiting ? `${trial.njRecruiting} ${trial.njRecruiting === 1 ? 'site' : 'sites'}` : 'None'}
                </Fact>
              </div>

              <Section title="About this trial">
                <p className="whitespace-pre-line text-[14px] leading-relaxed text-ink-2">{trial.summary ?? 'No summary provided.'}</p>
                {trial.interventions.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {trial.interventions.map((i, idx) => (
                      <span key={`${i.name}-${idx}`} className="rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-medium text-ink-2">
                        {i.name}
                      </span>
                    ))}
                  </div>
                )}
              </Section>

              <Section title="Eligibility" aside={protocol ? `${protocol.criteria.length} key criteria` : undefined}>
                {protocol ? (
                  <>
                    {protocol.note && <p className="text-[13px] leading-relaxed text-ink-2">{protocol.note}</p>}
                    <CriteriaList title="Inclusion" criteria={protocol.criteria.filter((c) => c.type === 'inclusion')} />
                    <CriteriaList title="Exclusion" criteria={protocol.criteria.filter((c) => c.type === 'exclusion')} />
                  </>
                ) : (
                  <p className="text-[13px] text-ink-3">No demo protocol for this trial yet, so only the registry text is available.</p>
                )}
                <Disclosure title="Full eligibility text from the registry" open={!protocol}>
                  <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-ink-2">
                    {trial.eligibilityCriteria ?? 'Not provided.'}
                  </pre>
                </Disclosure>
              </Section>

              <Section title="Locations" aside={`${trial.locations.length.toLocaleString()} total`}>
                {homeLocations.length > 0 ? (
                  <LocationList locations={homeLocations} />
                ) : (
                  <p className="text-[13px] text-ink-3">No sites in New Jersey yet.</p>
                )}
                {otherLocations.length > 0 && (
                  <Disclosure title={`Other locations · ${otherLocations.length.toLocaleString()}`}>
                    <LocationList locations={otherLocations} />
                  </Disclosure>
                )}
              </Section>

              <p className="mt-8 text-[12px] text-ink-3">
                Registry record last updated {formatDate(trial.lastUpdate)}. Started {formatDate(trial.startDate)}.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
