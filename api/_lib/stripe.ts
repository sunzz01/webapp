import Stripe from 'stripe';

function stripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY || '';
  if (!secretKey) {
    const error: any = new Error('Stripe ยังไม่ได้ตั้งค่า STRIPE_SECRET_KEY');
    error.statusCode = 503;
    throw error;
  }
  return new Stripe(secretKey);
}

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export async function createStripeCheckoutSession(input: {
  orderId: string;
  uid: string;
  email?: string;
  planName: string;
  intervalLabel: string;
  amountSatang: number;
  successUrl: string;
  cancelUrl: string;
}) {
  return stripeClient().checkout.sessions.create({
    mode: 'payment',
    customer_email: input.email || undefined,
    client_reference_id: input.orderId,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    payment_method_types: ['card'],
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'thb',
        unit_amount: input.amountSatang,
        product_data: { name: `PicSeller ${input.planName} (${input.intervalLabel})` },
      },
    }],
    metadata: { orderId: input.orderId, uid: input.uid },
  });
}

export async function retrieveStripeCheckoutSession(sessionId: string) {
  return stripeClient().checkout.sessions.retrieve(sessionId);
}

export function constructStripeEvent(payload: Buffer, signature: string) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
  if (!secret) {
    const error: any = new Error('Stripe ยังไม่ได้ตั้งค่า STRIPE_WEBHOOK_SECRET');
    error.statusCode = 503;
    throw error;
  }
  return stripeClient().webhooks.constructEvent(payload, signature, secret);
}
