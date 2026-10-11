import type { NextApiRequest, NextApiResponse } from 'next';
import supabase from '@/lib/utils/db/client';

/**
 * Public health check: confirms the server can reach Supabase with the
 * service role key. Emits only an ok/error status, no data.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) throw error;
    return res.status(200).json({ success: true, data: { supabase: 'ok' } });
  } catch (error) {
    console.error('[api/health] Supabase check failed:', error);
    return res.status(503).json({ success: false, error: 'Supabase unreachable' });
  }
}
