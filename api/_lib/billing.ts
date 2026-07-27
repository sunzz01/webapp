import { getFirestore } from 'firebase-admin/firestore';
import { BillingInterval, findPricingPlan, PlanId, SubscriptionTier } from '../../pricing';
import { getFirebaseAdminApp } from './firebaseAdmin';

export type PaymentMethod = 'promptpay' | 'truemoney' | 'card' | 'alipay';
export type BillingOrderStatus = 'pending' | 'successful' | 'failed' | 'expired';

export type BillingEntitlement = {
  tier: 'free' | SubscriptionTier;
  credits: number;
  activeUntil?: string;
  updatedAt?: string;
};

type PendingOrderInput = {
  uid: string;
  email?: string;
  planId: PlanId;
  interval: BillingInterval;
  method: PaymentMethod;
  amount: number;
};

const DEFAULT_ENTITLEMENT: BillingEntitlement = { tier: 'free', credits: 10 };

function db() {
  return getFirestore(getFirebaseAdminApp());
}

function addBillingPeriod(interval: BillingInterval, base: Date) {
  const next = new Date(base);
  next.setMonth(next.getMonth() + (interval === 'yearly' ? 12 : 1));
  return next;
}

export async function createPendingOrder(input: PendingOrderInput) {
  const reference = db().collection('billingOrders').doc();
  const now = new Date();

  await reference.set({
    id: reference.id,
    uid: input.uid,
    email: input.email || null,
    planId: input.planId,
    interval: input.interval,
    method: input.method,
    amount: input.amount,
    currency: 'THB',
    status: 'pending' satisfies BillingOrderStatus,
    provider: 'opn',
    providerChargeId: null,
    createdAt: now,
    updatedAt: now,
  });

  return reference.id;
}

export async function attachChargeToOrder(orderId: string, chargeId: string) {
  await db().collection('billingOrders').doc(orderId).set({
    providerChargeId: chargeId,
    updatedAt: new Date(),
  }, { merge: true });
}

export async function markOrderAsFailed(orderId: string, message?: string) {
  await db().collection('billingOrders').doc(orderId).set({
    status: 'failed' satisfies BillingOrderStatus,
    failureMessage: message || null,
    updatedAt: new Date(),
  }, { merge: true });
}

export async function getEntitlement(uid: string): Promise<BillingEntitlement> {
  const snapshot = await db().collection('billingEntitlements').doc(uid).get();
  if (!snapshot.exists) return DEFAULT_ENTITLEMENT;
  const data = snapshot.data() || {};

  return {
    tier: data.tier === 'starter' || data.tier === 'pro' || data.tier === 'enterprise' ? data.tier : 'free',
    credits: typeof data.credits === 'number' ? data.credits : DEFAULT_ENTITLEMENT.credits,
    activeUntil: data.activeUntil?.toDate ? data.activeUntil.toDate().toISOString() : undefined,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : undefined,
  };
}

/**
 * Idempotently grants a plan after a charge has been verified as successful by Opn.
 * The provider's charge id is stored to prevent duplicate credits from webhook retries.
 */
export async function applySuccessfulCharge(providerCharge: { id: string; metadata?: Record<string, unknown> }) {
  const orderId = typeof providerCharge.metadata?.orderId === 'string'
    ? providerCharge.metadata.orderId
    : typeof providerCharge.metadata?.order_id === 'string'
      ? providerCharge.metadata.order_id
      : '';

  if (!orderId) throw new Error('Successful payment is missing its PicSeller order reference.');

  const orderReference = db().collection('billingOrders').doc(orderId);

  return db().runTransaction(async (transaction) => {
    const orderSnapshot = await transaction.get(orderReference);
    if (!orderSnapshot.exists) throw new Error('Billing order was not found.');

    const order = orderSnapshot.data() || {};
    if (order.providerChargeId && order.providerChargeId !== providerCharge.id) {
      throw new Error('Provider charge does not match the pending billing order.');
    }

    if (order.status === 'successful') {
      return { alreadyApplied: true, uid: order.uid as string };
    }

    const plan = findPricingPlan(order.planId);
    if (!plan || !order.uid || (order.interval !== 'monthly' && order.interval !== 'yearly')) {
      throw new Error('Billing order contains an invalid plan.');
    }

    const entitlementReference = db().collection('billingEntitlements').doc(order.uid);
    const entitlementSnapshot = await transaction.get(entitlementReference);
    const existing = entitlementSnapshot.exists ? entitlementSnapshot.data() || {} : {};
    const now = new Date();
    const existingUntil = existing.activeUntil?.toDate?.();
    const periodBase = existingUntil instanceof Date && existingUntil > now ? existingUntil : now;
    const activeUntil = addBillingPeriod(order.interval as BillingInterval, periodBase);
    const credits = (typeof existing.credits === 'number' ? existing.credits : DEFAULT_ENTITLEMENT.credits) + plan.credits;

    transaction.set(entitlementReference, {
      tier: plan.tier,
      credits,
      activeUntil,
      updatedAt: now,
      lastSuccessfulChargeId: providerCharge.id,
    }, { merge: true });
    transaction.update(orderReference, {
      status: 'successful' satisfies BillingOrderStatus,
      providerChargeId: providerCharge.id,
      paidAt: now,
      updatedAt: now,
    });

    return { alreadyApplied: false, uid: order.uid as string, credits, tier: plan.tier, activeUntil: activeUntil.toISOString() };
  });
}

export async function getOrderForUser(orderId: string, uid: string) {
  const snapshot = await db().collection('billingOrders').doc(orderId).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() || {};
  if (data.uid !== uid) return null;
  return {
    id: snapshot.id,
    status: data.status as BillingOrderStatus,
    providerChargeId: data.providerChargeId || undefined,
    planId: data.planId as PlanId,
    interval: data.interval as BillingInterval,
    method: data.method as PaymentMethod,
    amount: data.amount as number,
  };
}
