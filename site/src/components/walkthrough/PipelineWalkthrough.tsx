import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AreaArt } from '@/components/trials/AreaArt';
import { AreaIcon } from '@/components/trials/AreaIcon';
import { AREA_STYLES } from '@/components/trials/areaStyles';
import { PhaseBadge } from '@/components/trials/PhaseBadge';
import { AREA_LABELS } from '@/lib/trials/areas';
import { fetchJson } from '@/lib/utils/api';
import { cn } from '@/lib/utils/cn';
import { formatDate } from '@/lib/utils/format';
import type { TrialListItem } from '@/lib/trials';
import type { WalkthroughData, WalkthroughTrial } from '@/pages/api/walkthrough';

/**
 * A motion walkthrough of the pipeline, for the demo: fetch trials → match them
 * against the practice's patients → the dashboard. It replays the last matcher run; nothing
 * is re-run here. Every number is real: the open trial count, the panel size, and each trial's
 * candidate and chart-review counts from `prescreen_trial_counts`.
 */

const SCENES = [
  { key: 'fetch', label: 'Fetch trials', ms: 4600 },
  { key: 'match', label: 'Match patients', ms: 5400 },
  { key: 'recommend', label: 'Recommend', ms: 3200 },
] as const;

type SceneKey = (typeof SCENES)[number]['key'];

/** While a scene is being designed, play only it, on a loop. null plays the whole run. */
const FOCUS: SceneKey | null = null;

const TOTAL_MS = SCENES.reduce((n, s) => n + s.ms, 0);
/** How long the outgoing scene fades out while the next one comes in (matches animate-fade-out). */
const CROSSFADE_MS = 220;

/** Matches duration-700 on the overlay. */
const LEAVE_MS = 700;

const easeOut = (x: number) => 1 - (1 - Math.min(Math.max(x, 0), 1)) ** 3;

/** Stable 0–1 value per index, so illustrative numbers are the same every run. */
function rand(i: number): number {
  let x = Math.imul(i + 1, 2654435761) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296; // XOR yields a signed int; make it unsigned before scaling
}

/* ————————— Pieces ————————— */

/** One trial in the vertical carousel. */
function TrialRow({ trial }: { trial: WalkthroughTrial }) {
  const style = AREA_STYLES[trial.area];
  return (
    <div className="flex h-[72px] items-center gap-3 overflow-hidden rounded-2xl border border-line-2 bg-surface p-3 shadow-[0_1px_2px_rgba(30,36,48,0.05)]">
      <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br', style.gradient)}>
        <AreaIcon area={trial.area} className="size-5 text-white" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[14.5px] font-semibold">{trial.indication}</span>
        <span className="block truncate text-[12.5px] text-ink-3">
          {[trial.drug, AREA_LABELS[trial.area]].filter(Boolean).join(' · ')}
        </span>
      </span>
    </div>
  );
}

/** Placeholder row: the trial still being looked for (top) or one leaving (bottom). */
function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn('flex h-[72px] items-center gap-3 rounded-2xl border border-line-2 bg-surface p-3', className)}>
      <span className="size-11 shrink-0 animate-pulse rounded-xl bg-surface-2" />
      <span className="flex-1 space-y-2">
        <span className="block h-3 w-3/5 animate-pulse rounded-full bg-surface-2" />
        <span className="block h-2.5 w-2/5 animate-pulse rounded-full bg-surface-2" />
      </span>
    </div>
  );
}

/** Six slots, 72px rows with a 12px gap, as full class names for Tailwind. Slots 0 and 5 hold skeletons. */
const SLOT_Y = ['translate-y-0', 'translate-y-[84px]', 'translate-y-[168px]', 'translate-y-[252px]', 'translate-y-[336px]', 'translate-y-[420px]'];
/** The push-down slide (duration-[420ms]) nearly fills each gap, so the stack keeps moving. */
const FOUND_EVERY_MS = 450;

/** `t` keeps running across loops, so the stream of found trials never restarts. */
function FetchScene({ data, t }: { data: WalkthroughData; t: number }) {
  const count = Math.round(easeOut(t / 3500) * data.trialCount);
  const found = 1 + Math.floor(t / FOUND_EVERY_MS);

  // Trial `seq` sits `found - seq` slots down: 0 = still hidden behind the top skeleton,
  // 1–4 = visible, 5 = fading out over the bottom skeleton.
  const rows = [];
  for (let seq = Math.max(0, found - 5); seq <= found; seq++) rows.push({ seq, slot: found - seq });

  return (
    <div className="mx-auto grid w-full max-w-5xl animate-modal-in grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-16">
      <div className="relative h-[492px]">
        <SkeletonRow className={cn('absolute inset-x-0 top-0', SLOT_Y[0])} />
        <SkeletonRow className={cn('absolute inset-x-0 top-0 opacity-50', SLOT_Y[5])} />
        {rows.map(({ seq, slot }) => (
          <div
            key={seq}
            className={cn(
              'absolute inset-x-0 top-0 transition-[translate,opacity] duration-[420ms] ease-in-out',
              SLOT_Y[slot],
              slot === 0 || slot === 5 ? 'opacity-0' : 'opacity-100'
            )}
          >
            {data.trials.length > 0 && <TrialRow trial={data.trials[seq % data.trials.length]} />}
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-[34px] font-semibold leading-tight tracking-[-0.03em]">Fetching open trials</h2>
        <div className="mt-6 flex items-baseline gap-3">
          <span className="text-[112px] font-semibold leading-none tabular-nums tracking-[-0.05em]">{count}</span>
          <span className="text-[17px] text-ink-3">open trials</span>
        </div>
        <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-ink-2">
          Every recruiting Regeneron trial, synced into the database with its criteria, sites and dates.
        </p>
      </div>
    </div>
  );
}

/** Deck depth: the newest card in front, older ones peeking out above and behind. Full class names for Tailwind. */
const DECK = [
  'z-40 translate-y-0 scale-100 opacity-100',
  'z-30 -translate-y-5 scale-95 opacity-80',
  'z-20 -translate-y-10 scale-90 opacity-50',
  'z-10 -translate-y-14 scale-[0.85] opacity-25',
];

/** At most this many dots per card; past it, one dot stands for several patients. */
const MAX_DOTS = 200;
/** Cards dealt onto the deck; the rest are counted, not shown. */
const DECK_SIZE = DECK.length;

/**
 * The patients the matcher checked for one trial, as dots: one per patient, or one per
 * `perDot` patients on a big panel. A bucket with anyone in it gets at least one dot.
 */
function dotLayout(candidates: number, review: number, notAMatch: number) {
  const checked = candidates + review + notAMatch;
  const perDot = Math.max(1, Math.ceil(checked / MAX_DOTS));
  const total = Math.max(1, Math.ceil(checked / perDot));
  const cand = Math.min(total, candidates ? Math.max(1, Math.round(candidates / perDot)) : 0);
  const rev = Math.min(total - cand, review ? Math.max(1, Math.round(review / perDot)) : 0);
  return { perDot, total, cand, rev, checked };
}

/** One trial being matched: its patients as dots, the matches lighting up as the counts tick up. */
function MatchCard({ trial, i, age }: { trial: TrialListItem; i: number; age: number }) {
  const style = AREA_STYLES[trial.area];
  const candidates = trial.prescreen?.candidates ?? 0;
  const review = trial.prescreen?.review ?? 0;
  const dots = dotLayout(candidates, review, trial.prescreen?.notAMatch ?? 0);
  const progress = easeOut((age - 250) / 900);
  // Which dots light up: a stable shuffle per trial, candidates first, then those to review.
  const rank = Array.from({ length: dots.total }, (_, j) => j).sort((a, b) => rand(a + i * 997) - rand(b + i * 997));
  const order = new Map(rank.map((dot, k) => [dot, k]));
  const lit = progress * (dots.cand + dots.rev);

  return (
    <div className="relative flex h-[440px] flex-col overflow-hidden rounded-3xl border border-line-2 bg-surface p-5 shadow-[0_16px_40px_-20px_rgba(30,36,48,0.3)]">
      <div className={cn('absolute inset-x-0 top-0 h-48 bg-linear-to-br [mask-image:linear-gradient(to_bottom,black_20%,transparent)]', style.gradient)} />
      <AreaArt area={trial.area} />
      <div className="relative flex items-start justify-between gap-2">
        <span className="flex h-7 items-center gap-1.5 rounded-full bg-white/80 px-2.5 text-[11px] font-semibold ring-1 ring-white/70 backdrop-blur-md">
          <AreaIcon area={trial.area} className={cn('size-3.5', style.text)} />
          {AREA_LABELS[trial.area]}
        </span>
        <PhaseBadge phases={trial.phases} className="h-7 shrink-0 whitespace-nowrap rounded-full bg-white/80 px-2.5 ring-1 ring-white/70 backdrop-blur-md" />
      </div>

      <div className="relative mt-auto">
        <h3 className="text-[20px] font-semibold leading-snug tracking-[-0.02em]">{trial.indication}</h3>
        <p className="mt-0.5 truncate text-[13px] text-ink-3">{trial.drug}</p>

        {/* The practice's patients, one dot each. */}
        <div className="mt-4 grid grid-cols-25 gap-[3px]">
          {Array.from({ length: dots.total }, (_, dot) => {
            const k = order.get(dot)!;
            const tone = k < Math.min(lit, dots.cand) ? 'bg-pass' : k >= dots.cand && k < lit ? 'bg-unk' : 'bg-ink/[0.08]';
            return <span key={dot} className={cn('aspect-square rounded-full transition-colors duration-300', tone)} />;
          })}
        </div>
        <p className="mt-2 text-[11px] text-ink-3">
          {dots.checked.toLocaleString()} patients checked{dots.perDot > 1 && ` · 1 dot = ${dots.perDot} patients`}
        </p>

        <div className="mt-4 flex gap-6 border-t border-line-2 pt-3">
          <span>
            <span className="block text-[26px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-pass">
              {Math.round(progress * candidates)}
            </span>
            <span className="text-[12px] text-ink-3">candidates</span>
          </span>
          <span>
            <span className="block text-[26px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-unk">
              {Math.round(progress * review)}
            </span>
            <span className="text-[12px] text-ink-3">to chart review</span>
          </span>
        </div>
      </div>
    </div>
  );
}

const MATCH_EVERY_MS = 1150;
/** First card lands just after the scene starts, while step 1 is still fading out. */
const FIRST_MATCH_MS = 150;

function MatchScene({ data, t }: { data: WalkthroughData; t: number }) {
  // The deck shows the top-ranked trials; the big number counts every trial that fits.
  const matchable = data.matched.slice(0, DECK_SIZE);
  const matched = Math.min(matchable.length, Math.max(0, Math.floor((t - FIRST_MATCH_MS) / MATCH_EVERY_MS) + 1));
  const counted = Math.round(easeOut((t - FIRST_MATCH_MS) / (MATCH_EVERY_MS * DECK_SIZE)) * data.matched.length);

  return (
    <div className="mx-auto grid w-full max-w-5xl animate-modal-in grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-16">
      {/* A deck: each matched trial is dealt on top, the earlier ones stacking up behind it. */}
      <div className="relative mx-auto mt-14 h-[440px] w-[360px]">
        {matchable.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center rounded-3xl border border-dashed border-line p-8 text-center text-[14px] text-ink-3">
            {data.screened ? 'None of your patients fit an open trial in the last run.' : 'Your patients haven’t been pre-screened yet.'}
          </div>
        )}
        {matchable.map((trial, i) => {
          if (i > matched) return null; // not dealt yet
          const depth = matched - 1 - i; // -1 = waiting below, about to be dealt
          return (
            <div
              key={trial.nctId}
              className={cn(
                'absolute inset-0 transition-[translate,scale,opacity] duration-500 ease-out',
                depth < 0 ? 'z-50 translate-y-24 opacity-0' : (DECK[depth] ?? 'z-0 -translate-y-14 scale-[0.85] opacity-0')
              )}
            >
              <MatchCard trial={trial} i={i} age={t - FIRST_MATCH_MS - i * MATCH_EVERY_MS} />
            </div>
          );
        })}
      </div>

      <div>
        <h2 className="text-[34px] font-semibold leading-tight tracking-[-0.03em]">Matching your patients</h2>
        <div className="mt-6 flex items-baseline gap-3">
          <span className="text-[112px] font-semibold leading-none tabular-nums tracking-[-0.05em]">{counted}</span>
          <span className="text-[17px] text-ink-3">{counted === 1 ? 'trial fits' : 'trials fit'} your patients</span>
        </div>
        <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-ink-2">
          Your {data.patientCount.toLocaleString()} patients, pre-screened against {data.screened.toLocaleString()} open{' '}
          {data.screened === 1 ? 'trial' : 'trials'}. Records never leave your practice.
        </p>
        {data.evaluatedAt && (
          <p className="mt-3 text-[12px] text-ink-3">From the pre-screen run on {formatDate(data.evaluatedAt.slice(0, 10))}.</p>
        )}
      </div>
    </div>
  );
}

/** The payoff: how many trials fit, then the overlay dissolves into the dashboard. */
function RecommendScene({ data, onFinish }: { data: WalkthroughData; onFinish: () => void }) {
  const fit = data.matched.length;
  return (
    <div className="mx-auto max-w-2xl animate-modal-in text-center">
      <div className="flex items-baseline justify-center gap-4">
        <span className="text-[140px] font-semibold leading-none tabular-nums tracking-[-0.05em]">{fit}</span>
        <span className="text-left text-[28px] font-semibold leading-tight tracking-[-0.025em]">
          {fit === 1 ? 'trial fits' : 'trials fit'}
          <br />
          your patients
        </span>
      </div>
      <p className="mx-auto mt-6 max-w-md text-[16px] leading-relaxed text-ink-2">
        {fit ? 'Ranked by how many of your patients could join. Take a look.' : 'Nothing to recommend yet. The open trials are still on the dashboard.'}
      </p>
      <button
        type="button"
        onClick={onFinish}
        className="mt-8 inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[14px] font-semibold text-white transition-colors hover:bg-ink/85"
      >
        See your trials
        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}

function renderScene(key: SceneKey, data: WalkthroughData, t: number, onFinish: () => void) {
  if (key === 'fetch') return <FetchScene data={data} t={t} />;
  if (key === 'match') return <MatchScene data={data} t={t} />;
  return <RecommendScene data={data} onFinish={onFinish} />;
}

/* ————————— Overlay ————————— */

export function PipelineWalkthrough({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<WalkthroughData | null>(null);
  const [error, setError] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const started = useRef<number | null>(null);

  useEffect(() => {
    fetchJson<WalkthroughData>('/api/walkthrough').then(setData, () => setError(true));
  }, []);

  /** End of the run (or Skip): land on the dashboard and dissolve into it. */
  const finish = useCallback(() => {
    setLeaving(true);
    window.scrollTo({ top: 0 });
    if (router.pathname !== '/trials') void router.push('/trials');
    setTimeout(onClose, LEAVE_MS);
  }, [router, onClose]);

  // Clock: runs once the data is in, stops when the last scene ends.
  useEffect(() => {
    if (!data || leaving) return;
    let frame = 0;
    const tick = (now: number) => {
      started.current ??= now;
      const t = now - started.current;
      setElapsed(t);
      if (!FOCUS && t >= TOTAL_MS) finish();
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [data, leaving, finish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  let sceneIndex = 0;
  let sceneStart = 0;
  if (FOCUS) {
    sceneIndex = SCENES.findIndex((s) => s.key === FOCUS);
    sceneStart = elapsed - (elapsed % SCENES[sceneIndex].ms);
  } else {
    while (sceneIndex < SCENES.length - 1 && elapsed >= sceneStart + SCENES[sceneIndex].ms) {
      sceneStart += SCENES[sceneIndex].ms;
      sceneIndex += 1;
    }
  }
  const t = elapsed - sceneStart;
  const scene = SCENES[sceneIndex];
  const previous = !FOCUS && sceneIndex > 0 && t < CROSSFADE_MS ? SCENES[sceneIndex - 1] : null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex animate-fade-in flex-col bg-surface/95 backdrop-blur-xl transition-[opacity,scale] duration-700 ease-out',
        leaving ? 'scale-[1.02] opacity-0' : 'scale-100 opacity-100'
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Pipeline walkthrough"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(700px_280px_at_10%_0%,#FFD9C7,transparent),radial-gradient(700px_260px_at_50%_0%,#D4E9FB,transparent),radial-gradient(640px_240px_at_90%_0%,#E0F2D3,transparent)] [mask-image:linear-gradient(to_bottom,black_30%,transparent)]" />

      <div className="relative flex justify-end gap-2 px-8 pt-6">
        <button type="button" onClick={finish} className="h-8 rounded-full px-3 text-[12.5px] font-medium text-ink-2 ring-1 ring-line hover:text-ink">
          Skip to dashboard
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close (Esc)"
          className="flex size-8 items-center justify-center rounded-full text-ink-2 ring-1 ring-line hover:text-ink"
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="relative flex flex-1 flex-col justify-center overflow-hidden px-8 pb-16">
        {error && <p className="text-center text-[14px] text-ink-3">Couldn&apos;t load the walkthrough.</p>}
        {!data && !error && <div className="mx-auto size-6 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />}
        {/* Crossfade: the previous scene keeps running while it fades out over the new one's entrance. */}
        {data && previous && (
          <div key={previous.key} className="pointer-events-none absolute inset-0 flex animate-fade-out flex-col justify-center px-8 pb-16">
            {renderScene(previous.key, data, previous.ms + t, finish)}
          </div>
        )}
        {data && (
          <div key={scene.key} className="absolute inset-0 flex flex-col justify-center px-8 pb-16">
            {/* While focused on, the fetch scene runs on the total clock so its stream doesn't restart. */}
            {renderScene(scene.key, data, scene.key === 'fetch' && FOCUS === 'fetch' ? elapsed : t, finish)}
          </div>
        )}
      </div>
    </div>
  );
}
