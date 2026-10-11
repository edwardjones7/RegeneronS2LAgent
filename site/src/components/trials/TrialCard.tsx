import Link from 'next/link';
import type { ReactNode } from 'react';
import type { TrialListItem } from '@/lib/trials';
import { AREA_LABELS } from '@/lib/trials/areas';
import { cn } from '@/lib/utils/cn';
import { formatAgeRange, formatDate, formatStatus } from '@/lib/utils/format';
import { AreaIcon } from './AreaIcon';
import { AREA_STYLES } from './areaStyles';
import { PhaseBadge } from './PhaseBadge';

/** `href` opens the trial modal (shallow, so the grid stays where it is). */
interface TrialCardProps {
  trial: TrialListItem;
  href: { pathname: string; query: Record<string, string> };
  /** Set once the practice accepted this trial: Ava's call progress. */
  outreach?: { booked: number; called: number };
}

export function TrialCard({ trial, href, outreach }: TrialCardProps) {
  const style = AREA_STYLES[trial.area];

  return (
    <Link
      href={href}
      shallow
      scroll={false}
      className="group relative flex aspect-square flex-col overflow-hidden rounded-2xl border border-line bg-surface p-4 transition-shadow hover:shadow-[0_8px_24px_-12px_rgba(30,36,48,0.25)]"
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
        <span className="flex items-center h-7 gap-1.5 rounded-full bg-white/80 px-2.5 text-[11px] font-semibold text-ink shadow-[0_1px_2px_rgba(30,36,48,0.06)] ring-1 ring-white/70 backdrop-blur-md">
          <AreaIcon area={trial.area} className={cn('size-3.5 shrink-0', style.text)} />
          {AREA_LABELS[trial.area]}
        </span>
        <PhaseBadge
          phases={trial.phases}
          className="h-7 rounded-full bg-white/80 px-2.5 shadow-[0_1px_2px_rgba(30,36,48,0.06)] ring-1 ring-white/70 backdrop-blur-md"
        />
      </div>

      {/*
        Title block rests at the bottom with the details hidden below the card edge (h-16 / translate-y-16).
        On hover the whole block slides up, so the details rise out of the card's own edge.
      */}
      <div className="absolute inset-x-4 bottom-4 translate-y-16 transition-transform duration-300 ease-out group-hover:translate-y-0 group-focus-visible:translate-y-0">
        {outreach ? (
          <span className="mb-2 flex items-center gap-1 text-xs font-semibold text-accent">
            <span className="size-1.5 animate-pulse rounded-full bg-accent" />
            Ava calling · {outreach.booked} booked
          </span>
        ) : (
          trial.hasProtocol && (
            <span className="mb-2 flex items-center gap-1 text-xs font-semibold text-pass">
              <span className="size-1.5 rounded-full bg-pass" />
              Criteria ready
            </span>
          )
        )}
        <h3 className="line-clamp-2 text-[17px] font-semibold leading-snug tracking-[-0.015em]">{trial.indication}</h3>
        <p className="mt-0.5 truncate text-[13px] text-ink-3">{trial.drug ?? 'Intervention not listed'}</p>
        {trial.blurb && <p className="mt-2.5 line-clamp-3 text-[13px] leading-relaxed text-ink-2">{trial.blurb}</p>}

        <div className="h-16 pt-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
          <dl className="grid grid-cols-4 gap-x-3 border-t border-line-2 pt-3">
            <Fact label="Ages">{formatAgeRange(trial.minimumAge, trial.maximumAge)}</Fact>
            <Fact label="Sex">{trial.sex ? formatStatus(trial.sex) : '—'}</Fact>
            <Fact label="Enrolling">{trial.enrollment?.toLocaleString() ?? '—'}</Fact>
            <Fact label="Ends">{trial.primaryCompletion ? formatDate(trial.primaryCompletion.slice(0, 7)) : '—'}</Fact>
          </dl>
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
