import type { PaymentMethod } from './billing';

type OpnCharge = {
  id: string;
  status: 'pending' | 'successful' | 'failed' | 'expired' | string;
  authorize_uri?: string;
  source?: {
    scannable_code?: {
      image?: { download_uri?: string };
      download_uri?: string;
    };
  };
  metadata?: Record<string, unknown>;
};

type CreateChargeInput = {
  method: PaymentMethod;
  amountSatang: number;
  orderId: string;
  uid: string;
  email?: string;
  returnUri: string;
  cardToken?: string;
  mobileNumber?: string;
};

const getSecretKey = () => process.env.OPN_SECRET_KEY || process.env.OMISE_SECRET_KEY || '';
const getPublicKey = () => process.env.OPN_PUBLIC_KEY || process.env.OMISE_PUBLIC_KEY || '';
const getBaseUrl = () => (process.env.OPN_API_BASE_URL || 'https://api.omise.co').replace(/\/$/, '');

const sourceTypeFor: Record<Exclude<PaymentMethod, 'card'>, string> = {
  promptpay: process.env.OPN_PROMPTPAY_SOURCE_TYPE || 'promptpay',
  truemoney: process.env.OPN_TRUEMONEY_SOURCE_TYPE || 'truemoney',
  alipay: process.env.OPN_ALIPAY_SOURCE_TYPE || 'alipay',
};

export function getPaymentConnectorConfig() {
  const hasSecretKey = Boolean(getSecretKey());
  const hasPublicKey = Boolean(getPublicKey());
  return {
    provider: 'opn' as const,
    enabled: {
      promptpay: hasSecretKey,
      truemoney: hasSecretKey,
      alipay: hasSecretKey,
      card: hasSecretKey && hasPublicKey,
    },
    publicKey: hasPublicKey ? getPublicKey() : undefined,
  };
}

function opnAuthorization() {
  const secretKey = getSecretKey();
  if (!secretKey) throw Object.assign(new Error('OPN_SECRET_KEY is not configured.'), { statusCode: 503 });
  return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
}

async function callOpn<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: opnAuthorization(),
      ...(init?.headers || {}),
    },
  });
  const raw = await response.text();
  let parsed: any = null;
  try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = { message: raw }; }

  if (!response.ok) {
    const message = parsed?.message || parsed?.description || `Opn returned HTTP ${response.status}`;
    throw Object.assign(new Error(message), { statusCode: response.status, providerBody: parsed });
  }
  return parsed as T;
}

/**
 * Creates a charge with an Opn source or a tokenized card. Card PAN/CVC values never
 * reach this function; the browser exchanges them with Opn and only sends a token here.
 */
export async function createOpnCharge(input: CreateChargeInput): Promise<OpnCharge> {
  const form = new URLSearchParams({
    amount: String(input.amountSatang),
    currency: 'THB',
    description: 'PicSeller plan purchase',
    return_uri: input.returnUri,
    'metadata[orderId]': input.orderId,
    'metadata[userId]': input.uid,
  });

  if (input.email) form.set('metadata[email]', input.email);

  if (input.method === 'card') {
    if (!input.cardToken) throw Object.assign(new Error('A tokenized card is required.'), { statusCode: 400 });
    form.set('card', input.cardToken);
  } else {
    form.set('source[type]', sourceTypeFor[input.method]);
    if (input.method === 'truemoney' && input.mobileNumber) {
      form.set('source[phone_number]', input.mobileNumber);
    }
  }

  return callOpn<OpnCharge>('/charges', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
}

export async function retrieveOpnCharge(chargeId: string): Promise<OpnCharge> {
  if (!/^chrg_[A-Za-z0-9]+$/.test(chargeId)) {
    throw Object.assign(new Error('Invalid provider charge id.'), { statusCode: 400 });
  }
  return callOpn<OpnCharge>(`/charges/${encodeURIComponent(chargeId)}`);
}

export function getCheckoutAction(charge: OpnCharge) {
  const qrImageUrl = charge.source?.scannable_code?.image?.download_uri || charge.source?.scannable_code?.download_uri;
  if (qrImageUrl) return { kind: 'qr' as const, qrImageUrl };
  if (charge.authorize_uri) return { kind: 'redirect' as const, authorizeUri: charge.authorize_uri };
  return { kind: 'pending' as const };
}
