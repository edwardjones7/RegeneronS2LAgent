import { useEffect, useMemo, useState } from 'react';
import { Badge, type BadgeTone } from '@/components/ui';
import type { CriterionResult, DecidedBy, PatientCriterion, PrescreenPatient } from '@/lib/trials/prescreenPatients';
import { fetchJson, getErrorMessage } from '@/lib/utils/api';
import { cn } from '@/lib/utils/cn';
import type { PrescreenResponse } from '@/pages/api/trials/[nctId]/prescreen';

/**
 * The doctor's own pre-screened patients for one trial: candidates and chart-review patients,
 * each with every criterion the engine checked. Patient data, shown only inside the practice.
 */

const RESULT_LABEL: Record<CriterionResult, { label: string; tone: BadgeTone }> = {
  pass: { label: 'Passed', tone: 'pass' },
  fail: { label: 'Failed', tone: 'fail' },
  unknown: { label: 'Unknown', tone: 'unknown' },
};

const DECIDED_BY: Record<DecidedBy, string> = {
  code: 'Rule on the chart',
  jev: 'Model read of the chart',
  not_applicable: 'Doesn’t apply to this patient',
};

const PAGE = 25;

function usePrescreen(nctId: string) {
  const [state, setState] = useState<{ id: string; data?: PrescreenResponse; error?: string } | null>(null);
  useEffect(() => {
    let live = true;
    fetchJson<PrescreenResponse>(`/api/trials/${nctId}/prescreen`, { fallbackError: 'Could not load the pre-screen results' }).then(
      (data) => live && setState({ id: nctId, data }),
      (err) => live && setState({ id: nctId, error: getErrorMessage(err, 'Could not load the pre-screen results') })
    );
    return () => {
      live = false;
    };
  }, [nctId]);
  return state?.id === nctId ? state : null;
}

const sexLabel = (sex: string | null) => (sex === 'F' ? 'female' : sex === 'M' ? 'male' : null);

function CriterionRow({ c }: { c: PatientCriterion }) {
  const r = RESULT_LABEL[c.result];
  return (
    <li className="flex items-start gap-3 py-2.5">
      <Badge tone={r.tone} className="mt-0.5 w-[62px] justify-center">
        {r.label}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] leading-snug" title={c.originalText ? c.text : undefined}>
          <span className="font-medium text-ink-3">{c.kind === 'inclusion' ? 'Include: ' : 'Exclude: '}</span>
          {c.originalText ?? c.text}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-ink-3">
          <span>{DECIDED_BY[c.decidedBy] ?? c.decidedBy}</span>
          {c.group && <span>· one of a set of alternatives; passing any one is enough</span>}
          {c.uncertain && <span className="font-semibold text-unk">· low confidence{c.confidence !== null && ` (${c.confidence.toFixed(2)})`}</span>}
        </div>
      </div>
    </li>
  );
}

function PatientRow({ patient, open, onToggle }: { patient: PrescreenPatient; open: boolean; onToggle: () => void }) {
  const unknown = patient.criteria.filter((c) => c.result === 'unknown');
  const uncertain = patient.criteria.filter((c) => c.uncertain && c.result !== 'unknown');
  const details = [patient.age !== null ? `${patient.age}` : null, sexLabel(patient.sex)].filter(Boolean).join(', ');

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-ink/[0.02]"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">
            {patient.name}
            {details && <span className="font-normal text-ink-3"> · {details}</span>}
          </span>
          <span className="block truncate text-[12.5px] text-ink-3">{patient.conditionMatch}</span>
        </span>
        {patient.bucket === 'chart_review' && <Badge tone="unknown">{unknown.length || uncertain.length || 1} to check</Badge>}
        {patient.bucket === 'candidate' && uncertain.length > 0 && <Badge tone="unknown">{uncertain.length} low confidence</Badge>}
        <span className="w-10 shrink-0 text-right text-[13px] font-semibold tabular-nums" title="Score: mean engine confidence that the patient passes the chart-checked criteria. Ranks patients; not a measured accuracy.">
          {patient.score.toFixed(2)}
        </span>
        <svg className={cn('size-4 shrink-0 text-ink-3 transition-transform', open && 'rotate-90')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>

      {open && (
        <div className="mb-3 rounded-2xl bg-surface-2/60 px-4 py-3">
          {patient.bucket === 'chart_review' && (
            <div className="mb-2 rounded-xl border border-unk/30 bg-unk-bg/60 px-3 py-2 text-[12.5px] leading-snug text-ink-2">
              <span className="font-semibold text-unk">Why it needs a chart check: </span>
              {unknown.length || uncertain.length
                ? 'the chart didn’t settle the criteria marked Unknown or low confidence below. Someone on your staff should look before anyone calls.'
                : 'the engine wasn’t sure about a criterion. Someone on your staff should look before anyone calls.'}
            </div>
          )}
          <ul className="divide-y divide-line-2">
            {[...unknown, ...patient.criteria.filter((c) => c.result !== 'unknown')].map((c) => (
              <CriterionRow key={c.id} c={c} />
            ))}
          </ul>
          {patient.confirmAtScreening.length > 0 && (
            <details className="group mt-2">
              <summary className="cursor-pointer list-none text-[12.5px] font-medium text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
                Confirm at screening · {patient.confirmAtScreening.length}
                <span className="text-ink-3"> (no chart can answer these)</span>
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[12.5px] leading-snug text-ink-2">
                {patient.confirmAtScreening.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </li>
  );
}

/** Candidates and chart-review patients for one trial, sortable by score; a click opens one patient's criteria. */
export function CandidateReview({ nctId }: { nctId: string }) {
  const state = usePrescreen(nctId);
  const [tab, setTab] = useState<'candidate' | 'chart_review'>('candidate');
  const [ascending, setAscending] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);

  const patients = state?.data?.patients;
  const byBucket = useMemo(() => {
    const list = patients ?? [];
    return { candidate: list.filter((p) => p.bucket === 'candidate'), chart_review: list.filter((p) => p.bucket === 'chart_review') };
  }, [patients]);

  // Land on chart review when there are no candidates.
  const active = tab === 'candidate' && !byBucket.candidate.length && byBucket.chart_review.length ? 'chart_review' : tab;
  const rows = useMemo(
    () => [...byBucket[active]].sort((a, b) => (ascending ? a.score - b.score : b.score - a.score) || a.name.localeCompare(b.name)),
    [byBucket, active, ascending]
  );

  if (!state) return <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />;
  if (state.error) return <p className="text-[13.5px] text-ink-3">{state.error}</p>;

  const counts = state.data?.counts;
  if (!counts) return <p className="text-[13.5px] text-ink-3">Your patients haven&apos;t been pre-screened against this trial yet.</p>;
  if (!byBucket.candidate.length && !byBucket.chart_review.length) {
    return (
      <p className="text-[13.5px] text-ink-3">
        None of the {(counts.candidates + counts.review + counts.notAMatch).toLocaleString()} patients checked pre-screened as a
        candidate or for chart review.
      </p>
    );
  }

  const tabs = [
    { key: 'candidate' as const, label: 'Candidates', count: byBucket.candidate.length },
    { key: 'chart_review' as const, label: 'Chart review', count: byBucket.chart_review.length },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-full bg-surface-2 p-0.5" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active === t.key}
              onClick={() => {
                setTab(t.key);
                setOpenId(null);
                setShown(PAGE);
              }}
              className={cn(
                'h-7 rounded-full px-3 text-[12.5px] font-medium transition-colors',
                active === t.key ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(30,36,48,0.08)]' : 'text-ink-2 hover:text-ink'
              )}
            >
              {t.label} <span className={cn('tabular-nums', t.key === 'chart_review' ? 'text-unk' : 'text-pass')}>{t.count}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setAscending((a) => !a)}
          className="flex h-7 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-medium text-ink-2 ring-1 ring-line hover:text-ink"
        >
          Score {ascending ? 'low to high' : 'high to low'}
          <svg className={cn('size-3.5 transition-transform', ascending && 'rotate-180')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M6 13l6 6 6-6" />
          </svg>
        </button>
      </div>

      <p className="mt-2 text-[12px] text-ink-3">
        {active === 'candidate'
          ? 'Passed every criterion the chart can answer. Not yet screened: the items under Confirm at screening still need a visit or a call.'
          : 'The chart left a criterion open. These patients wait for your staff; nobody calls them until someone checks.'}{' '}
        Names show here because this list runs inside your practice; only counts leave it.
      </p>

      <ul className="mt-2 divide-y divide-line-2 border-y border-line-2">
        {rows.slice(0, shown).map((p) => (
          <PatientRow key={p.patientId} patient={p} open={openId === p.patientId} onToggle={() => setOpenId(openId === p.patientId ? null : p.patientId)} />
        ))}
      </ul>
      {rows.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className="mt-3 text-[12.5px] font-semibold text-accent hover:underline">
          Show {Math.min(PAGE, rows.length - shown)} more of {rows.length - shown}
        </button>
      )}
    </div>
  );
}
