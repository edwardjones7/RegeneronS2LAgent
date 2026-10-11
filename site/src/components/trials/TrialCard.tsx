import Link from 'next/link';
import type { ReactNode } from 'react';
import type { TrialListItem } from '@/lib/trials';
import { AREA_LABELS } from '@/lib/trials/areas';
import { cn } from '@/lib/utils/cn';
import { formatAgeRange, formatDate, formatPhases } from '@/lib/utils/format';
import { AREA_STYLES } from './areaStyles';

export function TrialCard({ trial }: { trial: TrialListItem }) {
  const style = AREA_STYLES[trial.area];

  return (
    <Link
      href={`/trials/${trial.nctId}`}
      className="group relative flex aspect-square flex-col overflow-hidden rounded-2xl border border-line bg-surface p-4 transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgba(30,36,48,0.25)]"
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
        <h3 className="line-clamp-2 text-[17px] font-semibold leading-snug tracking-[-0.015em]">{trial.indication}</h3>
        <p className="mt-0.5 truncate text-[13px] text-ink-3">{trial.drug ?? 'Intervention not listed'}</p>

        {/* Details slide up on hover; the title rises with them. */}
        <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-out group-hover:grid-rows-[1fr] group-focus-visible:grid-rows-[1fr]">
          <div className="overflow-hidden">
            <dl className="mt-3 grid translate-y-3 grid-cols-2 gap-x-3 gap-y-2 border-t border-line-2 pt-3 opacity-0 transition duration-300 ease-out group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
              <Fact label="Ages">{formatAgeRange(trial.minimumAge, trial.maximumAge)}</Fact>
              <Fact label="Enrolling">{trial.enrollment?.toLocaleString() ?? '—'}</Fact>
              <Fact label="NJ sites">{trial.njRecruiting || 'None'}</Fact>
              <Fact label="Ends">{trial.primaryCompletion ? formatDate(trial.primaryCompletion.slice(0, 7)) : '—'}</Fact>
            </dl>
          </div>
        </div>
      </div>
    </Link>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">{label}</dt>
      <dd className="truncate text-[13px] font-medium tabular-nums">{children}</dd>
    </div>
  );
}
