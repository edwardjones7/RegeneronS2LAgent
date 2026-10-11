import type { NextApiRequest, NextApiResponse } from 'next';
import { calendarWeekStart, getCalendar } from '@/lib/caller';

/** GET ?start=YYYY-MM-DD: one week of this practice's visit calendar. Emits this practice's own visits only. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const start = typeof req.query.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.start) ? req.query.start : calendarWeekStart();
  return res.status(200).json({ success: true, data: await getCalendar(start, 5) });
}
