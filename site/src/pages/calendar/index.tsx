import type { GetServerSideProps } from 'next';
import { type CalendarTrial, WeekCalendar } from '@/components/outreach/WeekCalendar';
import { AppShell, PageIntro } from '@/components/ui';
import { calendarWeekStart, getCalendar, getOutreachOverview, type PracticeCalendar } from '@/lib/caller';
import { DEMO_PRACTICE } from '@/lib/practice';
import { getTrialAreas } from '@/lib/trialAreas';
import type { TherapeuticArea } from '@/lib/trials/areas';

interface CalendarPageProps {
  calendar: PracticeCalendar;
  trials: CalendarTrial[];
  areas: Record<string, TherapeuticArea>;
  /** The practice's local date, YYYY-MM-DD. */
  today: string;
}

export const getServerSideProps: GetServerSideProps<CalendarPageProps> = async () => {
  const [calendar, overview, areas] = await Promise.all([getCalendar(calendarWeekStart(), 5), getOutreachOverview(), getTrialAreas()]);
  return {
    props: {
      calendar,
      trials: overview.trials.map((t) => ({ nctId: t.nctId, title: t.title })),
      areas,
      today: new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
    },
  };
};

/** Every screening visit at the practice. Ava books straight into it, for every accepted trial. */
export default function CalendarPage({ calendar, trials, areas, today }: CalendarPageProps) {
  return (
    <AppShell title="Calendar" active="calendar">
      <PageIntro
        title={`Here’s your week, ${DEMO_PRACTICE.doctor}.`}
        description="Screening visits Ava has booked for the trials you’ve accepted."
      />
      <div className="mt-6">
        <WeekCalendar initial={calendar} today={today} trials={trials} areas={areas} />
      </div>
    </AppShell>
  );
}
