import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applySuccessfulCharge } from '../_lib/billing';
import { retrieveOpnCharge } from '../_lib/opn';

function tokenMatches(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

/**
 * Configure the Opn event URL as /api/payments/webhook?token=<OPN_WEBHOOK_TOKEN>.
 * The charge is fetched from Opn with the secret key before any entitlement is granted,
 * so an incoming JSON body is never treated as proof of payment on its own.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const expectedToken = process.env.OPN_WEBHOOK_TOKEN || '';
  const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
  const headerToken = Array.isArray(req.headers['x-picseller-webhook-token'])
    ? req.headers['x-picseller-webhook-token'][0]
    : req.headers['x-picseller-webhook-token'] || '';
  if (!expectedToken || !tokenMatches(queryToken || headerToken, expectedToken)) {
    return res.status(401).json({ error: 'Unauthorized webhook' });
  }

  try {
    const event = req.body || {};
    if (event.key !== 'charge.complete' || typeof event.data?.id !== 'string') {
      return res.status(200).json({ received: true, ignored: true });
    }

    const charge = await retrieveOpnCharge(event.data.id);
    if (charge.status !== 'successful') {
      return res.status(200).json({ received: true, status: charge.status });
    }

    const result = await applySuccessfulCharge(charge);
    return res.status(200).json({ received: true, status: 'successful', alreadyApplied: result.alreadyApplied });
  } catch (error: any) {
    return res.status(error?.statusCode || 500).json({ error: error?.message || 'Webhook processing failed' });
  }
}
