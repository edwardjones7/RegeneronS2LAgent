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
const timeLabel = (hhmm: string) =>
  new Date(`2000-01-01T${hhmm}:00`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(':00', '');
const whenLabel = (local: string) =>
  new Date(local).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export interface CalendarTrial {
  nctId: string;
  title: string;
}

function VisitPopover({
  slot,
  openSlots,
  onClose,
  onChanged,
}: {
  slot: CalendarSlot;
  openSlots: CalendarSlot[];
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
      className="absolute left-0 top-full z-30 mt-1.5 w-72 animate-fade-in rounded-xl border border-line bg-surface p-4 text-left shadow-[0_12px_32px_-8px_rgba(30,36,48,0.25)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold">{b.name}</div>
          <div className="text-[12px] text-ink-3">{whenLabel(slot.startsAt)} · screening visit</div>
        </div>
        <button onClick={onClose} className="text-ink-3 hover:text-ink" aria-label="Close">
          ✕
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

  const days = Array.from({ length: 5 }, (_, i) => addDays(start, i));
  const byCell = new Map<string, CalendarSlot>();
  for (const s of cal.slots) byCell.set(`${s.startsAt.slice(0, 10)} ${s.startsAt.slice(11, 16)}`, s);
  const times = [...new Set(cal.slots.map((s) => s.startsAt.slice(11, 16)))].sort();
  const booked = cal.slots.filter((s) => s.booked);
  const openFuture = cal.slots.filter((s) => !s.booked && s.startsAt.slice(0, 10) > today);
  const isThisWeek = start <= today && today < addDays(start, 7);
  const isNextWeek = !isThisWeek && start > today && start <= addDays(today, 7);
  const shownTrials = trials.filter((t) => booked.some((s) => s.booked!.nctId === t.nctId));
  const styleFor = (nct: string | null) => AREA_STYLES[(nct && areas[nct]) || 'other'];

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 text-[13px]">
          <button onClick={() => setStart(addDays(start, -7))} className="rounded-md px-2 py-1 text-ink-2 hover:bg-surface-2" aria-label="Previous week">
            ‹
          </button>
          <span className="min-w-[132px] text-center font-semibold">
            {isThisWeek ? 'This week' : isNextWeek ? 'Next week' : `${dateLabel(days[0])} – ${dateLabel(days[4])}`}
          </span>
          <button onClick={() => setStart(addDays(start, 7))} className="rounded-md px-2 py-1 text-ink-2 hover:bg-surface-2" aria-label="Next week">
            ›
          </button>
          <span className="ml-2 text-ink-3">
            {booked.length} {booked.length === 1 ? 'visit' : 'visits'} · {openFuture.length} open
          </span>
        </div>
        {shownTrials.length > 0 && (
          <ul className="flex flex-wrap gap-3 text-[12px] text-ink-2">
            {shownTrials.map((t) => (
              <li key={t.nctId} className="flex items-center gap-1.5">
                <span className={cn('size-2.5 rounded-full', styleFor(t.nctId).dot)} />
                {t.title}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!cal.available ? (
        <p className="mt-3 text-[13px] text-ink-3">Can&rsquo;t load the calendar right now.</p>
      ) : (
        <div className="mt-3 rounded-2xl border border-line bg-surface">
          <div className="grid grid-cols-[68px_repeat(5,minmax(0,1fr))] rounded-t-2xl border-b border-line bg-surface-2 text-[12px]">
            <div />
            {days.map((d) => {
              const dayBooked = booked.filter((s) => s.startsAt.startsWith(d)).length;
              const dayTotal = cal.slots.filter((s) => s.startsAt.startsWith(d)).length;
              return (
                <div key={d} className={cn('border-l border-line px-2.5 py-2', d === today && 'bg-accent-weak/60')}>
                  <div className={cn(d === today && 'text-accent')}>
                    <span className="font-semibold">{dayLabel(d)}</span> <span className="text-ink-3">{dateLabel(d)}</span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line" title={`${dayBooked} of ${dayTotal} booked`}>
                    <div className="h-full rounded-full bg-pass transition-[width] duration-500" style={{ width: `${dayTotal ? (dayBooked / dayTotal) * 100 : 0}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          {times.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-ink-3">No visit times this week.</p>
          ) : (
            times.map((t) => (
              <div key={t} className="grid grid-cols-[68px_repeat(5,minmax(0,1fr))] border-b border-line-2 last:border-b-0">
                <div className="px-2.5 py-2.5 text-right text-[11.5px] tabular-nums text-ink-3">{timeLabel(t)}</div>
                {days.map((d) => {
                  const s = byCell.get(`${d} ${t}`);
                  const past = d < today;
                  const b = s?.booked;
                  const style = b ? styleFor(b.nctId) : null;
                  return (
                    <div key={d} className={cn('relative min-h-[60px] border-l border-line-2 p-1', past && 'bg-surface-2/60', d === today && 'bg-accent-weak/25')}>
                      {s && b ? (
                        <>
                          <button
                            onClick={() => setOpenId(openId === s.slotId ? null : s.slotId)}
                            className={cn(
                              'relative isolate block h-full w-full overflow-hidden rounded-lg border border-white/60 px-2 py-1.5 text-left transition-shadow hover:shadow-[0_4px_14px_-6px_rgba(30,36,48,0.35)]',
                              past && 'opacity-60',
                              fresh.has(s.slotId) && 'animate-drop-in'
                            )}
                          >
                            <span className={cn('absolute inset-0 -z-10 bg-linear-to-br opacity-55', style!.gradient)} />
                            <span className="block truncate text-[12px] font-semibold">{b.name}</span>
                            <span className="block truncate text-[11px] text-ink-2">{b.bookedBy === 'text' ? 'booked by text' : 'booked by Ava'}</span>
                          </button>
                          {openId === s.slotId && (
                            <VisitPopover slot={s} openSlots={openFuture} onClose={() => setOpenId(null)} onChanged={() => load(start, false)} />
                          )}
                        </>
                      ) : s && !past ? (
                        <span className="flex h-full items-center rounded-lg border border-dashed border-line px-2 text-[11px] text-ink-3">Open</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}

      {toast && (
        <div role="status" className="fixed bottom-6 right-6 z-40 flex animate-slide-up items-center gap-2.5 rounded-xl border border-pass/30 bg-surface px-4 py-3 text-[13px] shadow-[0_12px_32px_-8px_rgba(30,36,48,0.3)]">
          <span className="grid size-6 place-items-center rounded-full bg-pass-bg text-pass">✓</span>
          {toast}
        </div>
      )}
    </section>
  );
}
