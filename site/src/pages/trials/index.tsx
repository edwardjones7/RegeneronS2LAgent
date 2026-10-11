import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import {
  AppShell,
  Badge,
  EmptyRow,
  type NavCounts,
  Notice,
  PageHeader,
  StatCard,
  StatGrid,
  Table,
  Tabs,
  Td,
  Th,
  Tr,
} from '@/components/ui';
import { getNavCounts } from '@/lib/nav';
import { listOpenTrials, type TrialListItem } from '@/lib/trials';
import { formatDate, formatPhases } from '@/lib/utils/format';

type View = 'protocols' | 'nj' | 'all';

interface TrialsPageProps {
  counts: NavCounts;
  view: View;
  trials: TrialListItem[];
  totals: { all: number; nj: number; protocols: number };
}

const VIEW_FILTERS: Record<View, (t: TrialListItem) => boolean> = {
  protocols: (t) => t.hasProtocol,
  nj: (t) => t.njRecruiting > 0,
  all: () => true,
};

export const getServerSideProps: GetServerSideProps<TrialsPageProps> = async ({ query }) => {
  const view: View = query.view === 'nj' || query.view === 'all' ? query.view : 'protocols';
  const [counts, all] = await Promise.all([getNavCounts(), listOpenTrials()]);

  return {
    props: {
      counts,
      view,
      trials: all.filter(VIEW_FILTERS[view]),
      totals: {
        all: all.length,
        nj: all.filter(VIEW_FILTERS.nj).length,
        protocols: all.filter(VIEW_FILTERS.protocols).length,
      },
    },
  };
};

export default function TrialsPage({ counts, view, trials, totals }: TrialsPageProps) {
  return (
    <AppShell title="Open trials" active="trials" counts={counts}>
      <PageHeader
        title="Open trials"
        description="Recruiting and not-yet-recruiting Regeneron trials, synced from ClinicalTrials.gov"
        tabs={
          <Tabs
            active={view}
            items={[
              { key: 'protocols', label: 'Demo protocols', href: '/trials', count: totals.protocols },
              { key: 'nj', label: 'Recruiting in New Jersey', href: '/trials?view=nj', count: totals.nj },
              { key: 'all', label: 'All open', href: '/trials?view=all', count: totals.all },
            ]}
          />
        }
      />

      <StatGrid>
        <StatCard label="Open trials" value={totals.all} href="/trials?view=all" selected={view === 'all'} />
        <StatCard label="Recruiting in NJ" value={totals.nj} suffix={`/ ${totals.all}`} href="/trials?view=nj" selected={view === 'nj'} />
        <StatCard label="Demo protocols" value={totals.protocols} hint="Criteria authored for pre-screening" href="/trials" selected={view === 'protocols'} />
        <StatCard label="Patients loaded" value={counts.patients.toLocaleString()} hint="Synthetic, New Jersey" href="/patients" />
      </StatGrid>

      <div className="mt-5">
        <Table>
          <thead>
            <tr>
              <Th>Condition / trial</Th>
              <Th>Drug</Th>
              <Th>Phase</Th>
              <Th className="text-right">Enrollment</Th>
              <Th>NJ sites</Th>
              <Th>Primary completion</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {trials.length === 0 && <EmptyRow colSpan={7}>No trials in this view.</EmptyRow>}
            {trials.map((t) => (
              <Tr key={t.nctId} className="hover:bg-surface-2">
                <Td className="max-w-[420px]">
                  <Link href={`/trials/${t.nctId}`} className="block">
                    <div className="font-semibold">{t.conditions.slice(0, 2).join(', ') || t.title}</div>
                    <div className="mt-0.5 truncate text-xs text-ink-3">
                      {t.nctId} · {t.title}
                    </div>
                  </Link>
                </Td>
                <Td className="max-w-[180px] truncate">{t.drug ?? '—'}</Td>
                <Td>
                  <Badge tone="accent">{formatPhases(t.phases)}</Badge>
                </Td>
                <Td className="text-right tabular-nums">{t.enrollment?.toLocaleString() ?? '—'}</Td>
                <Td>
                  {t.njLocations === 0 ? (
                    <span className="text-ink-3">None</span>
                  ) : (
                    <span className="tabular-nums">
                      {t.njRecruiting} recruiting
                      {t.njLocations > t.njRecruiting && <span className="text-ink-3"> / {t.njLocations}</span>}
                    </span>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-ink-2">{formatDate(t.primaryCompletion)}</Td>
                <Td className="text-right">{t.hasProtocol && <Badge tone="pass">Protocol ready</Badge>}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>

      <Notice title="Matching isn't wired up yet.">
        Candidate counts per trial will appear here once the pre-screening engine runs against the patient file.
      </Notice>
    </AppShell>
  );
}
