import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { CalendarSlot, PracticeCalendar } from '@/lib/caller';
import { fetchJson } from '@/lib/utils/api';
import { cn } from '@/lib/utils/cn';

/** Shift a YYYY-MM-DD date by whole days. */
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const dayLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
const dateLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const timeLabel = (hhmm: string) =>
  new Date(`2000-01-01T${hhmm}:00`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(':00', '');

/**
 * The practice's visit calendar for one work week. Ava books straight into it, so a visit appears
 * in its slot moments after a patient says yes. One calendar per practice, shared by every trial.
 */
export function WeekCalendar({ initial, today }: { initial: PracticeCalendar; today: string }) {
  const [cal, setCal] = useState(initial);
  const [start, setStart] = useState(initial.start);
  const known = useRef(new Set(initial.slots.filter((s) => s.booked).map((s) => s.slotId)));
  const [fresh, setFresh] = useState<Set<number>>(new Set());

  useEffect(() => {
    let live = true;
    const load = () =>
      fetchJson<PracticeCalendar>(`/api/outreach/calendar?start=${start}`)
        .then((c) => {
          if (!live) return;
          // Highlight visits that appeared since the last look (Ava just booked them).
          const booked = c.slots.filter((s) => s.booked).map((s) => s.slotId);
          const added = booked.filter((id) => !known.current.has(id));
          booked.forEach((id) => known.current.add(id));
          if (added.length) setFresh(new Set(added));
          setCal(c);
        })
        .catch(() => {});
    if (start !== cal.start) load();
    const id = setInterval(() => !document.hidden && load(), 5000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [start, cal.start]);

  const days = Array.from({ length: 5 }, (_, i) => addDays(start, i));
  const byCell = new Map<string, CalendarSlot>();
  for (const s of cal.slots) byCell.set(`${s.startsAt.slice(0, 10)} ${s.startsAt.slice(11, 16)}`, s);
  const times = [...new Set(cal.slots.map((s) => s.startsAt.slice(11, 16)))].sort();
  const booked = cal.slots.filter((s) => s.booked).length;
  const isThisWeek = start <= today && today < addDays(start, 7);
  const isNextWeek = !isThisWeek && start > today && start <= addDays(today, 7);

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-3">
          Calendar <span className="ml-1 normal-case tracking-normal text-ink-3">· {booked} {booked === 1 ? 'visit' : 'visits'}</span>
        </h2>
        <div className="flex items-center gap-1 text-[12.5px]">
          <button onClick={() => setStart(addDays(start, -7))} className="rounded-md px-2 py-1 text-ink-2 hover:bg-surface-2" aria-label="Previous week">
            ‹
          </button>
          <span className="min-w-[124px] text-center font-semibold">
            {isThisWeek ? 'This week' : isNextWeek ? 'Next week' : `${dateLabel(days[0])} – ${dateLabel(days[4])}`}
          </span>
          <button onClick={() => setStart(addDays(start, 7))} className="rounded-md px-2 py-1 text-ink-2 hover:bg-surface-2" aria-label="Next week">
            ›
          </button>
        </div>
      </div>

      {!cal.available ? (
        <p className="mt-3 text-[13px] text-ink-3">Can&rsquo;t load the calendar right now.</p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-[10px] border border-line">
          <div className="grid grid-cols-[64px_repeat(5,minmax(0,1fr))] border-b border-line bg-surface-2 text-[12px]">
            <div />
            {days.map((d) => (
              <div key={d} className={cn('border-l border-line px-2 py-2', d === today && 'text-accent')}>
                <span className="font-semibold">{dayLabel(d)}</span> <span className="text-ink-3">{dateLabel(d)}</span>
              </div>
            ))}
          </div>
          {times.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-ink-3">No visit times this week.</p>
          ) : (
            times.map((t) => (
              <div key={t} className="grid grid-cols-[64px_repeat(5,minmax(0,1fr))] border-b border-line-2 last:border-b-0">
                <div className="px-2 py-2 text-right text-[11.5px] tabular-nums text-ink-3">{timeLabel(t)}</div>
                {days.map((d) => {
                  const s = byCell.get(`${d} ${t}`);
                  const past = d < today;
                  return (
                    <div key={d} className={cn('min-h-[52px] border-l border-line-2 p-1', past && 'bg-surface-2/60')}>
                      {s?.booked ? (
                        <Link
                          href={s.booked.patientId ? `/patients?patient=${encodeURIComponent(s.booked.patientId)}` : '#'}
                          className={cn(
                            'block h-full rounded-md border border-pass/30 bg-pass-bg px-2 py-1 transition-colors hover:border-pass',
                            fresh.has(s.slotId) && 'animate-pulse ring-2 ring-pass/40'
                          )}
                        >
                          <span className="block truncate text-[12px] font-semibold">{s.booked.name}</span>
                          <span className="block truncate text-[11px] text-ink-3">
                            {s.booked.trial ? `${s.booked.trial} · ` : ''}
                            {s.booked.bookedBy === 'text' ? 'booked by text' : 'booked by Ava'}
                          </span>
                        </Link>
                      ) : s && !past ? (
                        <span className="flex h-full items-center rounded-md border border-dashed border-line px-2 text-[11px] text-ink-3">Open</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
