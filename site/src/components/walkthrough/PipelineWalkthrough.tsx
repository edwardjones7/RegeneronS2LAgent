import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AreaIcon } from '@/components/trials/AreaIcon';
import { AREA_STYLES } from '@/components/trials/areaStyles';
import { AREA_LABELS } from '@/lib/trials/areas';
import { fetchJson } from '@/lib/utils/api';
import { cn } from '@/lib/utils/cn';
import type { WalkthroughData, WalkthroughTrial } from '@/pages/api/walkthrough';

/**
 * A motion walkthrough of the pipeline, for the demo: fetch trials → Jev matches them
 * against the practice's patients → the dashboard. Visual only; nothing is run.
 * Real: the trial count, which trials have criteria, the panel size. Illustrative (and
 * labelled so): the candidate and chart-review counts, until Jev's results are wired in.
 */

const SCENES = [
  { key: 'fetch', label: 'Fetch trials', ms: 5500 },
  { key: 'match', label: 'Match with Jev', ms: 6500 },
  { key: 'recommend', label: 'Recommend', ms: 3800 },
] as const;

type SceneKey = (typeof SCENES)[number]['key'];

/** While a scene is being designed, play only it, on a loop. null plays the whole run. */
const FOCUS: SceneKey | null = null;

const TOTAL_MS = SCENES.reduce((n, s) => n + s.ms, 0);
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
            <TrialRow trial={data.trials[seq % data.trials.length]} />
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

/** Illustrative pre-screen counts for a matched trial. Not real results; the UI says so. */
function mockCounts(i: number) {
  return { candidates: 6 + Math.floor(rand(i) * 11), review: 2 + Math.floor(rand(i + 50) * 6) };
}

function CountsLine({ i, short = false }: { i: number; short?: boolean }) {
  const { candidates, review } = mockCounts(i);
  return (
    <span className="text-ink-2">
      <span className="font-semibold text-pass">{candidates} candidates</span> ·{' '}
      <span className="text-unk">{short ? `${review} to review` : `${review} need chart review`}</span>
    </span>
  );
}

/** A trial Jev confirmed against the practice's patients. */
function MatchRow({ trial, i }: { trial: WalkthroughTrial; i: number }) {
  const style = AREA_STYLES[trial.area];
  return (
    <div className="flex h-[72px] items-center gap-3 overflow-hidden rounded-2xl border border-line-2 bg-surface p-3 shadow-[0_1px_2px_rgba(30,36,48,0.05)]">
      <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br', style.gradient)}>
        <AreaIcon area={trial.area} className="size-5 text-white" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-semibold">{trial.indication}</span>
        <span className="block truncate text-[12.5px]">
          <CountsLine i={i} />
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-pass-bg px-2 py-0.5 text-[11.5px] font-semibold text-pass">
        <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
        Matched
      </span>
    </div>
  );
}

const MATCH_EVERY_MS = 1100;

function MatchScene({ data, t }: { data: WalkthroughData; t: number }) {
  const matchable = data.trials.filter((trial) => trial.hasProtocol);
  const matched = Math.min(matchable.length, Math.max(0, Math.floor((t - 700) / MATCH_EVERY_MS) + 1));
  const done = matched === matchable.length;

  return (
    <div className="mx-auto grid w-full max-w-5xl animate-modal-in grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-16">
      {/* Matched trials stack up; the skeleton on top is Jev still checking. Once done, it fades and the stack moves up. */}
      <div className="relative h-[408px]">
        <SkeletonRow className={cn('absolute inset-x-0 top-0 transition-opacity duration-500', done ? 'opacity-0' : 'opacity-100')} />
        {matchable.map((trial, i) => {
          if (i > matched) return null; // not reached yet
          const slot = i === matched ? 0 : matched - i - (done ? 1 : 0);
          return (
            <div
              key={trial.nctId}
              className={cn(
                'absolute inset-x-0 top-0 transition-[translate,opacity] duration-500 ease-in-out',
                SLOT_Y[slot],
                i === matched ? 'opacity-0' : 'opacity-100'
              )}
            >
              <MatchRow trial={trial} i={i} />
            </div>
          );
        })}
      </div>

      <div>
        <h2 className="flex items-center gap-3 text-[34px] font-semibold leading-tight tracking-[-0.03em]">
          Matching with Jev
          <span className={cn('size-2.5 rounded-full', done ? 'bg-pass' : 'animate-pulse bg-accent')} />
        </h2>
        <div className="mt-6 flex items-baseline gap-3">
          <span className="text-[112px] font-semibold leading-none tabular-nums tracking-[-0.05em]">{matched}</span>
          <span className="text-[17px] text-ink-3">{matched === 1 ? 'trial matches' : 'trials match'} your patients</span>
        </div>
        <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-ink-2">
          {data.patientCount} patients checked against each trial&apos;s criteria. Records stay in your practice; Jev sees
          de-identified summaries only.
        </p>
        <p className="mt-3 text-[12px] text-ink-3">Candidate counts are illustrative until Jev&apos;s results are in.</p>
      </div>
    </div>
  );
}

/** Large card for the final grid. */
/** `i` keys the illustrative counts (same as in step 2); `order` is the position in the grid. */
function GridCard({ trial, i, order, shown }: { trial: WalkthroughTrial; i: number; order: number; shown: boolean }) {
  const style = AREA_STYLES[trial.area];
  return (
    <div
      className={cn(
        STAGGER[order] ?? 'delay-0',
        'relative h-44 overflow-hidden rounded-2xl border border-line-2 bg-surface p-4 shadow-[0_1px_2px_rgba(30,36,48,0.05)] transition-[opacity,translate,scale] duration-500 ease-out',
        shown ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-3 scale-95 opacity-0'
      )}
    >
      <div className={cn('absolute inset-0 bg-linear-to-br opacity-70 [mask-image:linear-gradient(to_bottom,black,transparent)]', style.gradient)} />
      <div className="relative flex h-full flex-col justify-between">
        <span className="flex w-fit items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold">
          <AreaIcon area={trial.area} className={cn('size-3.5', style.text)} />
          {AREA_LABELS[trial.area]}
        </span>
        <span>
          <span className="block text-[16px] font-semibold leading-snug">{trial.indication}</span>
          <span className="mt-1 block text-[12.5px]">
            <CountsLine i={i} short />
          </span>
        </span>
      </div>
    </div>
  );
}

/** Stagger for the grid cards, as full class names so Tailwind generates them. */
const STAGGER = ['delay-0', 'delay-[90ms]', 'delay-[180ms]', 'delay-[270ms]'];

function RecommendScene({ data, t }: { data: WalkthroughData; t: number }) {
  // Ranked by candidates, most first, keeping each trial's index so its counts match step 2.
  const ranked = data.trials
    .filter((trial) => trial.hasProtocol)
    .map((trial, i) => ({ trial, i }))
    .sort((a, b) => mockCounts(b.i).candidates - mockCounts(a.i).candidates);
  return (
    <div className="mx-auto grid w-full max-w-5xl animate-modal-in grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-16">
      <div className="grid grid-cols-2 gap-3">
        {ranked.map(({ trial, i }, order) => (
          <GridCard key={trial.nctId} trial={trial} i={i} order={order} shown={t > 120} />
        ))}
      </div>
      <div>
        <h2 className="text-[34px] font-semibold leading-tight tracking-[-0.03em]">Recommended for your practice</h2>
        <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-ink-2">
          The trials your patients could fill, ranked by candidates. Open one to see who passed which criteria.
        </p>
        <p className="mt-3 text-[12px] text-ink-3">Candidate counts are illustrative until Jev&apos;s results are in.</p>
      </div>
    </div>
  );
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
        {/* While focused on, the fetch scene runs on the total clock so its stream doesn't restart. */}
        {data && scene.key === 'fetch' && <FetchScene data={data} t={FOCUS === 'fetch' ? elapsed : t} />}
        {data && scene.key === 'match' && <MatchScene data={data} t={t} />}
        {data && scene.key === 'recommend' && <RecommendScene data={data} t={t} />}
      </div>
    </div>
  );
}
