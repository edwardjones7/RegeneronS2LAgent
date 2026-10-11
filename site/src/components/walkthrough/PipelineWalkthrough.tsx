import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AreaIcon } from '@/components/trials/AreaIcon';
import { AREA_STYLES } from '@/components/trials/areaStyles';
import { PhaseBadge } from '@/components/trials/PhaseBadge';
import { TrialCard } from '@/components/trials/TrialCard';
import { AREA_LABELS } from '@/lib/trials/areas';
import { fetchJson } from '@/lib/utils/api';
import { cn } from '@/lib/utils/cn';
import type { TrialListItem } from '@/lib/trials';
import type { WalkthroughData, WalkthroughTrial } from '@/pages/api/walkthrough';

/**
 * A motion walkthrough of the pipeline, for the demo: fetch trials → match them
 * against the practice's patients → the dashboard. Visual only; nothing is run.
 * Real: the trial count, which trials have criteria, the panel size. Illustrative (and
 * labelled so): the candidate and chart-review counts, until real match results are wired in.
 */

const SCENES = [
  { key: 'fetch', label: 'Fetch trials', ms: 4600 },
  { key: 'match', label: 'Match patients', ms: 5400 },
  { key: 'recommend', label: 'Recommend', ms: 3800 },
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

/** Deck depth: the newest card in front, older ones peeking out above and behind. Full class names for Tailwind. */
const DECK = [
  'z-40 translate-y-0 scale-100 opacity-100',
  'z-30 -translate-y-5 scale-95 opacity-80',
  'z-20 -translate-y-10 scale-90 opacity-50',
  'z-10 -translate-y-14 scale-[0.85] opacity-25',
];

const PANEL_SIZE_DOTS = 200;

/** One trial being matched: its patients as dots, the matches lighting up as the counts tick up. */
function MatchCard({ trial, i, age }: { trial: TrialListItem; i: number; age: number }) {
  const style = AREA_STYLES[trial.area];
  const { candidates, review } = mockCounts(i);
  const progress = easeOut((age - 250) / 900);
  // Which dots light up: a stable shuffle per trial, candidates first, then those to review.
  const rank = Array.from({ length: PANEL_SIZE_DOTS }, (_, j) => j).sort((a, b) => rand(a + i * 997) - rand(b + i * 997));
  const order = new Map(rank.map((dot, k) => [dot, k]));
  const lit = progress * (candidates + review);

  return (
    <div className="relative flex h-[440px] flex-col overflow-hidden rounded-3xl border border-line-2 bg-surface p-5 shadow-[0_16px_40px_-20px_rgba(30,36,48,0.3)]">
      <div className={cn('absolute inset-x-0 top-0 h-48 bg-linear-to-br [mask-image:linear-gradient(to_bottom,black_20%,transparent)]', style.gradient)} />
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
          {Array.from({ length: PANEL_SIZE_DOTS }, (_, dot) => {
            const k = order.get(dot)!;
            const tone = k < Math.min(lit, candidates) ? 'bg-pass' : k >= candidates && k < lit ? 'bg-unk' : 'bg-ink/[0.08]';
            return <span key={dot} className={cn('aspect-square rounded-full transition-colors duration-300', tone)} />;
          })}
        </div>

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
  const matchable = data.matched;
  const matched = Math.min(matchable.length, Math.max(0, Math.floor((t - FIRST_MATCH_MS) / MATCH_EVERY_MS) + 1));

  return (
    <div className="mx-auto grid w-full max-w-5xl animate-modal-in grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-16">
      {/* A deck: each matched trial is dealt on top, the earlier ones stacking up behind it. */}
      <div className="relative mx-auto mt-14 h-[440px] w-[360px]">
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
          <span className="text-[112px] font-semibold leading-none tabular-nums tracking-[-0.05em]">{matched}</span>
          <span className="text-[17px] text-ink-3">{matched === 1 ? 'trial matches' : 'trials match'} your patients</span>
        </div>
        <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-ink-2">
          {data.patientCount} patients checked against each trial&apos;s criteria. Records never leave your practice.
        </p>
        <p className="mt-3 text-[12px] text-ink-3">Candidate counts are illustrative for now.</p>
      </div>
    </div>
  );
}

/** Stagger for the final cards, as full class names so Tailwind generates them. */
const STAGGER = ['delay-0', 'delay-[90ms]', 'delay-[180ms]', 'delay-[270ms]'];

function RecommendScene({ data, t }: { data: WalkthroughData; t: number }) {
  // Same order and illustrative counts as step 2 (keyed by position among the matchable trials),
  // then ranked by candidates, most first.
  const matchable = data.trials.filter((trial) => trial.hasProtocol);
  const ranked = data.matched
    .map((trial) => ({ trial, counts: mockCounts(matchable.findIndex((m) => m.nctId === trial.nctId)) }))
    .sort((a, b) => b.counts.candidates - a.counts.candidates);

  return (
    <div className="mx-auto w-full max-w-6xl animate-modal-in">
      <h2 className="text-[34px] font-semibold leading-tight tracking-[-0.03em]">Recommended for your practice</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
        The trials your patients could fill, ranked by candidates.{' '}
        <span className="text-ink-3">Counts are illustrative for now.</span>
      </p>
      {/* The dashboard's own card; not clickable here. */}
      <div className="pointer-events-none mt-8 grid grid-cols-4 gap-5">
        {ranked.map(({ trial, counts }, order) => (
          <div
            key={trial.nctId}
            className={cn(
              STAGGER[order] ?? 'delay-0',
              'transition-[opacity,translate,scale] duration-500 ease-out',
              t > 120 ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-3 scale-95 opacity-0'
            )}
          >
            <TrialCard trial={trial} href={{ pathname: '/trials', query: { trial: trial.nctId } }} prescreen={counts} />
          </div>
        ))}
      </div>
    </div>
  );
}

function renderScene(key: SceneKey, data: WalkthroughData, t: number) {
  if (key === 'fetch') return <FetchScene data={data} t={t} />;
  if (key === 'match') return <MatchScene data={data} t={t} />;
  return <RecommendScene data={data} t={t} />;
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
            {renderScene(previous.key, data, previous.ms + t)}
          </div>
        )}
        {data && (
          <div key={scene.key} className="absolute inset-0 flex flex-col justify-center px-8 pb-16">
            {/* While focused on, the fetch scene runs on the total clock so its stream doesn't restart. */}
            {renderScene(scene.key, data, scene.key === 'fetch' && FOCUS === 'fetch' ? elapsed : t)}
          </div>
        )}
      </div>
    </div>
  );
}
