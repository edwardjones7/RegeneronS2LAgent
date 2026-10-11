import type { GetServerSideProps } from 'next';
import { WeekCalendar } from '@/components/outreach/WeekCalendar';
import { AppShell, PageHeader } from '@/components/ui';
import { calendarWeekStart, getCalendar, type PracticeCalendar } from '@/lib/caller';
import { DEMO_PRACTICE } from '@/lib/practice';

interface CalendarPageProps {
  calendar: PracticeCalendar;
  /** The practice's local date, YYYY-MM-DD. */
  today: string;
}

export const getServerSideProps: GetServerSideProps<CalendarPageProps> = async () => ({
  props: {
    calendar: await getCalendar(calendarWeekStart(), 5),
    today: new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
  },
});

/** Every screening visit at the practice. Ava books straight into it, for every accepted trial. */
export default function CalendarPage({ calendar, today }: CalendarPageProps) {
  return (
    <AppShell title="Calendar" active="calendar">
      <PageHeader
        title="Calendar"
        description={`Screening visits at ${DEMO_PRACTICE.name}. Ava books straight into it.`}
      />
      <div className="mt-6">
        <WeekCalendar initial={calendar} today={today} />
      </div>
    </AppShell>
  );
}
