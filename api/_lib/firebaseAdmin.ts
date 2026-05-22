import type { VercelRequest } from '@vercel/node';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

type FirebaseServiceAccount = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

function parseList(value?: string) {
  return (value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function parseServiceAccount(value: string): FirebaseServiceAccount {
  const trimmed = value.trim();
  const jsonText = trimmed.startsWith('{')
    ? trimmed
    : Buffer.from(trimmed, 'base64').toString('utf8');

  const credentials = JSON.parse(jsonText) as FirebaseServiceAccount;
  if (!credentials.project_id || !credentials.client_email || !credentials.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT must include project_id, client_email, and private_key');
  }
  return credentials;
}

function ensureFirebaseAdmin() {
  if (getApps().length > 0) return;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT environment variable.');
  }

  initializeApp({
    credential: cert(parseServiceAccount(raw) as any),
  });
}

function getBearerToken(req: VercelRequest) {
  const authHeader = req.headers.authorization || '';
  const value = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  return value.startsWith('Bearer ') ? value.slice('Bearer '.length).trim() : '';
}

function assertUserAllowed(email?: string) {
  const normalizedEmail = (email || '').toLowerCase();
  const allowedEmails = parseList(process.env.FIREBASE_ALLOWED_EMAILS);
  const allowedDomains = parseList(process.env.FIREBASE_ALLOWED_DOMAINS);

  if (!allowedEmails.length && !allowedDomains.length) return;

  const domain = normalizedEmail.split('@')[1] || '';
  if (allowedEmails.includes(normalizedEmail)) return;
  if (domain && allowedDomains.includes(domain)) return;

  throw Object.assign(new Error('This account is not allowed to use PicSeller.'), { statusCode: 403 });
}

export async function requireFirebaseUser(req: VercelRequest) {
  ensureFirebaseAdmin();

  const token = getBearerToken(req);
  if (!token) {
    throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  }

  const decoded = await getAuth().verifyIdToken(token);
  assertUserAllowed(decoded.email);
  return decoded;
}
