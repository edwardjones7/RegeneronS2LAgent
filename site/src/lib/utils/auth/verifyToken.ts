import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '@/lib/utils/envManager';

const supabaseAuth = createClient(
  getEnv('NEXT_PUBLIC_SUPABASE_URL'),
  getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
);

/**
 * Low-level JWT verification via Supabase Auth.
 * Returns the user ID if valid, null otherwise.
 */
export async function verifyToken(token: string): Promise<string | null> {
  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

/**
 * Required auth. Extracts the Bearer token, verifies it, returns userId.
 * Sends 401 and returns null if auth fails.
 */
export async function authenticateRequest(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or invalid authorization header' });
    return null;
  }

  const userId = await verifyToken(authHeader.replace('Bearer ', ''));
  if (!userId) {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
    return null;
  }

  return userId;
}

/**
 * Optional auth. Returns userId if a valid token is present, null otherwise.
 * Does not send any response.
 */
export async function authenticateRequestOptional(
  req: NextApiRequest
): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return verifyToken(authHeader.replace('Bearer ', ''));
}
