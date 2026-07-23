import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applySuccessfulCharge, getEntitlement, getOrderForUser, markOrderAsFailed } from '../_lib/billing';
import { requireFirebaseUser } from '../_lib/firebaseAdmin';
import { retrieveOpnCharge } from '../_lib/opn';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await requireFirebaseUser(req);
    const orderId = typeof req.query.orderId === 'string' ? req.query.orderId : '';
    if (!orderId) return res.status(400).json({ error: 'Missing order id' });

    let order = await getOrderForUser(orderId, user.uid);
    if (!order) return res.status(404).json({ error: 'ไม่พบรายการชำระเงินนี้' });

    if (order.status === 'pending' && order.providerChargeId) {
      const charge = await retrieveOpnCharge(order.providerChargeId);
      if (charge.status === 'successful') {
        await applySuccessfulCharge(charge);
      } else if (charge.status === 'failed' || charge.status === 'expired') {
        await markOrderAsFailed(orderId, charge.status);
      }
      order = await getOrderForUser(orderId, user.uid);
    }

    return res.status(200).json({ order, entitlement: await getEntitlement(user.uid) });
  } catch (error: any) {
    return res.status(error?.statusCode || 500).json({ error: error?.message || 'Unable to check payment status' });
  }
}
