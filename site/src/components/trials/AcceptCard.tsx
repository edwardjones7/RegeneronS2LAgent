import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { Badge, Button } from '@/components/ui';
import type { TrialOutreach } from '@/lib/caller';
import { DEMO_PRACTICE } from '@/lib/practice';
import { fetchJson, getErrorMessage } from '@/lib/utils/api';

function Num({ value, label, tone }: { value: number; label: string; tone?: 'pass' | 'unk' }) {
  return (
    <div>
      <div className={`text-[22px] font-semibold tabular-nums tracking-[-0.03em] ${tone === 'pass' ? 'text-pass' : tone === 'unk' ? 'text-unk' : ''}`}>
        {value.toLocaleString()}
      </div>
      <div className="text-[11.5px] text-ink-3">{label}</div>
    </div>
  );
}

/**
 * The doctor's yes. Accepting hands the trial's pre-screened patients to Ava, who calls them from
 * this office and books screening visits. The doctor doesn't do anything else.
 */
export function AcceptCard({ nctId, initial }: { nctId: string; initial: TrialOutreach }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Once accepted, keep the call totals moving while the page is open.
  useEffect(() => {
    if (!state.accepted) return;
    const id = setInterval(() => {
      if (document.hidden) return;
      fetchJson<TrialOutreach>(`/api/trials/${nctId}/outreach`).then(setState).catch(() => {});
    }, 4000);
    return () => clearInterval(id);
  }, [nctId, state.accepted]);

  if (!state.available || !state.callable) {
    return (
      <div className="rounded-2xl border border-line p-4 text-[12.5px] text-ink-3">
        {state.available
          ? 'Outreach isn’t set up for this trial yet.'
          : 'The outreach caller isn’t running, so this trial can’t be accepted from here right now.'}
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
      router.push(`/outreach?nct=${nctId}`);
    } catch (err) {
      setError(getErrorMessage(err, 'Accept failed'));
    } finally {
      setBusy(false);
    }
  };

  if (state.accepted) {
    const t = state.totals;
    return (
      <div className="rounded-2xl border border-pass/35 bg-pass-bg/40 p-4">
        <div className="flex items-center justify-between gap-2">
          <Badge tone="pass">Accepted</Badge>
          <span className="text-[11.5px] text-ink-3">by {state.acceptedBy}</span>
        </div>
        <p className="mt-2.5 text-[13px] text-ink-2">
          Ava is calling your pre-screened patients from your office and booking screening visits here.
        </p>
        {t && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Num value={t.called} label={`of ${t.patients} called`} />
            <Num value={t.booked} label="booked" tone="pass" />
            <Num value={t.needsStaff} label="need staff" tone="unk" />
          </div>
        )}
        <Link href={`/outreach?nct=${nctId}`} className="mt-3 inline-block text-[12.5px] font-semibold text-accent hover:underline">
          Follow the outreach →
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-accent-line bg-accent-weak/50 p-4">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-accent">Your patients</div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Num value={state.candidates} label="pre-screen candidates" />
        <Num value={state.chartReview} label="need chart review" tone="unk" />
      </div>
      <p className="mt-3 text-[12.5px] leading-snug text-ink-2">
        Accept and Ava calls your candidates from {DEMO_PRACTICE.doctor}&rsquo;s office. She confirms who she&rsquo;s talking to
        before saying anything about the study, and books screening visits here. Chart-review patients wait for your staff.
      </p>
      <Button className="mt-3 w-full" onClick={accept} disabled={busy || state.candidates === 0}>
        {busy ? 'Starting…' : 'Accept trial'}
      </Button>
      {error && <p className="mt-2 text-[12px] text-fail">{error}</p>}
    </div>
  );
}
