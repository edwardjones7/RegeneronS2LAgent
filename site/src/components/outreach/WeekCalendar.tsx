import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AREA_STYLES } from '@/components/trials/areaStyles';
import { Button } from '@/components/ui';
import type { CalendarSlot, PracticeCalendar } from '@/lib/caller';
import type { TherapeuticArea } from '@/lib/trials/areas';
import { fetchJson, getErrorMessage } from '@/lib/utils/api';
import { cn } from '@/lib/utils/cn';

/** Shift a YYYY-MM-DD date by whole days. */
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const dayLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
const dateLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const whenLabel = (local: string) =>
  new Date(local).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export interface CalendarTrial {
  nctId: string;
  title: string;
}

function VisitPopover({
  slot,
  openSlots,
  alignRight,
  onClose,
  onChanged,
}: {
  slot: CalendarSlot;
  openSlots: CalendarSlot[];
  /** Late-week columns open the popover leftward so it stays on screen. */
  alignRight: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const b = slot.booked!;
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (action: 'cancel-visit' | 'reschedule', slotId?: number) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/outreach/leads/${b.leadId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slotId ? { slotId } : {}),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'That didn’t work');
      onChanged();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'That didn’t work'));
      setBusy(false);
    }
  };
  return (
    <div
      role="dialog"
      aria-label={`Visit with ${b.name}`}
      className={cn(
        'absolute top-full z-30 mt-1.5 w-72 animate-fade-in rounded-2xl border border-line-2 bg-surface p-4 text-left shadow-[0_16px_40px_-12px_rgba(30,36,48,0.3)]',
        alignRight ? 'right-0' : 'left-0'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold">{b.name}</div>
          <div className="text-[12px] text-ink-3">{whenLabel(slot.startsAt)} · screening visit</div>
        </div>
        <button
          onClick={onClose}
          className="-mr-1 -mt-1 flex size-7 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
          aria-label="Close"
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <dl className="mt-3 space-y-1 text-[12.5px]">
        {b.trial && (
          <div className="flex justify-between gap-2">
            <dt className="text-ink-3">Study</dt>
            <dd className="capitalize">{b.trial}</dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt className="text-ink-3">Booked</dt>
          <dd>
            {b.bookedBy === 'text' ? 'from a text reply' : 'by Ava on a call'}
            {b.bookedAt && `, ${new Date(b.bookedAt.endsWith('Z') ? b.bookedAt : `${b.bookedAt}Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
          </dd>
        </div>
      </dl>
      {b.recordingCallId ? (
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Listen to the call</div>
          <audio controls preload="none" className="h-8 w-full" src={`/api/outreach/leads/${b.leadId}/recording/${b.recordingCallId}`} />
        </div>
      ) : (
        b.simulated && <p className="mt-3 text-[11.5px] text-ink-3">Simulated patient: no recording.</p>
      )}
      <div className="mt-3 border-t border-line-2 pt-3">
        <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3" htmlFor={`move-${slot.slotId}`}>
          Move to
        </label>
        <select
          id={`move-${slot.slotId}`}
          disabled={busy || openSlots.length === 0}
          defaultValue=""
          onChange={(e) => e.target.value && act('reschedule', Number(e.target.value))}
          className="mt-1 w-full rounded-[7px] border border-line bg-surface px-2.5 py-1.5 text-[12.5px] focus:border-accent focus:outline-none"
        >
          <option value="">{openSlots.length ? 'Pick an open time…' : 'No open times this week'}</option>
          {openSlots.map((o) => (
            <option key={o.slotId} value={o.slotId}>
              {whenLabel(o.startsAt)}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-ink-3">The patient gets a text with the new time.</p>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        {b.patientId ? (
          <Link href={`/patients?patient=${encodeURIComponent(b.patientId)}`} className="text-[12.5px] font-semibold text-accent hover:underline">
            View patient →
          </Link>
        ) : (
          <span />
        )}
        {confirmCancel ? (
          <Button variant="secondary" className="border-fail/40 px-2.5 py-1 text-fail" disabled={busy} onClick={() => act('cancel-visit')}>
            Yes, cancel it
          </Button>
        ) : (
          <button onClick={() => setConfirmCancel(true)} className="text-[12.5px] text-ink-3 hover:text-fail" disabled={busy}>
            Cancel visit
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-[12px] text-fail">{error}</p>}
    </div>
  );
}

/* ————————— Week grid ————————— */

/** The visible day, in hours. Slots outside it still show, clamped to the edges. */
const DAY_START = 9;
const DAY_END = 18;
/** Height of one hour in the grid. Kept in sync with the h-16 hour rows below. */
const HOUR_PX = 64;

const minutesOf = (local: string) => Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));
const hourLabel = (h: number) => (h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`);
const clockLabel = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
};
/** "9:30 – 10:30 AM" */
const rangeLabel = (start: number, minutes: number) =>
  `${clockLabel(start)} – ${clockLabel(start + minutes)} ${start + minutes >= 12 * 60 ? 'PM' : 'AM'}`;

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" />
    </svg>
  );
}

function TextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 5h16v11H9l-5 4z" />
    </svg>
  );
}

/** Where "now" falls in the grid, in practice time, or null outside the day. */
function nowOffset(): number | null {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins < DAY_START * 60 || mins > DAY_END * 60) return null;
  return ((mins - DAY_START * 60) / 60) * HOUR_PX;
}

/**
 * The practice's visit calendar for one work week. Ava books straight into it, so a visit drops into
 * its slot moments after a patient says yes. One calendar per practice, shared by every trial; visits
 * are colored by trial, like the trial cards.
 */
export function WeekCalendar({
  initial,
  today,
  trials,
  areas,
}: {
  initial: PracticeCalendar;
  today: string;
  trials: CalendarTrial[];
  areas: Record<string, TherapeuticArea>;
}) {
  const [cal, setCal] = useState(initial);
  const [start, setStart] = useState(initial.start);
  const [openId, setOpenId] = useState<number | null>(null);
  const known = useRef(new Set(initial.slots.filter((s) => s.booked).map((s) => s.slotId)));
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  const load = (week: string, announce: boolean) =>
    fetchJson<PracticeCalendar>(`/api/outreach/calendar?start=${week}`)
      .then((c) => {
        const added = c.slots.filter((s) => s.booked && !known.current.has(s.slotId));
        c.slots.forEach((s) => s.booked && known.current.add(s.slotId));
        if (announce && added.length) {
          setFresh(new Set(added.map((s) => s.slotId)));
          const s = added[0];
          setToast(
            added.length === 1
              ? `Ava just booked ${s.booked!.name} for ${whenLabel(s.startsAt)}`
              : `Ava just booked ${added.length} visits`
          );
        }
        setCal(c);
      })
      .catch(() => {});

  useEffect(() => {
    let live = true;
    const tick = () => live && !document.hidden && load(start, true);
    if (start !== cal.start) load(start, false);
    const id = setInterval(tick, 4000);
    return () => {
      live = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(id);
  }, [toast]);

  // The current-time line: computed on the client only (server and browser clocks differ).
  useEffect(() => {
    const update = () => setNow(nowOffset());
    const first = setTimeout(update, 0);
    const id = setInterval(update, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  // Escape closes an open visit.
  useEffect(() => {
    if (openId === null) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenId(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openId]);

  const days = Array.from({ length: 5 }, (_, i) => addDays(start, i));
  const booked = cal.slots.filter((s) => s.booked);
  const openFuture = cal.slots.filter((s) => !s.booked && s.startsAt.slice(0, 10) > today);
  const isThisWeek = start <= today && today < addDays(start, 7);
  const isNextWeek = !isThisWeek && start > today && start <= addDays(today, 7);
  const shownTrials = trials.filter((t) => booked.some((s) => s.booked!.nctId === t.nctId));
  const styleFor = (nct: string | null) => AREA_STYLES[(nct && areas[nct]) || 'other'];
  const hours = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);
  const year = new Date(`${days[4]}T12:00:00`).getFullYear();
  const thisWeek = calendarStartFor(today);

  const navButton =
    'flex h-9 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

  return (
    <section>
      {/* Toolbar: week, navigation, totals and the trials in view. */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[12.5px] font-medium text-ink-3">{isThisWeek ? 'This week' : isNextWeek ? 'Next week' : year}</div>
          <h2 className="mt-0.5 text-[22px] font-semibold tracking-[-0.02em]">
            {dateLabel(days[0])} – {new Date(`${days[4]}T12:00:00`).getDate()}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-4 text-[12.5px] text-ink-2">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-pass" />
              <span className="font-semibold tabular-nums text-ink">{booked.length}</span> booked
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full border border-dashed border-ink-3" />
              <span className="font-semibold tabular-nums text-ink">{openFuture.length}</span> open
            </span>
          </div>
          <div className="flex items-center rounded-full border border-line bg-surface p-0.5 shadow-[0_1px_2px_rgba(30,36,48,0.04)]">
            <button onClick={() => setStart(addDays(start, -7))} className={cn(navButton, 'w-9')} aria-label="Previous week">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
            <button
              onClick={() => setStart(thisWeek)}
              disabled={start === thisWeek}
              className={cn(navButton, 'px-3.5 text-[12.5px] font-semibold disabled:text-ink-3 disabled:hover:bg-transparent')}
            >
              Today
            </button>
            <button onClick={() => setStart(addDays(start, 7))} className={cn(navButton, 'w-9')} aria-label="Next week">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {shownTrials.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
          {shownTrials.map((t) => (
            <li key={t.nctId} className="flex items-center gap-1.5">
              <span className={cn('size-2.5 rounded-[3px]', styleFor(t.nctId).dot)} />
              {t.title}
            </li>
          ))}
        </ul>
      )}

      {!cal.available ? (
        <p className="mt-4 rounded-2xl border border-line-2 p-6 text-[13px] text-ink-3">Can&rsquo;t load the calendar right now.</p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-line-2 bg-surface shadow-[0_1px_2px_rgba(30,36,48,0.04)]">
          {/* Day headers */}
          <div className="grid grid-cols-[64px_repeat(5,minmax(0,1fr))] border-b border-line-2">
            <div />
            {days.map((d) => {
              const dayBooked = booked.filter((s) => s.startsAt.startsWith(d)).length;
              const dayTotal = cal.slots.filter((s) => s.startsAt.startsWith(d)).length;
              const isToday = d === today;
              return (
                <div key={d} className={cn('flex items-center justify-between gap-2 border-l border-line-2 px-3 py-3', d < today && 'opacity-50')}>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'flex size-8 items-center justify-center rounded-full text-[15px] font-semibold tabular-nums',
                        isToday ? 'bg-ink text-white' : 'text-ink'
                      )}
                    >
                      {new Date(`${d}T12:00:00`).getDate()}
                    </span>
                    <span className={cn('text-[12px] font-semibold uppercase tracking-[0.06em]', isToday ? 'text-ink' : 'text-ink-3')}>
                      {dayLabel(d)}
                    </span>
                  </div>
                  {dayTotal > 0 && (
                    <span className="text-[11.5px] tabular-nums text-ink-3" title={`${dayBooked} of ${dayTotal} visit times booked`}>
                      {dayBooked}/{dayTotal}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Time grid */}
          <div className="relative grid grid-cols-[64px_repeat(5,minmax(0,1fr))]">
            {/* Hour labels, sitting on the hour lines */}
            <div className="relative">
              {hours.map((h) => (
                <div key={h} className="relative h-16">
                  {h > DAY_START && (
                    <span className="absolute -top-2 right-2.5 text-[11px] tabular-nums text-ink-3">{hourLabel(h)}</span>
                  )}
                </div>
              ))}
            </div>

            {days.map((d, col) => {
              const past = d < today;
              const daySlots = cal.slots.filter((s) => s.startsAt.startsWith(d));
              return (
                <div key={d} className={cn('relative border-l border-line-2', past && 'bg-surface-2/50')}>
                  {hours.map((h) => (
                    <div key={h} className="h-16 border-b border-line-2/70 last:border-b-0" />
                  ))}

                  {d === today && now !== null && (
                    <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: now }} aria-hidden>
                      <div className="relative h-px bg-fail">
                        <span className="absolute -left-1 -top-[3.5px] size-2 rounded-full bg-fail" />
                      </div>
                    </div>
                  )}

                  {daySlots.map((s) => {
                    const startMin = minutesOf(s.startsAt);
                    const top = Math.max(0, ((startMin - DAY_START * 60) / 60) * HOUR_PX);
                    const height = Math.max(28, (s.minutes / 60) * HOUR_PX - 4);
                    const b = s.booked;
                    // Position comes from the visit's time, so it's the one inline style.
                    const place = { top: top + 2, height };

                    if (!b) {
                      if (past) return null;
                      return (
                        <div
                          key={s.slotId}
                          style={place}
                          className="absolute inset-x-1.5 flex items-start rounded-xl border border-dashed border-line px-2.5 py-2 text-[11.5px] text-ink-3"
                        >
                          Open · {clockLabel(startMin)} {startMin >= 12 * 60 ? 'PM' : 'AM'}
                        </div>
                      );
                    }

                    const style = styleFor(b.nctId);
                    const viaText = b.bookedBy === 'text';
                    return (
                      <div key={s.slotId} style={place} className="absolute inset-x-1.5">
                        <button
                          onClick={() => setOpenId(openId === s.slotId ? null : s.slotId)}
                          aria-expanded={openId === s.slotId}
                          aria-label={`${b.name}, ${rangeLabel(startMin, s.minutes)}, booked ${viaText ? 'by text' : 'by Ava on a call'}`}
                          className={cn(
                            'group relative isolate flex h-full w-full flex-col overflow-hidden rounded-xl py-2 pl-3.5 pr-2.5 text-left transition-[box-shadow,translate] duration-200 ease-out hover:-translate-y-px hover:shadow-[0_8px_20px_-10px_rgba(30,36,48,0.4)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                            openId === s.slotId && 'shadow-[0_8px_20px_-10px_rgba(30,36,48,0.4)] ring-1 ring-ink/10',
                            past && 'opacity-60',
                            fresh.has(s.slotId) && 'motion-safe:animate-drop-in'
                          )}
                        >
                          <span className={cn('absolute inset-0 -z-10 bg-linear-to-br opacity-35', style.gradient)} />
                          <span className={cn('absolute inset-y-1.5 left-1.5 w-[3px] rounded-full', style.dot)} />
                          <span className="flex items-start justify-between gap-1.5">
                            <span className="truncate text-[12.5px] font-semibold leading-tight">{b.name}</span>
                            {viaText ? (
                              <TextIcon className="mt-px size-3 shrink-0 text-ink-3" />
                            ) : (
                              <PhoneIcon className="mt-px size-3 shrink-0 text-ink-3" />
                            )}
                          </span>
                          <span className="mt-0.5 truncate text-[11.5px] tabular-nums text-ink-2">{rangeLabel(startMin, s.minutes)}</span>
                        </button>
                        {openId === s.slotId && (
                          <VisitPopover
                            slot={s}
                            openSlots={openFuture}
                            alignRight={col >= 3}
                            onClose={() => setOpenId(null)}
                            onChanged={() => load(start, false)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 rounded-2xl border border-line-2 bg-surface px-4 py-3 text-[13px] shadow-[0_16px_40px_-12px_rgba(30,36,48,0.3)] motion-safe:animate-slide-up"
        >
          <span className="grid size-6 place-items-center rounded-full bg-pass text-white">
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          {toast}
        </div>
      )}
    </section>
  );
}

/** Monday of the week containing a YYYY-MM-DD date (weekends roll to the next Monday, like the server). */
function calendarStartFor(iso: string): string {
  const day = new Date(`${iso}T12:00:00`).getDay();
  return addDays(iso, day === 0 ? 1 : day === 6 ? 2 : 1 - day);
}
