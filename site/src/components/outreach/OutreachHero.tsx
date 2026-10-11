import { AREA_STYLES } from '@/components/trials/areaStyles';
import type { TherapeuticArea } from '@/lib/trials/areas';
import { cn } from '@/lib/utils/cn';

/** Progress ring: how many of the callable patients Ava has called. */
function Ring({ called, total }: { called: number; total: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const pct = total ? Math.min(1, called / total) : 0;
  return (
    <svg viewBox="0 0 80 80" className="size-[88px] -rotate-90" aria-hidden>
      <circle cx="40" cy="40" r={r} fill="none" stroke="currentColor" strokeWidth="7" className="text-white/70" />
      <circle
        cx="40"
        cy="40"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        className="text-accent transition-[stroke-dashoffset] duration-700"
      />
    </svg>
  );
}

/**
 * The one-second answer: how many patients are coming in, and how far along Ava is.
 * Washed in the trial's area color, like the trial cards.
 */
export function OutreachHero({
  booked,
  called,
  total,
  area,
  testLine,
}: {
  booked: number;
  called: number;
  total: number;
  area: TherapeuticArea | null;
  testLine: string | null;
}) {
  const style = AREA_STYLES[area ?? 'metabolic'];
  return (
    <section className="relative isolate mt-6 overflow-hidden rounded-2xl border border-line bg-surface p-6">
      <div className={cn('absolute inset-0 -z-10 bg-linear-to-br opacity-70 [mask-image:linear-gradient(to_right,black,transparent_85%)]', style.gradient)} />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_90%_10%,rgba(255,255,255,0.8),transparent_55%)]" />
      <div className="flex items-center justify-between gap-6">
        <div>
          <div className="flex items-baseline gap-2.5">
            <span className="text-[56px] font-semibold leading-none tracking-[-0.04em] tabular-nums">{booked}</span>
            <span className="text-[19px] font-semibold tracking-[-0.015em]">{booked === 1 ? 'patient is' : 'patients are'} coming in</span>
          </div>
          <p className="mt-2 text-[14px] text-ink-2">
            Ava has called {called} of your {total} pre-screened patients from your office.
          </p>
          {testLine && <p className="mt-3 text-[12.5px] font-medium text-ink-2">{testLine}</p>}
        </div>
        <div className="relative hidden shrink-0 sm:block">
          <Ring called={called} total={total} />
          <span className="absolute inset-0 grid place-items-center text-[13px] font-semibold tabular-nums">
            {total ? Math.round((called / total) * 100) : 0}%
          </span>
        </div>
      </div>
    </section>
  );
}
