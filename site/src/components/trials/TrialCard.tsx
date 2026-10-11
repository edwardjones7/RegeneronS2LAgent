import Link from 'next/link';
import type { TrialListItem } from '@/lib/trials';
import { AREA_LABELS } from '@/lib/trials/areas';
import { cn } from '@/lib/utils/cn';
import { formatDate, formatPhases } from '@/lib/utils/format';
import { AREA_STYLES } from './areaStyles';

export function TrialCard({ trial }: { trial: TrialListItem }) {
  const style = AREA_STYLES[trial.area];

  return (
    <Link
      href={`/trials/${trial.nctId}`}
      className="group relative flex aspect-[4/5] flex-col overflow-hidden rounded-2xl border border-line bg-surface p-4 transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgba(30,36,48,0.25)]"
    >
      {/* Area gradient, fading out into the card background. */}
      <div
        className={cn(
          'absolute inset-x-0 top-0 h-3/4 bg-linear-to-br [mask-image:linear-gradient(to_bottom,black_15%,transparent)]',
          style.gradient
        )}
      />
      <div className="absolute inset-x-0 top-0 h-3/4 bg-[radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.7),transparent_50%)]" />

      <div className="relative flex items-start justify-between gap-2">
        <span className="rounded-full bg-white/75 px-2.5 py-1 text-[11px] font-semibold text-ink backdrop-blur-sm">
          {AREA_LABELS[trial.area]}
        </span>
        <span className="rounded-full bg-white/75 px-2.5 py-1 text-[11px] font-semibold text-ink-2 backdrop-blur-sm">
          {formatPhases(trial.phases)}
        </span>
      </div>

      <div className="relative mt-auto">
        {trial.hasProtocol && (
          <span className="mb-2 flex items-center gap-1 text-xs font-semibold text-pass">
            <span className="size-1.5 rounded-full bg-pass" />
            Criteria ready
          </span>
        )}
        <h3 className="line-clamp-3 text-[17px] font-semibold leading-snug tracking-[-0.015em]">{trial.indication}</h3>
        <p className="mt-1 truncate text-[13px] text-ink-3">
          {trial.drug ?? 'Intervention not listed'}
          {trial.enrollment !== null && ` · ${trial.enrollment.toLocaleString()} patients`}
        </p>

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-line-2 pt-3 text-xs text-ink-3">
          <span>
            {trial.njRecruiting > 0 ? `${trial.njRecruiting} NJ ${trial.njRecruiting === 1 ? 'site' : 'sites'}` : 'No NJ sites'}
          </span>
          {trial.primaryCompletion && <span>Ends {formatDate(trial.primaryCompletion.slice(0, 7))}</span>}
        </div>
      </div>
    </Link>
  );
}
