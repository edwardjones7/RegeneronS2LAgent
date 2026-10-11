import type { NextApiRequest, NextApiResponse } from 'next';
import { getActivity } from '@/lib/caller';

/** GET: what Ava is doing at this practice right now, and what just happened. This practice only. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  return res.status(200).json({ success: true, data: await getActivity() });
}
