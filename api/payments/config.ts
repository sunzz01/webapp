import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireFirebaseUser } from '../_lib/firebaseAdmin';
import { getPaymentConnectorConfig } from '../_lib/opn';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await requireFirebaseUser(req);
    const connector = getPaymentConnectorConfig();
    return res.status(200).json({
      connector: connector.provider,
      enabled: connector.enabled,
      publicKey: connector.publicKey,
      message: Object.values(connector.enabled).some(Boolean)
        ? undefined
        : 'ระบบรับชำระเงินกำลังตั้งค่า merchant account อยู่',
    });
  } catch (error: any) {
    return res.status(error?.statusCode || 500).json({ error: error?.message || 'Unable to load payment settings' });
  }
}
