import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ConditionChip } from '@/components/patients/ConditionChip';
import { PatientAvatar } from '@/components/patients/PatientAvatar';
import { PatientToolbar } from '@/components/patients/PatientToolbar';
import { AppShell, Drawer, DrawerSection } from '@/components/ui';
import {
  getConditionCounts,
  getPatient,
  listPatients,
  type PatientDetail,
  type PatientListResult,
  type PatientSummary,
} from '@/lib/patients';
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
}

const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

export const getServerSideProps: GetServerSideProps<PatientsPageProps> = async ({ query }) => {
  const filters: Filters = { conditions: list(query.condition), q: str(query.q), page: Number(str(query.page)) || 1 };
  const patientId = str(query.patient);
  const selected = patientId ? getPatient(patientId) : null;

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
      selected: selected?.county === DEMO_PRACTICE.county ? selected : null,
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

const SEX_LABELS = { F: 'Female', M: 'Male' } as const;

/* ————————— Values with a gentle flag when out of range ————————— */

type Flag = 'high' | 'borderline' | null;

const FLAG_CLASS: Record<Exclude<Flag, null>, string> = { high: 'text-fail', borderline: 'text-unk' };

function bmiFlag(bmi: number | null): Flag {
  if (bmi === null) return null;
  return bmi >= 30 ? 'borderline' : null;
}

function a1cFlag(a1c: number | null): Flag {
  if (a1c === null) return null;
  return a1c >= 6.5 ? 'high' : a1c >= 5.7 ? 'borderline' : null;
}

function bpFlag(bp: string | null): Flag {
  if (!bp) return null;
  const [sys, dia] = bp.split('/').map(Number);
  return sys >= 140 || dia >= 90 ? 'high' : sys >= 130 || dia >= 80 ? 'borderline' : null;
}

function Value({ value, flag }: { value: string | null; flag: Flag }) {
  return (
    <span className={cn('tabular-nums', value === null ? 'text-ink-3' : flag ? FLAG_CLASS[flag] : 'text-ink')}>
      {value ?? '—'}
    </span>
  );
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

/* ————————— Drawer ————————— */

const HIDDEN_TILES = new Set(['height_cm', 'weight_kg', 'systolic_bp', 'diastolic_bp']);

interface TileProps {
  label: string;
  value: string;
  unit?: string | null;
  date: string;
  flag?: Flag;
}

function Tile({ label, value, unit, date, flag = null }: TileProps) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5">
      <div className="truncate text-[11px] font-medium text-ink-3">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={cn('text-[17px] font-semibold tabular-nums tracking-[-0.01em]', flag && FLAG_CLASS[flag])}>{value}</span>
        {unit && <span className="truncate text-[11px] text-ink-3">{unit}</span>}
      </div>
      <div className="text-[11px] text-ink-3">{formatDate(date)}</div>
    </div>
  );
}

/** Weight over time as a small line, oldest on the left. */
function WeightTrend({ weights }: { weights: PatientDetail['weights'] }) {
  const points = [...weights].reverse().slice(-16);
  const latest = points[points.length - 1];
  const first = points[0];
  if (!latest) return null;
  const kgs = points.map((w) => w.kg);
  const lo = Math.min(...kgs);
  const span = Math.max(...kgs) - lo || 1;
  const line = points
    .map((w, i) => `${(i / Math.max(points.length - 1, 1)) * 100},${36 - ((w.kg - lo) / span) * 32}`)
    .join(' ');
  const change = latest.kg - first.kg;

  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5">
      <div className="flex items-baseline justify-between">
        <span>
          <span className="text-[17px] font-semibold tabular-nums">{latest.kg}</span>
          <span className="ml-1 text-[11px] text-ink-3">kg · {formatDate(latest.date)}</span>
        </span>
        {points.length > 1 && (
          <span className="text-[11px] text-ink-3">
            {change >= 0 ? '+' : '−'}
            {Math.abs(change).toFixed(1)} kg since {first.date.slice(0, 4)}
          </span>
        )}
      </div>
      {points.length > 1 && (
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-2 h-10 w-full text-accent">
          <polyline
            points={line}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
    </div>
  );
}

function Collapsible({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <details className="group mt-6 rounded-xl border border-line-2">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-[13px] font-semibold [&::-webkit-details-marker]:hidden">
        {title}
        <svg
          className="size-4 text-ink-3 transition-transform group-open:rotate-90"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </summary>
      <div className="border-t border-line-2 px-3 py-2.5">{children}</div>
    </details>
  );
}

function DatedList({ items }: { items: { name: string; date: string }[] }) {
  return (
    <ul className="space-y-1.5 text-[13px]">
      {items.map((item, idx) => (
        <li key={`${item.name}-${idx}`} className="flex justify-between gap-3 text-ink-2">
          <span className="truncate">{item.name}</span>
          <span className="shrink-0 text-[11.5px] text-ink-3">{formatDate(item.date)}</span>
        </li>
      ))}
    </ul>
  );
}

function PatientDrawer({ patient, closeHref }: { patient: PatientDetail; closeHref: string }) {
  const clinical = patient.activeConditions.filter((c) => c.clinical);
  const other = patient.activeConditions.filter((c) => !c.clinical);
  const obs = Object.fromEntries(patient.observations.map((o) => [o.key, o]));
  const shown = patient.observations.filter((o) => !HIDDEN_TILES.has(o.key));
  const tiles = shown.filter((o) => !Number.isNaN(Number(o.value)));
  const notes = shown.filter((o) => Number.isNaN(Number(o.value)));
  const bp =
    obs.systolic_bp && obs.diastolic_bp
      ? `${Math.round(Number(obs.systolic_bp.value))}/${Math.round(Number(obs.diastolic_bp.value))}`
      : null;

  return (
    <Drawer
      title={patient.name}
      leading={<PatientAvatar id={patient.id} name={patient.name} size="lg" />}
      subtitle={`${patient.age} · ${SEX_LABELS[patient.sex]} · born ${formatDate(patient.birthDate)}`}
      closeHref={closeHref}
    >
      <DrawerSection title={`Active conditions · ${clinical.length}`}>
        {clinical.length === 0 ? (
          <p className="text-[13px] text-ink-3">None on file.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {clinical.map((c) => (
              <span key={`${c.name}-${c.since}`} title={`Since ${formatDate(c.since)}`}>
                <ConditionChip name={c.name} />
              </span>
            ))}
          </div>
        )}
        {other.length > 0 && (
          <p className="mt-2 text-[12px] leading-relaxed text-ink-3">Also recorded: {other.map((c) => c.name).join(', ')}.</p>
        )}
      </DrawerSection>

      <DrawerSection title="Vitals and labs">
        <div className="grid grid-cols-3 gap-2">
          {bp && obs.systolic_bp && <Tile label="Blood pressure" value={bp} unit="mmHg" date={obs.systolic_bp.date} flag={bpFlag(bp)} />}
          {tiles.map((o) => (
            <Tile
              key={o.key}
              label={o.label}
              value={o.value}
              unit={o.unit}
              date={o.date}
              flag={o.key === 'hba1c' ? a1cFlag(Number(o.value)) : o.key === 'bmi' ? bmiFlag(Number(o.value)) : null}
            />
          ))}
        </div>
        {notes.map((o) => (
          <p key={o.key} className="mt-2 text-[12.5px] text-ink-2">
            <span className="text-ink-3">{o.label}:</span> {o.value}
          </p>
        ))}
      </DrawerSection>

      {patient.weights.length > 0 && (
        <DrawerSection title="Weight">
          <WeightTrend weights={patient.weights} />
        </DrawerSection>
      )}

      <DrawerSection title={`Medications · ${patient.activeMedications.length}`}>
        {patient.activeMedications.length === 0 ? (
          <p className="text-[13px] text-ink-3">None active.</p>
        ) : (
          <ul className="divide-y divide-line-2 rounded-xl border border-line-2">
            {patient.activeMedications.map((m) => (
              <li key={`${m.name}-${m.since}`} className="flex items-start justify-between gap-3 px-3 py-2 text-[13px]">
                <span className="line-clamp-2">{m.name}</span>
                <span className="shrink-0 text-[11.5px] text-ink-3">since {m.since.slice(0, 4)}</span>
              </li>
            ))}
          </ul>
        )}
        {patient.pastMedicationCount > 0 && (
          <p className="mt-2 text-[12px] text-ink-3">{patient.pastMedicationCount} past prescriptions not shown.</p>
        )}
      </DrawerSection>

      {patient.acuteVisits.length > 0 && (
        <DrawerSection title={`Urgent and emergency visits · ${patient.acuteVisits.length}`}>
          <ul className="space-y-1.5">
            {patient.acuteVisits.slice(0, 6).map((v, idx) => (
              <li key={`${v.date}-${idx}`} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                      v.kind === 'emergency' ? 'bg-fail-bg text-fail' : 'bg-unk-bg text-unk'
                    )}
                  >
                    {v.kind === 'emergency' ? 'ER' : 'Urgent care'}
                  </span>
                  <span className="truncate text-ink-2">{v.reason ?? 'No reason recorded'}</span>
                </span>
                <span className="shrink-0 text-[11.5px] text-ink-3">{formatDate(v.date)}</span>
              </li>
            ))}
          </ul>
        </DrawerSection>
      )}

      {patient.pastConditions.length > 0 && (
        <Collapsible title={`Resolved conditions · ${patient.pastConditions.length}`}>
          <DatedList items={patient.pastConditions.slice(0, 15).map((c) => ({ name: c.name, date: c.end }))} />
        </Collapsible>
      )}

      {patient.recentProcedures.length > 0 && (
        <Collapsible title="Recent procedures">
          <DatedList items={patient.recentProcedures} />
        </Collapsible>
      )}
    </Drawer>
  );
}

/* ————————— Page ————————— */

const chipClass = (active: boolean) =>
  cn(
    'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors',
    active ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-2 hover:border-ink-3'
  );

export default function PatientsPage({ filters, result, panelSize, conditions, selected }: PatientsPageProps) {
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

      {selected && <PatientDrawer patient={selected} closeHref={href(filters, {})} />}
    </AppShell>
  );
}
