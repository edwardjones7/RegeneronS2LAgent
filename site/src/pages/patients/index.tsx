import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import {
  AppShell,
  Badge,
  Button,
  Drawer,
  DrawerSection,
  EmptyRow,
  LinkButton,
  PageHeader,
  StatCard,
  StatGrid,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui';
import { getPatient, getPatientStats, listPatients, type PatientDetail, type PatientListResult, type PatientStats } from '@/lib/patients';
import { getPatientOutreach, type PatientOutreach } from '@/lib/caller';
import { DEMO_PRACTICE } from '@/lib/practice';
import { formatDate } from '@/lib/utils/format';

interface Filters {
  county: string;
  q: string;
  page: number;
}

interface PatientsPageProps {
  stats: PatientStats;
  filters: Filters;
  result: PatientListResult;
  selected: PatientDetail | null;
  /** Ava's outreach to the selected patient, one entry per trial. */
  outreach: PatientOutreach[];
}

const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');

export const getServerSideProps: GetServerSideProps<PatientsPageProps> = async ({ query }) => {
  // A practice sees only its own patients (.claude/AGENTS.MD §5): always the signed-in practice's county.
  const county = DEMO_PRACTICE.county;
  const filters: Filters = { county, q: str(query.q), page: Number(str(query.page)) || 1 };
  const patientId = str(query.patient);

  return {
    props: {
      stats: getPatientStats(county),
      filters,
      result: listPatients({ county, query: filters.q || undefined, page: filters.page }),
      selected: patientId ? getPatient(patientId, county) : null,
      outreach: patientId ? await getPatientOutreach(patientId) : [],
    },
  };
};

/** Builds a /patients URL that keeps the current filters. */
function href(filters: Filters, changes: Partial<Filters> & { patient?: string }): string {
  const next = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set('q', next.q);
  if (next.page > 1) params.set('page', String(next.page));
  if (changes.patient) params.set('patient', changes.patient);
  const qs = params.toString();
  return qs ? `/patients?${qs}` : '/patients';
}

const OUTREACH_EVENTS: Record<string, string> = {
  call_started: 'Ava called',
  call_ended: 'Call ended',
  sms_sent: 'Texted',
  sms_received: 'Replied',
  visit_booked: 'Booked a screening visit',
  visit_confirmed: 'Confirmed the visit',
  visit_rescheduled: 'Rescheduled',
  identity_verified: 'Confirmed their identity',
  inbound_call: 'Called the office back',
  call_window_set: 'Asked for a later time',
  staff_contacted: 'Reached by staff',
  chart_review_cleared: 'Chart checked',
};

function OutreachSection({ outreach }: { outreach: PatientOutreach[] }) {
  if (!outreach.length) return null;
  return (
    <DrawerSection title="Outreach">
      {outreach.map((o) => (
        <div key={o.nctId ?? o.trialTitle} className="mb-3 rounded-lg border border-line p-3 last:mb-0">
          <div className="flex items-center justify-between gap-2 text-[13px]">
            <span className="font-medium capitalize">{o.trialTitle} study</span>
            <Badge tone={o.status === 'booked' ? 'pass' : o.status === 'needs_human' || o.status === 'chart_review' ? 'unknown' : 'neutral'}>
              {o.status === 'booked' && o.visit
                ? `Visit ${new Date(o.visit).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                : o.status.replaceAll('_', ' ')}
            </Badge>
          </div>
          <ol className="mt-2 space-y-1">
            {o.timeline.slice(-8).map((e, i) => (
              <li key={`${e.at}-${i}`} className="flex gap-2 text-[12.5px]">
                <span className="w-24 shrink-0 text-xs tabular-nums text-ink-3">{formatDate(e.at.slice(0, 10))}</span>
                <span className="min-w-0 text-ink-2">
                  {OUTREACH_EVENTS[e.type] ?? e.type.replaceAll('_', ' ')}
                  {e.body && <span className="mt-0.5 block truncate text-xs text-ink-3">&ldquo;{e.body}&rdquo;</span>}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </DrawerSection>
  );
}

function PatientDrawer({ patient, outreach, closeHref }: { patient: PatientDetail; outreach: PatientOutreach[]; closeHref: string }) {
  return (
    <Drawer
      title={patient.name}
      subtitle={`${patient.age} ${patient.sex} · ${patient.county} · born ${formatDate(patient.birthDate)}`}
      closeHref={closeHref}
    >
      <OutreachSection outreach={outreach} />
      <DrawerSection title={`Active conditions · ${patient.activeConditions.length}`}>
        <ul className="space-y-1.5 text-[13px]">
          {patient.activeConditions.map((c) => (
            <li key={`${c.name}-${c.since}`} className="flex justify-between gap-3">
              <span className={c.clinical ? 'font-medium' : 'text-ink-3'}>{c.name}</span>
              <span className="shrink-0 text-xs text-ink-3">since {formatDate(c.since)}</span>
            </li>
          ))}
        </ul>
      </DrawerSection>

      <DrawerSection title="Latest labs and vitals">
        <div className="overflow-hidden rounded-lg border border-line">
          {patient.observations.map((o) => (
            <div key={o.key} className="flex justify-between gap-3 border-b border-line-2 px-3 py-1.5 text-[13px] last:border-b-0">
              <span className="text-ink-2">{o.label}</span>
              <span className="text-right">
                <span className="font-medium tabular-nums">{o.value}</span>
                {o.unit && <span className="ml-1 text-xs text-ink-3">{o.unit}</span>}
                <span className="ml-2 text-xs text-ink-3">{formatDate(o.date)}</span>
              </span>
            </div>
          ))}
        </div>
      </DrawerSection>

      <DrawerSection title={`Active medications · ${patient.activeMedications.length}`}>
        {patient.activeMedications.length === 0 ? (
          <p className="text-[13px] text-ink-3">None on file.</p>
        ) : (
          <ul className="space-y-1.5 text-[13px]">
            {patient.activeMedications.map((m) => (
              <li key={`${m.name}-${m.since}`} className="flex justify-between gap-3">
                <span>{m.name}</span>
                <span className="shrink-0 text-xs text-ink-3">since {formatDate(m.since)}</span>
              </li>
            ))}
          </ul>
        )}
        {patient.pastMedicationCount > 0 && (
          <p className="mt-2 text-xs text-ink-3">{patient.pastMedicationCount} past prescriptions not shown.</p>
        )}
      </DrawerSection>

      {patient.weights.length > 0 && (
        <DrawerSection title="Weight history">
          <div className="flex flex-wrap gap-1.5">
            {patient.weights.slice(0, 8).map((w) => (
              <Badge key={w.date}>
                {w.kg} kg · {formatDate(w.date)}
              </Badge>
            ))}
          </div>
        </DrawerSection>
      )}

      {patient.acuteVisits.length > 0 && (
        <DrawerSection title={`Urgent and emergency visits · ${patient.acuteVisits.length}`}>
          <ul className="space-y-1.5 text-[13px]">
            {patient.acuteVisits.slice(0, 8).map((v, idx) => (
              <li key={`${v.date}-${idx}`} className="flex justify-between gap-3">
                <span>
                  <Badge tone={v.kind === 'emergency' ? 'fail' : 'unknown'}>{v.kind === 'emergency' ? 'ER' : 'Urgent care'}</Badge>
                  <span className="ml-2 text-ink-2">{v.reason ?? 'No reason recorded'}</span>
                </span>
                <span className="shrink-0 text-xs text-ink-3">{formatDate(v.date)}</span>
              </li>
            ))}
          </ul>
        </DrawerSection>
      )}

      {patient.pastConditions.length > 0 && (
        <DrawerSection title={`Resolved conditions · ${patient.pastConditions.length}`}>
          <ul className="space-y-1.5 text-[13px]">
            {patient.pastConditions.slice(0, 12).map((c, idx) => (
              <li key={`${c.name}-${idx}`} className="flex justify-between gap-3 text-ink-2">
                <span>{c.name}</span>
                <span className="shrink-0 text-xs text-ink-3">{formatDate(c.end)}</span>
              </li>
            ))}
          </ul>
        </DrawerSection>
      )}

      <DrawerSection title="Recent procedures">
        <ul className="space-y-1.5 text-[13px]">
          {patient.recentProcedures.map((p, idx) => (
            <li key={`${p.name}-${idx}`} className="flex justify-between gap-3 text-ink-2">
              <span>{p.name}</span>
              <span className="shrink-0 text-xs text-ink-3">{formatDate(p.date)}</span>
            </li>
          ))}
        </ul>
      </DrawerSection>
    </Drawer>
  );
}

export default function PatientsPage({ stats, filters, result, selected, outreach }: PatientsPageProps) {
  const first = (result.page - 1) * 50 + 1;
  const last = first + result.patients.length - 1;

  return (
    <AppShell title="Patients" active="patients">
      <PageHeader
        title="Patients"
        description={`${DEMO_PRACTICE.name}'s ${stats.total.toLocaleString()} patients · synthetic (Synthea), not real people · records as of ${formatDate(result.asOf)}`}
      />

      <StatGrid>
        <StatCard label="Patients" value={stats.total.toLocaleString()} href="/patients" selected={!filters.q} />
        <StatCard label="Practice" value={DEMO_PRACTICE.county.replace(' County', '')} hint="Synthea county standing in for this practice" />
        <StatCard label="Median age" value={stats.medianAge} />
        <StatCard label="Female" value={`${Math.round(stats.femaleShare * 100)}%`} />
      </StatGrid>

      <form method="get" action="/patients" className="mt-5 flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={filters.q}
          placeholder="Search name or condition, e.g. asthma"
          className="w-80 rounded-[7px] border border-line px-3 py-2 text-[13px] placeholder:text-ink-3 focus:border-accent focus:outline-none"
        />
        <Button type="submit">Filter</Button>
        {filters.q && (
          <LinkButton href="/patients" variant="secondary">
            Clear
          </LinkButton>
        )}
        <span className="ml-auto text-xs text-ink-3">
          {result.total === 0 ? 'No patients' : `${first}–${last} of ${result.total.toLocaleString()}`}
        </span>
      </form>

      <div className="mt-3">
        <Table>
          <thead>
            <tr>
              <Th>Patient</Th>
              <Th>County</Th>
              <Th>Active conditions</Th>
              <Th className="text-right">Meds</Th>
              <Th className="text-right">BMI</Th>
              <Th className="text-right">HbA1c</Th>
              <Th className="text-right">BP</Th>
            </tr>
          </thead>
          <tbody>
            {result.patients.length === 0 && <EmptyRow colSpan={7}>No patients match these filters.</EmptyRow>}
            {result.patients.map((p) => (
              <Tr key={p.id} className={selected?.id === p.id ? 'bg-accent-weak' : 'hover:bg-surface-2'}>
                <Td>
                  <Link href={href(filters, { patient: p.id })} scroll={false} className="block">
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-ink-3">
                      {p.age} {p.sex}
                    </div>
                  </Link>
                </Td>
                <Td className="whitespace-nowrap text-ink-2">{p.county.replace(' County', '')}</Td>
                <Td className="max-w-[360px]">
                  <div className="flex flex-wrap gap-1">
                    {p.activeDiagnoses.slice(0, 3).map((d) => (
                      <Badge key={d}>{d}</Badge>
                    ))}
                    {p.activeDiagnoses.length > 3 && <span className="text-xs text-ink-3">+{p.activeDiagnoses.length - 3}</span>}
                    {p.activeDiagnoses.length === 0 && <span className="text-xs text-ink-3">None</span>}
                  </div>
                </Td>
                <Td className="text-right tabular-nums">{p.activeMedicationCount}</Td>
                <Td className="text-right tabular-nums">{p.bmi?.toFixed(1) ?? '—'}</Td>
                <Td className="text-right tabular-nums">{p.hba1c !== null ? `${p.hba1c.toFixed(1)}%` : '—'}</Td>
                <Td className="text-right tabular-nums">{p.bloodPressure ?? '—'}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>

      {result.pageCount > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-[13px]">
          {result.page > 1 && (
            <LinkButton variant="secondary" href={href(filters, { page: result.page - 1 })}>
              ← Previous
            </LinkButton>
          )}
          <span className="px-2 text-ink-3">
            Page {result.page} of {result.pageCount}
          </span>
          {result.page < result.pageCount && (
            <LinkButton variant="secondary" href={href(filters, { page: result.page + 1 })}>
              Next →
            </LinkButton>
          )}
        </div>
      )}

      {selected && <PatientDrawer patient={selected} outreach={outreach} closeHref={href(filters, {})} />}
    </AppShell>
  );
}
