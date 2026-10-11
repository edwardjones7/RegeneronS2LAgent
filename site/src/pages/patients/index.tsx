import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { ConditionChip } from '@/components/patients/ConditionChip';
import { a1cFlag, bmiFlag, bpFlag, PatientDrawer, SEX_LABELS, Value } from '@/components/patients/PatientDrawer';
import { PatientAvatar } from '@/components/patients/PatientAvatar';
import { PatientToolbar } from '@/components/patients/PatientToolbar';
import { AppShell } from '@/components/ui';
import {
  getConditionCounts,
  getPatient,
  listPatients,
  type PatientDetail,
  type PatientListResult,
  type PatientSummary,
} from '@/lib/patients';
import { getPatientOutreach, type PatientOutreach } from '@/lib/caller';
import { DEMO_PRACTICE } from '@/lib/practice';
import { cn } from '@/lib/utils/cn';
import { formatDate } from '@/lib/utils/format';

interface Filters {
  conditions: string[];
  q: string;
  page: number;
}

interface PatientsPageProps {
  filters: Filters;
  result: PatientListResult;
  panelSize: number;
  conditions: { name: string; count: number }[];
  selected: PatientDetail | null;
  /** Ava's outreach to the selected patient, one entry per trial. */
  outreach: PatientOutreach[];
}

const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

export const getServerSideProps: GetServerSideProps<PatientsPageProps> = async ({ query }) => {
  const filters: Filters = { conditions: list(query.condition), q: str(query.q), page: Number(str(query.page)) || 1 };
  const patientId = str(query.patient);
  // Only this practice's patients (AGENTS.MD §5): lookups are scoped to its county.
  const selected = patientId ? getPatient(patientId, DEMO_PRACTICE.county) : null;

  return {
    props: {
      filters,
      // Only this practice's patients (AGENTS.MD §5).
      result: listPatients({
        county: DEMO_PRACTICE.county,
        conditions: filters.conditions,
        query: filters.q || undefined,
        page: filters.page,
      }),
      panelSize: listPatients({ county: DEMO_PRACTICE.county }).total,
      conditions: getConditionCounts(DEMO_PRACTICE.county, 40),
      selected,
      outreach: selected ? await getPatientOutreach(selected.id) : [],
    },
  };
};

/** Builds a /patients URL that keeps the current filters. */
function href(filters: Filters, changes: Partial<Filters> & { patient?: string }): string {
  const next = { ...filters, ...changes };
  const params = new URLSearchParams();
  for (const c of next.conditions) params.append('condition', c);
  if (next.q) params.set('q', next.q);
  if (next.page > 1) params.set('page', String(next.page));
  if (changes.patient) params.set('patient', changes.patient);
  const qs = params.toString();
  return qs ? `/patients?${qs}` : '/patients';
}

/* ————————— List ————————— */

const ROW_GRID = 'grid grid-cols-[minmax(200px,1.2fr)_minmax(0,2fr)_64px_64px_72px_16px] items-center gap-4';

interface PatientRowProps {
  patient: PatientSummary;
  href: string;
  selected: boolean;
  /** Conditions being filtered on; shown first so the reason a patient is listed is visible. */
  pinned: string[];
}

function PatientRow({ patient, href: to, selected, pinned }: PatientRowProps) {
  const ordered = [
    ...patient.activeDiagnoses.filter((d) => pinned.includes(d)),
    ...patient.activeDiagnoses.filter((d) => !pinned.includes(d)),
  ];
  const shown = ordered.slice(0, Math.max(3, pinned.length));
  const more = patient.activeDiagnoses.length - shown.length;
  return (
    <Link
      href={to}
      scroll={false}
      className={cn(
        ROW_GRID,
        'border-t border-line-2 px-5 py-3 text-[13px] transition-colors first:border-t-0',
        selected ? 'bg-accent-weak/60' : 'hover:bg-surface-2/70'
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <PatientAvatar id={patient.id} name={patient.name} />
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-semibold">{patient.name}</span>
          <span className="block text-[12px] text-ink-3">
            {patient.age} · {SEX_LABELS[patient.sex]}
          </span>
        </span>
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
        {shown.map((d) => (
          <ConditionChip key={d} name={d} />
        ))}
        {more > 0 && <span className="text-[12px] text-ink-3">+{more}</span>}
        {shown.length === 0 && <span className="text-[12px] text-ink-3">No active conditions</span>}
      </span>
      <span className="text-right">
        <Value value={patient.bmi?.toFixed(1) ?? null} flag={bmiFlag(patient.bmi)} />
      </span>
      <span className="text-right">
        <Value value={patient.hba1c !== null ? `${patient.hba1c.toFixed(1)}%` : null} flag={a1cFlag(patient.hba1c)} />
      </span>
      <span className="text-right">
        <Value value={patient.bloodPressure} flag={bpFlag(patient.bloodPressure)} />
      </span>
      <svg className="size-4 text-ink-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </Link>
  );
}

/* ————————— Page ————————— */

const chipClass = (active: boolean) =>
  cn(
    'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors',
    active ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-2 hover:border-ink-3'
  );

export default function PatientsPage({ filters, result, panelSize, conditions, selected, outreach }: PatientsPageProps) {
  const first = (result.page - 1) * 50 + 1;
  const last = first + result.patients.length - 1;
  const filtered = Boolean(filters.conditions.length || filters.q);

  return (
    <AppShell title="Patients" active="patients">
      <header>
        <p className="text-[13px] font-medium text-ink-2">{DEMO_PRACTICE.name}</p>
        <h1 className="mt-1 text-[34px] font-semibold leading-tight tracking-[-0.03em]">Your patients</h1>
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-2">
          {panelSize.toLocaleString()} patients, records as of {formatDate(result.asOf)}. These are synthetic records from
          Synthea, not real people.
        </p>
      </header>

      <PatientToolbar filters={{ conditions: filters.conditions, q: filters.q }} conditions={conditions} resultCount={result.total} />

      <div className="mt-5 overflow-hidden rounded-2xl border border-line-2 bg-surface">
        <div className={cn(ROW_GRID, 'border-b border-line-2 bg-surface-2/60 px-5 py-2.5 text-[11.5px] font-medium text-ink-3')}>
          <span>Patient</span>
          <span>Active conditions</span>
          <span className="text-right">BMI</span>
          <span className="text-right">HbA1c</span>
          <span className="text-right">BP</span>
          <span />
        </div>
        {result.patients.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-ink-3">No patients match.</p>
        ) : (
          result.patients.map((p) => (
            <PatientRow
              key={p.id}
              patient={p}
              href={href(filters, { patient: p.id })}
              selected={selected?.id === p.id}
              pinned={filters.conditions}
            />
          ))
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-[12.5px] text-ink-3">
        <span>
          {result.total === 0 ? 'No patients' : `${first}–${last} of ${result.total.toLocaleString()}${filtered ? ' matching' : ''}`}
        </span>
        {result.pageCount > 1 && (
          <span className="flex gap-2">
            {result.page > 1 && (
              <Link href={href(filters, { page: result.page - 1 })} className={chipClass(false)}>
                Previous
              </Link>
            )}
            {result.page < result.pageCount && (
              <Link href={href(filters, { page: result.page + 1 })} className={chipClass(false)}>
                Next
              </Link>
            )}
          </span>
        )}
      </div>

      {selected && <PatientDrawer patient={selected} outreach={outreach} closeHref={href(filters, {})} />}
    </AppShell>
  );
}
