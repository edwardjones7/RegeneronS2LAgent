import type { GetServerSideProps } from 'next';
import type { ReactNode } from 'react';
import { AppShell, Badge, type BadgeTone, PageHeader, Table, Tabs, Td, Th, Tr } from '@/components/ui';
import { getProtocol, type CriterionCheck, type Protocol, type ProtocolCriterion } from '@/lib/protocols';
import { getTrialDetail, type TrialDetail } from '@/lib/trials';
import { formatAgeRange, formatDate, formatPhases, formatStatus } from '@/lib/utils/format';

type Tab = 'overview' | 'criteria' | 'locations';

interface TrialPageProps {
  tab: Tab;
  trial: TrialDetail;
  protocol: Protocol | null;
}

export const getServerSideProps: GetServerSideProps<TrialPageProps> = async ({ params, query }) => {
  const nctId = String(params?.nctId ?? '');
  const trial = await getTrialDetail(nctId);
  if (!trial) return { notFound: true };

  const tab: Tab = query.tab === 'criteria' || query.tab === 'locations' ? query.tab : 'overview';
  return { props: { tab, trial, protocol: getProtocol(nctId) } };
};

const CHECK_LABELS: Record<CriterionCheck, { label: string; tone: BadgeTone }> = {
  code: { label: 'Chart data', tone: 'accent' },
  jev: { label: 'Jev judgment', tone: 'neutral' },
  review: { label: 'Confirm at screening', tone: 'unknown' },
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">{label}</div>
      <div className="mt-1 text-[13px]">{children}</div>
    </div>
  );
}

function CriteriaList({ title, criteria }: { title: string; criteria: ProtocolCriterion[] }) {
  if (!criteria.length) return null;
  return (
    <div className="mt-5">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <Table>
        <tbody>
          {criteria.map((c) => (
            <Tr key={c.id}>
              <Td>
                <div>{c.text}</div>
                {c.reason && <div className="mt-1 text-xs text-ink-3">{c.reason}</div>}
              </Td>
              <Td className="w-44 text-right">
                <Badge tone={CHECK_LABELS[c.check].tone}>{CHECK_LABELS[c.check].label}</Badge>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

export default function TrialPage({ tab, trial, protocol }: TrialPageProps) {
  const base = `/trials/${trial.nctId}`;

  return (
    <AppShell title={trial.nctId} active="trials">
      <PageHeader
        back={{ href: '/trials', label: 'Open trials' }}
        title={protocol?.shortTitle ?? trial.conditions.slice(0, 2).join(', ') ?? trial.title}
        description={`${trial.drug ?? 'Intervention'} · ${formatPhases(trial.phases)} · ${trial.sponsor ?? 'Unknown sponsor'} · ${trial.nctId}`}
        actions={
          <a
            href={`https://clinicaltrials.gov/study/${trial.nctId}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-[7px] border border-line px-3.5 py-2 text-[12.5px] font-semibold hover:border-ink-3"
          >
            ClinicalTrials.gov ↗
          </a>
        }
        tabs={
          <Tabs
            active={tab}
            items={[
              { key: 'overview', label: 'Overview', href: base },
              { key: 'criteria', label: 'Criteria', href: `${base}?tab=criteria`, count: protocol?.criteria.length },
              { key: 'locations', label: 'Locations', href: `${base}?tab=locations`, count: trial.locations.length },
            ]}
          />
        }
      />

      {tab === 'overview' && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
          <div>
            <h2 className="text-base font-semibold">{trial.title}</h2>
            {trial.summary && <p className="mt-3 whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2">{trial.summary}</p>}
            {trial.interventions.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-1.5">
                {trial.interventions.map((i, idx) => (
                  <Badge key={`${i.name}-${idx}`}>{i.name}</Badge>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 content-start gap-x-4 gap-y-4 rounded-[10px] border border-line p-4">
            <Fact label="Status">
              <Badge tone="pass">{formatStatus(trial.status)}</Badge>
            </Fact>
            <Fact label="Enrollment">{trial.enrollment?.toLocaleString() ?? '—'}</Fact>
            <Fact label="Ages">{formatAgeRange(trial.minimumAge, trial.maximumAge)}</Fact>
            <Fact label="Sex">{trial.sex ? formatStatus(trial.sex) : '—'}</Fact>
            <Fact label="Healthy volunteers">{trial.healthyVolunteers ? 'Yes' : 'No'}</Fact>
            <Fact label="NJ sites">{`${trial.njRecruiting} recruiting`}</Fact>
            <Fact label="Start">{formatDate(trial.startDate)}</Fact>
            <Fact label="Primary completion">{formatDate(trial.primaryCompletion)}</Fact>
            <Fact label="Last updated">{formatDate(trial.lastUpdate)}</Fact>
          </div>
        </div>
      )}

      {tab === 'criteria' && (
        <div className="mt-2">
          {protocol ? (
            <>
              <p className="mt-4 text-[13px] text-ink-2">
                <Badge tone="pass">Protocol ready</Badge> <span className="ml-1">{protocol.note}</span>
              </p>
              <CriteriaList title="Inclusion" criteria={protocol.criteria.filter((c) => c.type === 'inclusion')} />
              <CriteriaList title="Exclusion" criteria={protocol.criteria.filter((c) => c.type === 'exclusion')} />
            </>
          ) : (
            <p className="mt-4 text-[13px] text-ink-3">No demo protocol for this trial yet. Showing the registry text.</p>
          )}
          <details className="mt-6 rounded-[10px] border border-line" open={!protocol}>
            <summary className="cursor-pointer px-4 py-3 text-[13px] font-semibold">Full eligibility text from ClinicalTrials.gov</summary>
            <pre className="whitespace-pre-wrap border-t border-line px-4 py-3 font-sans text-[13px] leading-relaxed text-ink-2">
              {trial.eligibilityCriteria ?? 'Not provided.'}
            </pre>
          </details>
        </div>
      )}

      {tab === 'locations' && (
        <div className="mt-5">
          <Table>
            <thead>
              <tr>
                <Th>Facility</Th>
                <Th>City</Th>
                <Th>State</Th>
                <Th>Country</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {trial.locations.map((l, idx) => (
                <Tr key={`${l.facility}-${idx}`}>
                  <Td className="font-medium">{l.facility ?? '—'}</Td>
                  <Td>{l.city ?? '—'}</Td>
                  <Td>{l.state ?? '—'}</Td>
                  <Td className="text-ink-2">{l.country ?? '—'}</Td>
                  <Td>{l.status && <Badge tone={l.status === 'RECRUITING' ? 'pass' : 'neutral'}>{formatStatus(l.status)}</Badge>}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </AppShell>
  );
}
