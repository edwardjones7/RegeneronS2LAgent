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
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgba(30,36,48,0.25)]"
    >
      <div className={cn('relative h-24 bg-linear-to-br', style.gradient)}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(255,255,255,0.65),transparent_55%)]" />
        <div className="relative flex items-start justify-between p-3">
          <span className="rounded-full bg-white/75 px-2.5 py-1 text-[11px] font-semibold text-ink backdrop-blur-sm">
            {AREA_LABELS[trial.area]}
          </span>
          <span className="rounded-full bg-white/75 px-2.5 py-1 text-[11px] font-semibold text-ink-2 backdrop-blur-sm">
            {formatPhases(trial.phases)}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug">{trial.indication}</h3>
        <p className="mt-1 truncate text-[13px] text-ink-3">
          {trial.drug ?? 'Intervention not listed'}
          {trial.enrollment !== null && ` · ${trial.enrollment.toLocaleString()} patients`}
        </p>

        <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-ink-3">
          <span>
            {trial.njRecruiting > 0 ? `${trial.njRecruiting} NJ ${trial.njRecruiting === 1 ? 'site' : 'sites'}` : 'No NJ sites'}
            {trial.primaryCompletion && ` · ends ${formatDate(trial.primaryCompletion.slice(0, 7))}`}
          </span>
          {trial.hasProtocol && (
            <span className="flex shrink-0 items-center gap-1 font-semibold text-pass">
              <span className="size-1.5 rounded-full bg-pass" />
              Criteria ready
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
