import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchRecording, getOutreachOverview } from '@/lib/caller';

/** GET: a call recording for one of this practice's patients ("Listen to the call"). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();
  const id = Number(req.query.id);
  const callId = Number(req.query.callId);
  if (!Number.isInteger(id) || !Number.isInteger(callId)) return res.status(400).end();
  const overview = await getOutreachOverview();
  if (!overview.patients.some((p) => p.id === id)) return res.status(404).end();
  const audio = await fetchRecording(id, callId);
  if (!audio) return res.status(404).end();
  res.setHeader('Content-Type', audio.headers.get('content-type') ?? 'audio/mpeg');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.status(200).send(Buffer.from(await audio.arrayBuffer()));
}
