import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getEntitlement } from '../_lib/billing';
import { requireFirebaseUser } from '../_lib/firebaseAdmin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const user = await requireFirebaseUser(req);
    return res.status(200).json({ entitlement: await getEntitlement(user.uid) });
  } catch (error: any) {
    return res.status(error?.statusCode || 500).json({ error: error?.message || 'Unable to load billing account' });
  }
}
