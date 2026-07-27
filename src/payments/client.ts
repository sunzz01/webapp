import { BillingInterval, PlanId } from '../../pricing';
import { auth } from '../firebase';

export type PaymentMethod = 'promptpay' | 'truemoney' | 'card' | 'alipay';

export type PaymentConfig = {
  connector: 'opn';
  enabled: Record<PaymentMethod, boolean>;
  publicKey?: string;
  message?: string;
};

export type CheckoutResponse = {
  orderId: string;
  status: string;
  checkout: {
    kind: 'qr' | 'redirect' | 'pending';
    qrImageUrl?: string;
    authorizeUri?: string;
  };
};

export type BillingStatus = {
  order: { id: string; status: 'pending' | 'successful' | 'failed' | 'expired'; amount: number } | null;
  entitlement: { tier: 'free' | 'starter' | 'pro' | 'enterprise'; credits: number; activeUntil?: string };
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('กรุณาเข้าสู่ระบบก่อนดำเนินการชำระเงิน');

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const raw = await response.text();
  let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: raw }; }
  if (!response.ok) throw Object.assign(new Error(data?.error || `Payment request failed (${response.status})`), { code: data?.code, status: response.status });
  return data as T;
}

export function getPaymentConfig() {
  return request<PaymentConfig>('/api/payments/config');
}

export function createCheckout(input: {
  planId: PlanId;
  interval: BillingInterval;
  paymentMethod: PaymentMethod;
  cardToken?: string;
  mobileNumber?: string;
}) {
  return request<CheckoutResponse>('/api/payments/create', { method: 'POST', body: JSON.stringify(input) });
}

export function getBillingStatus(orderId: string) {
  return request<BillingStatus>(`/api/payments/status?orderId=${encodeURIComponent(orderId)}`);
}

type CardInput = {
  name: string;
  number: string;
  expirationMonth: string;
  expirationYear: string;
  securityCode: string;
};

declare global {
  interface Window {
    Omise?: {
      setPublicKey: (key: string) => void;
      createToken: (type: 'card', payload: Record<string, string | number>, callback: (status: number, response: { id?: string; message?: string }) => void) => void;
    };
  }
}

let omiseLoader: Promise<void> | undefined;

function loadOmiseScript() {
  if (window.Omise) return Promise.resolve();
  if (omiseLoader) return omiseLoader;
  omiseLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.omise.co/omise.js';
    script.async = true;
    script.onload = () => window.Omise ? resolve() : reject(new Error('ไม่สามารถเริ่มระบบรับบัตรได้'));
    script.onerror = () => reject(new Error('ไม่สามารถโหลดระบบรับบัตรได้ กรุณาลองใหม่'));
    document.head.appendChild(script);
  });
  return omiseLoader;
}

/** Card details are tokenized in the browser by Opn; this app receives only a token. */
export async function tokenizeOpnCard(publicKey: string, card: CardInput): Promise<string> {
  await loadOmiseScript();
  if (!window.Omise) throw new Error('ระบบรับบัตรยังไม่พร้อมใช้งาน');

  return new Promise((resolve, reject) => {
    window.Omise!.setPublicKey(publicKey);
    window.Omise!.createToken('card', {
      name: card.name.trim(),
      number: card.number.replace(/\s|-/g, ''),
      expiration_month: Number(card.expirationMonth),
      expiration_year: Number(card.expirationYear),
      security_code: card.securityCode,
    }, (status, response) => {
      if (status >= 200 && status < 300 && response.id) return resolve(response.id);
      reject(new Error(response.message || 'ไม่สามารถตรวจสอบบัตรได้ กรุณาตรวจสอบข้อมูลอีกครั้ง'));
    });
  });
}
