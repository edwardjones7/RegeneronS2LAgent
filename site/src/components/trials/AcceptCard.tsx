import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import type { TrialOutreach } from '@/lib/caller';
import { DEMO_PRACTICE } from '@/lib/practice';
import { fetchJson, getErrorMessage } from '@/lib/utils/api';
import { cn } from '@/lib/utils/cn';

function Num({ value, label, tone }: { value: number | null; label: string; tone?: 'pass' | 'unk' }) {
  return (
    <div className="min-w-0">
      <div
        className={cn(
          'text-[28px] font-semibold leading-none tabular-nums tracking-[-0.03em]',
          tone === 'pass' ? 'text-pass' : tone === 'unk' ? 'text-unk' : 'text-ink'
        )}
      >
        {value === null ? '–' : value.toLocaleString()}
      </div>
      <div className="mt-1 text-[12px] leading-snug text-ink-3">{label}</div>
    </div>
  );
}

const CARD = 'rounded-2xl border bg-surface p-5 shadow-[0_1px_2px_rgba(30,36,48,0.04)]';

/**
 * The doctor's yes. Accepting hands the trial's pre-screened patients to Ava, who calls them from
 * this office and books screening visits. The doctor doesn't do anything else.
 * `initial` comes from the trials page, so the card shows without waiting on the caller.
 */
export function AcceptCard({ nctId, initial }: { nctId: string; initial: TrialOutreach }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Once accepted, keep the call totals moving while the page is open (first refresh right away).
  useEffect(() => {
    if (!state.accepted) return;
    const refresh = () => {
      if (!document.hidden) fetchJson<TrialOutreach>(`/api/trials/${nctId}/outreach`).then(setState).catch(() => {});
    };
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [nctId, state.accepted]);

  if (!state.available || !state.callable) {
    return (
      <div className={cn(CARD, 'border-line-2 text-[13px] leading-relaxed text-ink-3')}>
        {state.available
          ? 'Outreach isn’t set up for this trial yet.'
          : 'Ava’s caller isn’t running, so this trial can’t be accepted from here right now.'}
      </div>
    );
  }

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/trials/${nctId}/outreach`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Accept failed');
      setState(json.data);
      router.push(`/campaigns?nct=${nctId}`);
    } catch (err) {
      setError(getErrorMessage(err, 'Accept failed'));
      setBusy(false);
    }
  };

  if (state.accepted) {
    const t = state.totals;
    return (
      <div className={cn(CARD, 'border-pass/30 bg-pass-bg/40')}>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-pass">
            <span className="flex size-5 items-center justify-center rounded-full bg-pass text-white">
              <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            Accepted
          </span>
          {state.acceptedBy && <span className="truncate text-[12px] text-ink-3">by {state.acceptedBy}</span>}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Num value={t?.called ?? null} label={t ? `of ${t.patients} called` : 'called'} />
          <Num value={t?.booked ?? null} label="booked" tone="pass" />
          <Num value={t?.needsStaff ?? null} label="need staff" tone="unk" />
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-ink-2">Ava is calling your candidates and booking screening visits here.</p>
        <Link href={`/campaigns?nct=${nctId}`} className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-ink hover:underline">
          Follow the campaign
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>
    );
  }

  // Chart-review-only trials can still be accepted: staff clear those patients before Ava calls.
  const none = state.candidates === 0 && state.chartReview === 0;

  return (
    <div className={cn(CARD, 'border-line-2')}>
      <div className="text-[12px] font-medium text-ink-3">Your patients</div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Num value={state.candidates} label="pre-screen candidates" tone={none ? undefined : 'pass'} />
        <Num value={state.chartReview} label="need chart review" tone={state.chartReview ? 'unk' : undefined} />
      </div>

      {none ? (
        <p className="mt-4 text-[13px] leading-relaxed text-ink-2">
          None of your patients fit this trial yet.
          {state.chartReview > 0 && ` ${state.chartReview} could, once your staff check their charts.`}
        </p>
      ) : (
        <>
          <p className="mt-4 text-[13px] leading-relaxed text-ink-2">
            Ava calls them from {DEMO_PRACTICE.doctor}&rsquo;s office and books screening visits here. Chart-review patients wait
            for your staff.
          </p>
          <button
            type="button"
            onClick={accept}
            disabled={busy}
            className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-ink text-[13.5px] font-semibold text-white transition-colors hover:bg-ink/85 disabled:opacity-60"
          >
            {busy && <span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
            {busy ? 'Starting outreach…' : 'Accept trial'}
          </button>
        </>
      )}
      {error && <p className="mt-2 text-[12px] text-fail">{error}</p>}
    </div>
  );
}
