import type { ReactNode } from 'react';
import { DEMO_PRACTICE, greeting } from '@/lib/practice';
import { cn } from '@/lib/utils/cn';
import type { NavKey } from './AppShell';

/*
 * Placeholders shown the moment the doctor switches pages, while the server loads the real one.
 * Each mirrors its page's layout, and uses the real title wherever it doesn't depend on data.
 */

/** Pulses the placeholders under it; real text stays still. */
function Pulse({ children }: { children: ReactNode }) {
  return <div className="animate-pulse motion-reduce:animate-none">{children}</div>;
}

function Bar({ className }: { className?: string }) {
  return <div className={cn('h-3.5 rounded-full bg-ink/[0.06]', className)} />;
}

const CARD = 'rounded-2xl border border-line-2 bg-surface shadow-[0_1px_2px_rgba(30,36,48,0.04)]';

function Intro({ title, description }: { title?: string; description?: string }) {
  return (
    <header>
      <p className="text-[13px] font-medium text-ink-2">{DEMO_PRACTICE.name}</p>
      {title ? (
        <h1 className="mt-1 text-[34px] font-semibold leading-tight tracking-[-0.03em]">{title}</h1>
      ) : (
        <Pulse>
          <Bar className="mt-3.5 h-8 w-[440px]" />
        </Pulse>
      )}
      {description ? (
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-2">{description}</p>
      ) : (
        <Pulse>
          <Bar className="mt-4 h-4 w-[380px]" />
        </Pulse>
      )}
    </header>
  );
}

function Pills({ widths }: { widths: string[] }) {
  return (
    <div className="flex gap-2">
      {widths.map((w, i) => (
        <div key={i} className={cn('h-8 rounded-full bg-ink/[0.05]', w)} />
      ))}
    </div>
  );
}

function PersonRow({ wide }: { wide?: boolean }) {
  return (
    <div className="flex items-center gap-4 border-t border-line-2 px-5 py-3.5 first:border-t-0">
      <div className="size-9 shrink-0 rounded-full bg-ink/[0.06]" />
      <div className="w-[200px] shrink-0">
        <Bar className="w-32" />
        <Bar className="mt-2 h-2.5 w-20" />
      </div>
      <div className="flex flex-1 gap-1.5">
        <div className="h-6 w-24 rounded-full bg-ink/[0.05]" />
        <div className="h-6 w-20 rounded-full bg-ink/[0.05]" />
        {wide && <div className="h-6 w-28 rounded-full bg-ink/[0.05]" />}
      </div>
      <Bar className="w-24" />
    </div>
  );
}

function TrialsSkeleton() {
  return (
    <>
      <Intro
        title={`${greeting()}, ${DEMO_PRACTICE.doctor}.`}
        description="We checked your patients against every open Regeneron trial. Here's what we'd recommend for your practice."
      />
      <Pulse>
        <div className="mt-7">
          <Pills widths={['w-16', 'w-28', 'w-24', 'w-32', 'w-24', 'w-20', 'w-28', 'w-24']} />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-5 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={cn(CARD, 'flex aspect-square flex-col justify-end p-5')}>
              <Bar className="h-5 w-3/4" />
              <Bar className="mt-2.5 h-5 w-1/2" />
              <Bar className="mt-5 w-full" />
              <Bar className="mt-2 w-5/6" />
            </div>
          ))}
        </div>
      </Pulse>
    </>
  );
}

function CampaignsSkeleton() {
  return (
    <>
      <Intro />
      <Pulse>
        <div className={cn(CARD, 'mt-6 p-5')}>
          <div className="grid grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className={cn('px-5', i === 0 ? 'pl-0' : 'border-l border-line-2')}>
                <Bar className="h-7 w-16" />
                <Bar className="mt-2.5 w-28" />
              </div>
            ))}
          </div>
          <div className="mt-5 h-2 rounded-full bg-ink/[0.05]" />
        </div>
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_360px]">
          <div>
            <Pills widths={['w-14', 'w-24', 'w-28', 'w-20']} />
            <div className={cn(CARD, 'mt-4 overflow-hidden shadow-none')}>
              {Array.from({ length: 8 }, (_, i) => (
                <PersonRow key={i} />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-4">
            {[3, 2].map((n, i) => (
              <div key={i} className={cn(CARD, 'p-4')}>
                <Bar className="h-4 w-32" />
                {Array.from({ length: n }, (_, j) => (
                  <div key={j} className="mt-5 flex items-center gap-3">
                    <div className="size-9 shrink-0 rounded-full bg-ink/[0.06]" />
                    <div className="flex-1">
                      <Bar className="w-28" />
                      <Bar className="mt-2 h-2.5 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </Pulse>
    </>
  );
}

function CalendarSkeleton() {
  return (
    <>
      <Intro
        title={`Here’s your week, ${DEMO_PRACTICE.doctor}.`}
        description="Screening visits Ava has booked for the trials you’ve accepted."
      />
      <Pulse>
        <div className="mt-6 flex items-end justify-between">
          <div>
            <Bar className="h-3 w-16" />
            <Bar className="mt-2.5 h-6 w-32" />
          </div>
          <div className="h-10 w-36 rounded-full bg-ink/[0.05]" />
        </div>
        <div className={cn(CARD, 'mt-5 overflow-hidden shadow-none')}>
          <div className="grid grid-cols-[64px_repeat(5,1fr)] border-b border-line-2">
            <div />
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-center gap-2 border-l border-line-2 px-4 py-4">
                <div className="size-8 rounded-full bg-ink/[0.06]" />
                <Bar className="w-10" />
              </div>
            ))}
          </div>
          <div className="grid h-[576px] grid-cols-[64px_repeat(5,1fr)]">
            <div />
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex flex-col gap-8 border-l border-line-2 p-2 pt-8">
                <div className="h-14 rounded-xl bg-ink/[0.04]" />
                <div className="h-14 rounded-xl bg-ink/[0.04]" />
                <div className="mt-16 h-14 rounded-xl bg-ink/[0.04]" />
              </div>
            ))}
          </div>
        </div>
      </Pulse>
    </>
  );
}

function PatientsSkeleton() {
  return (
    <>
      <Intro title="Your patients" />
      <Pulse>
        <div className="mt-7 flex gap-2">
          <div className="h-11 flex-1 rounded-full border border-line bg-surface" />
          <div className="h-11 w-28 rounded-full bg-ink/[0.05]" />
        </div>
        <div className={cn(CARD, 'mt-5 overflow-hidden shadow-none')}>
          {Array.from({ length: 10 }, (_, i) => (
            <PersonRow key={i} wide={i % 3 === 0} />
          ))}
        </div>
      </Pulse>
    </>
  );
}

const SKELETONS: Record<NavKey, () => ReactNode> = {
  trials: TrialsSkeleton,
  campaigns: CampaignsSkeleton,
  calendar: CalendarSkeleton,
  patients: PatientsSkeleton,
};

export const PAGE_TITLES: Record<NavKey, string> = {
  trials: 'Trials',
  campaigns: 'Campaigns',
  calendar: 'Calendar',
  patients: 'Patients',
};

/** The sidebar page a path belongs to, if any. */
export function navKeyFor(pathname: string): NavKey | null {
  const first = pathname.split(/[?#]/)[0].split('/')[1];
  if (first === 'trials') return 'trials';
  return first === 'campaigns' || first === 'calendar' || first === 'patients' ? first : null;
}

export function PageSkeleton({ page }: { page: NavKey }) {
  const Skeleton = SKELETONS[page];
  return (
    <div aria-busy aria-label="Loading">
      <Skeleton />
    </div>
  );
}
