import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Activity } from '@/lib/caller';
import { fetchJson } from '@/lib/utils/api';

function ago(iso: string, now: number): string {
  const min = Math.round((now - new Date(iso.endsWith('Z') ? iso : `${iso}Z`).getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

/** What Ava is doing right now, and the latest things that happened. Updates every few seconds. */
export function ActivityFeed({ initial }: { initial: Activity }) {
  const [data, setData] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      fetchJson<Activity>('/api/outreach/activity')
        .then((d) => {
          setData(d);
          setNow(Date.now());
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, []);

  const live = data.onCall.filter((c) => !c.simulated);
  const shown = live.length ? live : data.onCall;
  return (
    <section>
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-3">Live</h2>
      <div className="mt-3 rounded-xl border border-line bg-surface-2/60 px-3.5 py-3">
        {shown.length === 0 ? (
          <p className="text-[13px] text-ink-3">Ava isn&rsquo;t on a call right now.</p>
        ) : (
          <p className="flex items-center gap-2 text-[13px]">
            <span className="relative flex size-2.5 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-50" />
              <span className="relative inline-flex size-2.5 rounded-full bg-accent" />
            </span>
            <span>
              Ava is {shown[0].direction === 'inbound' ? 'taking a call from' : 'talking to'}{' '}
              <span className="font-semibold">{shown[0].name}</span>
              {shown.length > 1 && <span className="text-ink-3"> and {shown.length - 1} more</span>}
            </span>
          </p>
        )}
      </div>
      <ul className="mt-2">
        {data.recent.map((e) => (
          <li key={`${e.at}-${e.leadId}-${e.type}`} className="flex animate-slide-up gap-3 border-b border-line-2 py-2.5 text-[13px] last:border-b-0">
            <span className="min-w-0 flex-1 text-ink-2">
              {e.patientId ? (
                <Link href={`/patients?patient=${encodeURIComponent(e.patientId)}`} className="hover:text-accent">
                  {e.text}
                </Link>
              ) : (
                e.text
              )}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-ink-3">{ago(e.at, now)}</span>
          </li>
        ))}
        {data.recent.length === 0 && <li className="py-2.5 text-[13px] text-ink-3">Nothing yet.</li>}
      </ul>
    </section>
  );
}
