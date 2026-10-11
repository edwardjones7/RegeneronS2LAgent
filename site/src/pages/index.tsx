import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { type ReactNode, useState } from 'react';
import { TrialCard } from '@/components/trials/TrialCard';
import { TrialistLogo } from '@/components/ui/TrialistLogo';
import { DEMO_PRACTICE } from '@/lib/practice';
import { canFill, listOpenTrials, type TrialListItem } from '@/lib/trials';
import { cn } from '@/lib/utils/cn';

interface LandingProps {
  /** A few real trials for the hero, the ones the demo practice can fill first. */
  showcase: TrialListItem[];
  openTrials: number;
  fitting: number;
}

export const getServerSideProps: GetServerSideProps<LandingProps> = async () => {
  try {
    const trials = await listOpenTrials(DEMO_PRACTICE.practiceId);
    const fit = trials
      .filter((t) => canFill(t.prescreen) && t.area !== 'other')
      .sort((a, b) => (b.prescreen?.candidates ?? 0) - (a.prescreen?.candidates ?? 0));
    const others = trials.filter((t) => !canFill(t.prescreen) && t.area !== 'other');
    const showcase = [...fit, ...others].filter((t, i, all) => all.findIndex((x) => x.area === t.area) === i).slice(0, 3);
    // The count matches the dashboard's; only the hero cards skip the uncategorized "Other" trials.
    return { props: { showcase, openTrials: trials.length, fitting: trials.filter((t) => canFill(t.prescreen)).length } };
  } catch {
    return { props: { showcase: [], openTrials: 0, fitting: 0 } };
  }
};

/* Regeneron's challenge materials (.claude/AGENTS.MD §8). */
const FIGURES = [
  { value: '11%', label: 'of trial sites enroll zero patients' },
  { value: '37%', label: 'of sites under-enroll' },
  { value: '$41,117', label: 'spent per enrolled patient' },
  { value: '31.4 weeks', label: 'of study start-up, 61% of it admin' },
];

const STEPS: { title: string; body: string; icon: ReactNode }[] = [
  {
    title: 'We find the trials',
    body: 'Every open Regeneron trial, synced from ClinicalTrials.gov with its criteria, sites and dates.',
    icon: <path d="M11 4a7 7 0 105.2 11.7L20 19.5M8 11h6M11 8v6" />,
  },
  {
    title: 'We pre-screen your patients',
    body: 'Each trial is checked against your own records, inside your practice. You see candidates, and the patients who need a chart review.',
    icon: <path d="M15 4.5h1.5A2.5 2.5 0 0119 7v11.5a2.5 2.5 0 01-2.5 2.5h-9A2.5 2.5 0 015 18.5V7a2.5 2.5 0 012.5-2.5H9M9 3h6v3.5H9zM9 13.5l2.2 2.2 4.3-4.7" />,
  },
  {
    title: 'Ava calls them for you',
    body: 'Accept a trial and Ava calls your candidates from your office, confirms who she’s speaking to, and books screening visits on your calendar.',
    icon: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2zM15 3.5a6 6 0 015.5 5.5M15 7a2.5 2.5 0 012 2" />,
  },
];

const PRIVACY = [
  'Identifiable patient data never leaves your practice.',
  'The matching model only sees de-identified summaries: no names, IDs, birth dates or locations.',
  'Ava calls under your name, and screening visits happen at your office. The patient stays with you.',
];

function Icon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('size-5 shrink-0', className)}
    >
      {children}
    </svg>
  );
}

function SignInButton({ busy, onClick, size = 'md' }: { busy: boolean; onClick: () => void; size?: 'md' | 'lg' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full bg-ink font-semibold text-white transition-colors hover:bg-ink/85 disabled:opacity-80',
        size === 'lg' ? 'h-12 px-6 text-[15px]' : 'h-9 px-4 text-[13.5px]'
      )}
    >
      {busy ? (
        <>
          <span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          Signing in…
        </>
      ) : (
        <>
          Sign in
          <Icon className="size-4">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </Icon>
        </>
      )}
    </button>
  );
}

const SECTION = 'mx-auto w-full max-w-6xl px-6';
const CARD = 'rounded-2xl border border-line-2 bg-surface shadow-[0_1px_2px_rgba(30,36,48,0.04)]';

/** Where each hero card sits in the fanned stack; the first (most candidates) in front. */
const FAN = ['left-1/2 top-0 z-30 -translate-x-1/2', 'left-0 top-16 z-10 -rotate-[7deg]', 'right-0 top-20 z-20 rotate-[7deg]'];

export default function Landing({ showcase, openTrials, fitting }: LandingProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // No accounts in the demo: signing in means signing in as the demo practice's doctor.
  // ?welcome plays the pipeline walkthrough over the dashboard, which then dissolves into it.
  const signIn = () => {
    setBusy(true);
    void router.push('/trials?welcome=1');
  };

  return (
    <>
      <Head>
        <title>Trialist · Trials come to doctors with the patients already found</title>
      </Head>
      <div className="relative isolate min-h-screen overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[720px] bg-[radial-gradient(900px_420px_at_8%_0%,#FFD9C7,transparent),radial-gradient(900px_400px_at_50%_0%,#D4E9FB,transparent),radial-gradient(800px_380px_at_92%_0%,#E0F2D3,transparent)] [mask-image:linear-gradient(to_bottom,black_40%,transparent)]" />

        <header className={cn(SECTION, 'flex h-20 items-center justify-between')}>
          <TrialistLogo className="text-ink" />
          <nav className="flex items-center gap-6">
            <a href="#how" className="text-[13.5px] font-medium text-ink-2 transition-colors hover:text-ink">
              How it works
            </a>
            <a href="#privacy" className="text-[13.5px] font-medium text-ink-2 transition-colors hover:text-ink">
              Privacy
            </a>
            <SignInButton busy={busy} onClick={signIn} />
          </nav>
        </header>

        <section className={cn(SECTION, 'grid items-center gap-14 pb-24 pt-14 lg:grid-cols-[1.05fr_1fr]')}>
          <div className="motion-safe:animate-slide-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/60 px-3 py-1 text-[12.5px] font-medium text-ink-2 backdrop-blur-sm">
              <span className="size-1.5 rounded-full bg-pass" />
              For community practices running Regeneron trials
            </span>
            <h1 className="mt-6 text-[56px] font-semibold leading-[1.04] tracking-[-0.04em]">
              Trials come to doctors with the patients already found.
            </h1>
            <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-ink-2">
              Trialist pre-screens your patients against open clinical trials, shows you only the trials you can fill, and calls
              your candidates to book their screening visits.
            </p>
            <div className="mt-9 flex items-center gap-5">
              <SignInButton busy={busy} onClick={signIn} size="lg" />
              <a href="#how" className="text-[15px] font-semibold text-ink-2 transition-colors hover:text-ink">
                How it works
              </a>
            </div>
            <p className="mt-6 text-[13px] text-ink-3">
              Demo practice: {DEMO_PRACTICE.name}. Synthetic patients, no real people.
            </p>
          </div>

          {showcase.length > 0 && (
            <div className="relative mx-auto h-[400px] w-full max-w-[620px] motion-safe:animate-fade-in" aria-hidden inert>
              {showcase.map((t, i) => (
                <div key={t.nctId} className={cn('absolute w-[250px] shadow-[0_24px_60px_-28px_rgba(30,36,48,0.45)]', FAN[i])}>
                  <TrialCard trial={t} href={{ pathname: '/trials', query: {} }} prescreen={t.prescreen} />
                </div>
              ))}
              {fitting > 0 && (
                <div className="absolute -bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2.5 whitespace-nowrap rounded-full border border-white/80 bg-white/85 px-4 py-2 text-[13.5px] shadow-[0_12px_32px_-16px_rgba(30,36,48,0.4)] backdrop-blur-md">
                  <span className="flex size-5 items-center justify-center rounded-full bg-pass text-white">
                    <Icon className="size-3">
                      <path d="M5 12.5l4.5 4.5L19 7.5" strokeWidth={3} />
                    </Icon>
                  </span>
                  <span>
                    <span className="font-semibold">
                      {fitting} of {openTrials} open trials
                    </span>{' '}
                    <span className="text-ink-2">fit this practice&rsquo;s patients</span>
                  </span>
                </div>
              )}
            </div>
          )}
        </section>

        <section className={SECTION}>
          <div className={cn(CARD, 'p-8')}>
            <h2 className="text-[22px] font-semibold tracking-[-0.02em]">Trials stall at the site, not the ad.</h2>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">
              The hard part is finding the doctor who wants to run the trial and already has patients who fit it. That&rsquo;s the
              step Trialist does.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-y-6 lg:grid-cols-4">
              {FIGURES.map((f, i) => (
                <div key={f.value} className={cn('px-1 lg:px-6', i > 0 && 'lg:border-l lg:border-line-2', i === 0 && 'lg:pl-0')}>
                  <div className="text-[32px] font-semibold leading-none tabular-nums tracking-[-0.03em]">{f.value}</div>
                  <div className="mt-2 text-[13.5px] leading-snug text-ink-2">{f.label}</div>
                </div>
              ))}
            </div>
            <p className="mt-7 text-[12px] text-ink-3">Figures from Regeneron&rsquo;s challenge materials.</p>
          </div>
        </section>

        <section id="how" className={cn(SECTION, 'scroll-mt-8 pt-24')}>
          <h2 className="text-[34px] font-semibold tracking-[-0.03em]">How it works</h2>
          <p className="mt-2 max-w-xl text-[16px] leading-relaxed text-ink-2">Three steps, and the only one you do is say yes.</p>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className={cn(CARD, 'relative overflow-hidden p-6')}>
                <div
                  className={cn(
                    'pointer-events-none absolute inset-x-0 top-0 h-28 bg-linear-to-br opacity-70 [mask-image:linear-gradient(to_bottom,black,transparent)]',
                    ['from-[#FFD9C7] to-[#FFF1E8]', 'from-[#D4E9FB] to-[#EEF6FD]', 'from-[#E0F2D3] to-[#F2F9EC]'][i]
                  )}
                />
                <div className="relative">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-white/80 text-ink ring-1 ring-white">
                    <Icon>{s.icon}</Icon>
                  </span>
                  <p className="mt-10 text-[12.5px] font-semibold text-ink-3">Step {i + 1}</p>
                  <h3 className="mt-1 text-[19px] font-semibold tracking-[-0.02em]">{s.title}</h3>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="privacy" className={cn(SECTION, 'scroll-mt-8 pt-24')}>
          <div className={cn(CARD, 'grid gap-8 p-8 lg:grid-cols-[1fr_1.2fr] lg:items-center')}>
            <div>
              <span className="flex size-10 items-center justify-center rounded-xl bg-pass-bg text-pass">
                <Icon>
                  <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
                  <path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" />
                </Icon>
              </span>
              <h2 className="mt-5 text-[28px] font-semibold tracking-[-0.03em]">Your patients stay yours.</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
                Nobody takes your patients to an academic center. The trial comes to your practice.
              </p>
            </div>
            <ul className="flex flex-col gap-3">
              {PRIVACY.map((line) => (
                <li key={line} className="flex items-start gap-3 rounded-xl bg-surface-2 px-4 py-3.5 text-[14.5px] leading-relaxed">
                  <Icon className="mt-0.5 size-4 text-pass">
                    <path d="M5 12.5l4.5 4.5L19 7.5" strokeWidth={2.4} />
                  </Icon>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={cn(SECTION, 'py-24 text-center')}>
          <h2 className="text-[34px] font-semibold tracking-[-0.03em]">See it with a demo practice.</h2>
          <p className="mx-auto mt-2 max-w-md text-[16px] leading-relaxed text-ink-2">
            Sign in as {DEMO_PRACTICE.doctor} and watch the trials come in.
          </p>
          <div className="mt-8">
            <SignInButton busy={busy} onClick={signIn} size="lg" />
          </div>
        </section>

        <footer className="border-t border-line-2">
          <div className={cn(SECTION, 'flex flex-wrap items-center justify-between gap-3 py-6 text-[12.5px] text-ink-3')}>
            <TrialistLogo className="scale-90 text-ink-2" />
            <span>HackRU 2026 · Regeneron challenge · Synthetic patients from Synthea, no real people · MIT licensed</span>
          </div>
        </footer>
      </div>
    </>
  );
}
