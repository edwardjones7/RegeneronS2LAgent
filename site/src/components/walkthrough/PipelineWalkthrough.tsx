import { useRouter } from 'next/router';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { AreaIcon } from '@/components/trials/AreaIcon';
import { AREA_STYLES } from '@/components/trials/areaStyles';
import type { CriterionCheck } from '@/lib/protocols';
import { DEMO_PRACTICE } from '@/lib/practice';
import { AREA_LABELS } from '@/lib/trials/areas';
import { fetchJson } from '@/lib/utils/api';
import { cn } from '@/lib/utils/cn';
import type { WalkthroughData, WalkthroughTrial } from '@/pages/api/walkthrough';

/**
 * A motion walkthrough of the pipeline, for the demo: fetch trials → Jev matches them
 * against the practice's patients → the dashboard. Visual only; nothing is run.
 * Real numbers: trial count, protocol criteria, panel size. The patient sorting in
 * the Jev scene is illustrative until Jev's results are wired in.
 */

const SCENES = [
  { key: 'fetch', label: 'Fetch trials', ms: 9000 },
  { key: 'match', label: 'Match with Jev', ms: 11500 },
  { key: 'recommend', label: 'Recommend', ms: 4200 },
] as const;

type SceneKey = (typeof SCENES)[number]['key'];

/** While a scene is being designed, play only it, on a loop. null plays the whole run. */
const FOCUS: SceneKey | null = 'fetch';

const TOTAL_MS = SCENES.reduce((n, s) => n + s.ms, 0);
/** Matches duration-700 on the overlay. */
const LEAVE_MS = 700;

const easeOut = (x: number) => 1 - (1 - Math.min(Math.max(x, 0), 1)) ** 3;

/** Stable 0–1 value per patient dot, so the sorting looks the same every run. */
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

/** Stagger for the recommended cards, as full class names so Tailwind generates them. */
const STAGGER = ['delay-0', 'delay-[110ms]', 'delay-[220ms]', 'delay-[330ms]', 'delay-[440ms]', 'delay-[550ms]'];

function MiniCard({ trial, shown, stagger, large = false }: { trial: WalkthroughTrial; shown: boolean; stagger?: number; large?: boolean }) {
  const style = AREA_STYLES[trial.area];
  return (
    <div
      className={cn(
        stagger !== undefined && STAGGER[stagger],
        'relative overflow-hidden rounded-2xl border border-line-2 bg-surface p-3 shadow-[0_1px_2px_rgba(30,36,48,0.05)] transition-all duration-500 ease-out',
        large ? 'h-36' : 'h-24',
        shown ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-4 scale-95 opacity-0'
      )}
    >
      <div className={cn('absolute inset-0 bg-linear-to-br opacity-70 [mask-image:linear-gradient(to_bottom,black,transparent)]', style.gradient)} />
      <div className="relative flex h-full flex-col justify-between">
        <span className="flex items-center gap-1 text-[10.5px] font-semibold text-ink-2">
          <AreaIcon area={trial.area} className={cn('size-3', style.text)} />
          {AREA_LABELS[trial.area]}
        </span>
        <span>
          {large && trial.hasProtocol && (
            <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-pass">
              <span className="size-1.5 rounded-full bg-pass" />
              Criteria ready
            </span>
          )}
          <span className={cn('line-clamp-2 font-semibold leading-snug', large ? 'text-[15px]' : 'text-[12.5px]')}>{trial.indication}</span>
        </span>
      </div>
    </div>
  );
}

function SceneTitle({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <div key={step} className="animate-modal-in text-center">
      <div className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">Step {step} of 3</div>
      <h2 className="mt-2 text-[34px] font-semibold tracking-[-0.03em]">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-[15px] leading-relaxed text-ink-2">{children}</p>
    </div>
  );
}

const LANES: Record<CriterionCheck, { label: string; className: string }> = {
  code: { label: 'Chart data', className: 'bg-accent-weak text-accent' },
  jev: { label: 'Jev', className: 'bg-ink/[0.06] text-ink' },
  review: { label: 'At screening', className: 'bg-unk-bg text-unk' },
};

/* ————————— Scenes ————————— */

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
              'absolute inset-x-0 top-0 transition-[transform,opacity] duration-300 ease-out',
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

function MatchScene({ data, t, ms }: { data: WalkthroughData; t: number; ms: number }) {
  const { criteria } = data.protocol;
  const stepMs = (ms - 2200) / Math.max(criteria.length, 1);
  const progress = Math.min(t / stepMs, criteria.length); // criteria done, fractional
  const done = progress >= criteria.length;
  // Share of patients ruled out so far: fast at first (age, diagnosis), slower later.
  const ruledOut = 0.89 * (1 - (1 - progress / criteria.length) ** 2);
  const style = AREA_STYLES[data.protocol.area];

  return (
    <>
      <SceneTitle step={2} title="Jev pre-screens your patients">
        {data.patientCount} patients at {DEMO_PRACTICE.name}, checked against each of {data.protocolCount} protocols. Jev sees
        de-identified summaries only, and records never leave the practice.
      </SceneTitle>

      <div className="mx-auto mt-8 grid max-w-5xl animate-modal-in grid-cols-[400px_minmax(0,1fr)] gap-6">
        {/* The protocol, one criterion at a time. */}
        <div className="relative overflow-hidden rounded-3xl border border-line-2 bg-surface p-5">
          <div className={cn('absolute inset-x-0 top-0 h-28 bg-linear-to-br opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent)]', style.gradient)} />
          <div className="relative">
            <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-2">
              <AreaIcon area={data.protocol.area} className={cn('size-3.5', style.text)} />
              Protocol
            </span>
            <div className="mt-1 text-[19px] font-semibold tracking-[-0.02em]">{data.protocol.indication}</div>
            {data.protocol.drug && <div className="text-[13px] text-ink-3">{data.protocol.drug}</div>}
            <ul className="mt-4 space-y-2">
              {criteria.map((c, i) => {
                const state = progress >= i + 1 ? 'done' : progress >= i ? 'active' : 'waiting';
                return (
                  <li
                    key={i}
                    className={cn(
                      'flex items-start gap-2.5 rounded-xl px-2.5 py-2 transition-colors duration-300',
                      state === 'active' ? 'bg-accent-weak/70' : 'bg-transparent'
                    )}
                  >
                    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                      {state === 'done' ? (
                        <svg className={cn('size-4', c.type === 'inclusion' ? 'text-pass' : 'text-fail')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                          <path d={c.type === 'inclusion' ? 'M5 12.5l4.5 4.5L19 7.5' : 'M7 7l10 10M17 7L7 17'} />
                        </svg>
                      ) : state === 'active' ? (
                        <span className="size-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                      ) : (
                        <span className="size-2 rounded-full bg-ink/15" />
                      )}
                    </span>
                    <span className={cn('min-w-0 flex-1 text-[12.5px] leading-snug transition-colors', state === 'waiting' ? 'text-ink-3' : 'text-ink')}>
                      <span className="line-clamp-2">{c.text}</span>
                    </span>
                    <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold', LANES[c.check].className)}>
                      {LANES[c.check].label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* The practice's patients, one dot each. */}
        <div className="flex flex-col rounded-3xl border border-line-2 bg-surface p-5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[13px] font-semibold">
              <span className={cn('size-2 rounded-full', done ? 'bg-pass' : 'animate-pulse bg-accent')} />
              Jev · {done ? 'done' : 'matching'}
            </span>
            <span className="flex items-center gap-1.5 text-[12px] text-ink-3">
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 018 0v3" />
              </svg>
              Inside {DEMO_PRACTICE.name}
            </span>
          </div>

          <div className="mt-5 grid flex-1 grid-cols-20 content-center gap-1.5">
            {Array.from({ length: data.patientCount }, (_, i) => {
              const r = rand(i);
              const out = r < ruledOut;
              const tone = out ? 'bg-ink/[0.08]' : done ? (r > 0.945 ? 'bg-pass' : 'bg-unk') : 'bg-accent/60';
              return <span key={i} className={cn('aspect-square rounded-full transition-colors duration-500', tone)} />;
            })}
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 text-[12px] text-ink-2">
            <span className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-pass" /> Candidate
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-unk" /> Needs chart review
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-ink/15" /> Not a match
              </span>
            </span>
            <span className="text-ink-3">Illustrative</span>
          </div>
        </div>
      </div>
    </>
  );
}

function RecommendScene({ data, t }: { data: WalkthroughData; t: number }) {
  const picks = data.trials.slice(0, 6);
  return (
    <>
      <SceneTitle step={3} title="Recommended for your practice">
        Trials ranked by how many of your patients could fill them. Open one to see who passed which criteria.
      </SceneTitle>
      <div className="mx-auto mt-8 grid max-w-4xl grid-cols-3 gap-4">
        {picks.map((trial, i) => (
          <MiniCard key={trial.nctId} trial={trial} shown={t > 150} stagger={i} large />
        ))}
      </div>
    </>
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
        'fixed inset-0 z-50 flex animate-fade-in flex-col bg-surface/95 backdrop-blur-xl transition-[opacity,transform] duration-700 ease-out',
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
        {data && scene.key === 'match' && <MatchScene data={data} t={t} ms={scene.ms} />}
        {data && scene.key === 'recommend' && <RecommendScene data={data} t={t} />}
      </div>
    </div>
  );
}
