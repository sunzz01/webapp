import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BillingInterval, findPricingPlan, getPlanPrice, PlanId } from '../../pricing';
import { attachChargeToOrder, createPendingOrder, markOrderAsFailed, PaymentMethod } from '../_lib/billing';
import { requireFirebaseUser } from '../_lib/firebaseAdmin';
import { createOpnCharge, getCheckoutAction, getPaymentConnectorConfig } from '../_lib/opn';
import { createStripeCheckoutSession, isStripeConfigured } from '../_lib/stripe';

function getReturnUri(req: VercelRequest, orderId: string) {
  const configured = (process.env.PAYMENT_RETURN_URL || '').replace(/\/$/, '');
  if (configured) return `${configured}?payment=return&order=${encodeURIComponent(orderId)}`;

  const host = Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host;
  const forwarded = Array.isArray(req.headers['x-forwarded-proto']) ? req.headers['x-forwarded-proto'][0] : req.headers['x-forwarded-proto'];
  const protocol = forwarded || (host?.includes('localhost') ? 'http' : 'https');
  return `${protocol}://${host || 'webapp-bice-gamma-40.vercel.app'}/?payment=return&order=${encodeURIComponent(orderId)}`;
}

function isPlanId(value: unknown): value is PlanId {
  return value === 'starter' || value === 'pro' || value === 'business';
}

function isInterval(value: unknown): value is BillingInterval {
  return value === 'monthly' || value === 'yearly';
}

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return value === 'promptpay' || value === 'truemoney' || value === 'card' || value === 'alipay' || value === 'stripe';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await requireFirebaseUser(req);
    const { planId, interval, paymentMethod, cardToken, mobileNumber } = req.body || {};

    if (!isPlanId(planId) || !isInterval(interval) || !isPaymentMethod(paymentMethod)) {
      return res.status(400).json({ error: 'ข้อมูลแพ็กเกจหรือช่องทางชำระเงินไม่ถูกต้อง' });
    }

    const connector = getPaymentConnectorConfig();
    const isStripe = paymentMethod === 'stripe';
    const enabled = isStripe ? isStripeConfigured() : connector.enabled[paymentMethod];
    if (!enabled) {
      return res.status(503).json({
        code: 'PAYMENT_NOT_CONFIGURED',
        error: isStripe
          ? 'Stripe Checkout ยังไม่ได้ตั้งค่า STRIPE_SECRET_KEY'
          : paymentMethod === 'card'
          ? 'บัตรเครดิตยังไม่ได้เชื่อม public key ของผู้ให้บริการรับชำระเงิน'
          : 'ช่องทางนี้ยังไม่ได้เปิดใช้งาน merchant account',
      });
    }

    if (paymentMethod === 'card' && (typeof cardToken !== 'string' || !cardToken.startsWith('tokn_'))) {
      return res.status(400).json({ error: 'ไม่พบ token ของบัตร กรุณากรอกข้อมูลบัตรผ่านหน้ารับชำระเงินอีกครั้ง' });
    }
    if (paymentMethod === 'truemoney' && (typeof mobileNumber !== 'string' || !/^[+0-9\-\s]{8,22}$/.test(mobileNumber))) {
      return res.status(400).json({ error: 'กรุณากรอกหมายเลขโทรศัพท์สำหรับ TrueMoney Wallet' });
    }

    const plan = findPricingPlan(planId)!;
    const amount = getPlanPrice(plan, interval);
    const orderId = await createPendingOrder({
      uid: user.uid,
      email: user.email,
      planId,
      interval,
      method: paymentMethod,
      amount,
      provider: isStripe ? 'stripe' : 'opn',
    });

    try {
      if (isStripe) {
        const returnUri = getReturnUri(req, orderId);
        const session = await createStripeCheckoutSession({
          orderId,
          uid: user.uid,
          email: user.email,
          planName: plan.name,
          intervalLabel: interval === 'yearly' ? 'รายปี' : 'รายเดือน',
          amountSatang: amount * 100,
          successUrl: `${returnUri}&stripe_session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${returnUri}&payment=cancelled`,
        });
        if (!session.url) throw new Error('Stripe ไม่ได้ส่งลิงก์ checkout กลับมา');
        await attachChargeToOrder(orderId, session.id);
        return res.status(200).json({ orderId, status: session.status || 'pending', checkout: { kind: 'redirect', authorizeUri: session.url } });
      }
      const charge = await createOpnCharge({
        method: paymentMethod as Exclude<PaymentMethod, 'stripe'>,
        amountSatang: amount * 100,
        orderId,
        uid: user.uid,
        email: user.email,
        returnUri: getReturnUri(req, orderId),
        cardToken: paymentMethod === 'card' ? cardToken : undefined,
        mobileNumber: paymentMethod === 'truemoney' ? mobileNumber : undefined,
      });
      await attachChargeToOrder(orderId, charge.id);

      return res.status(200).json({
        orderId,
        status: charge.status,
        checkout: getCheckoutAction(charge),
      });
    } catch (error: any) {
      await markOrderAsFailed(orderId, error?.message);
      throw error;
    }
  } catch (error: any) {
    return res.status(error?.statusCode || 500).json({ error: error?.message || 'ไม่สามารถเริ่มการชำระเงินได้' });
  }
}
