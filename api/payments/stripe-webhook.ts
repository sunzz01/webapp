import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applySuccessfulCharge } from '../_lib/billing';
import { constructStripeEvent } from '../_lib/stripe';

export const config = { api: { bodyParser: false } };

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** Stripe signs the raw request body; credits are granted only for verified paid sessions. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const signature = Array.isArray(req.headers['stripe-signature']) ? req.headers['stripe-signature'][0] : req.headers['stripe-signature'];
  if (!signature) return res.status(400).json({ error: 'Missing Stripe signature' });

  try {
    const event = constructStripeEvent(await readRawBody(req), signature);
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      if (session.payment_status === 'paid') {
        const result = await applySuccessfulCharge({ id: session.id, metadata: session.metadata || undefined });
        return res.status(200).json({ received: true, status: 'successful', alreadyApplied: result.alreadyApplied });
      }
    }
    return res.status(200).json({ received: true, ignored: true });
  } catch (error: any) {
    return res.status(error?.statusCode || 400).json({ error: error?.message || 'Stripe webhook verification failed' });
  }
}
