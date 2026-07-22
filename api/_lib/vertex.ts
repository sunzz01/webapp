/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Vertex AI Client — Shared client for all API routes           ║
 * ║  Uses @google-cloud/vertexai SDK (native Vertex AI)            ║
 * ║  Auth: GCP Service Account (base64-encoded in env var)         ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
import { VertexAI } from '@google-cloud/vertexai';
import type { GenerativeModel } from '@google-cloud/vertexai';
import { GoogleAuth } from 'google-auth-library';

// ═══════════════════════════════════════════════════════════════
//  MODEL REGISTRY — Vertex AI model names
// ═══════════════════════════════════════════════════════════════

export const MODEL_REGISTRY = {
  /** Text models for analysis / structured JSON */
  text: [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
  ],
  /** Image generation models (Vertex AI) */
  image: [
    'gemini-3.1-flash-image-preview', // Nano Banana 2
    'gemini-3-pro-image-preview',     // Nano Banana Pro
    'imagen-4.0-generate-001',
    'imagen-4.0-fast-generate-001',
    'gemini-2.5-flash-image',         // Nano Banana original
    'imagen-3.0-generate-002',       // Imagen 3 — text-to-image fallback
    'imagen-3.0-fast-generate-001',  // Imagen 3 — fast text-to-image fallback
  ],
};

// ═══════════════════════════════════════════════════════════════
//  Vertex AI Client Singleton
// ═══════════════════════════════════════════════════════════════

let _vertexAI: VertexAI | null = null;
const _vertexAIByLocation = new Map<string, VertexAI>();
let _geminiModel: GenerativeModel | null = null;
let _credentials: ServiceAccountCredentials | null = null;

type ServiceAccountCredentials = {
  client_email?: string;
  private_key?: string;
  project_id?: string;
};

function parseServiceAccountCredentials(value: string): ServiceAccountCredentials {
  const trimmed = value.trim();
  const jsonText = trimmed.startsWith('{')
    ? trimmed
    : Buffer.from(trimmed, 'base64').toString('utf-8');

  try {
    const credentials = JSON.parse(jsonText) as ServiceAccountCredentials;
    if (!credentials.client_email || !credentials.private_key) {
      throw new Error('Service account JSON must include client_email and private_key');
    }
    return credentials;
  } catch (error: any) {
    throw new Error(`Invalid GCP_SERVICE_ACCOUNT. Expected base64-encoded service account JSON or raw JSON. ${error.message || ''}`.trim());
  }
}

function getProjectId() {
  return process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
}

/**
 * The deprecated @google-cloud/vertexai SDK does not consistently support the
 * `global` hostname. It can return an HTML page instead of a Vertex JSON error,
 * which then surfaces as `Unexpected token '<'`. Keep the SDK on a regional
 * endpoint; the image REST calls can still use their own explicitly configured
 * locations.
 */
function getVertexSdkLocation(location?: string) {
  return !location || location === 'global' ? 'us-central1' : location;
}

export function getVertexEnvironment() {
  const projectId = getProjectId();
  const location = getVertexSdkLocation(process.env.GCP_LOCATION || process.env.GOOGLE_CLOUD_LOCATION);

  if (!projectId) {
    throw new Error('Missing GCP_PROJECT_ID environment variable. Set it in Vercel Project Settings.');
  }

  return { projectId, location };
}

export function getServiceAccountCredentials() {
  if (_credentials) return _credentials;

  const saBase64 = process.env.GCP_SERVICE_ACCOUNT;
  if (!saBase64) {
    throw new Error(
      'Missing GCP_SERVICE_ACCOUNT environment variable.\n' +
      'Set it to a base64-encoded GCP service account JSON key.\n' +
      'Encode with: cat service-account.json | base64 (Linux/Mac)\n' +
      'Or: [Convert]::ToBase64String([IO.File]::ReadAllBytes("service-account.json")) (PowerShell)'
    );
  }

  _credentials = parseServiceAccountCredentials(saBase64);
  return _credentials;
}

export async function getVertexAccessToken() {
  const auth = new GoogleAuth({
    credentials: getServiceAccountCredentials(),
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) {
    throw new Error('Unable to get Vertex AI access token from service account.');
  }
  return token.token;
}

export function getVertexConfigStatus() {
  const projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  const location = getVertexSdkLocation(process.env.GCP_LOCATION || process.env.GOOGLE_CLOUD_LOCATION);
  const serviceAccount = process.env.GCP_SERVICE_ACCOUNT;

  return {
    hasProjectId: Boolean(projectId),
    hasServiceAccount: Boolean(serviceAccount),
    location,
    serviceAccountLooksJson: Boolean(serviceAccount?.trim().startsWith('{')),
  };
}

/**
 * Returns a singleton VertexAI instance configured for Vertex AI.
 *
 * Environment variables required:
 *   GCP_PROJECT_ID       — GCP project ID
 *   GCP_LOCATION         — region, e.g. "us-central1" (default)
 *   GCP_SERVICE_ACCOUNT  — base64-encoded service account JSON key
 */
export function getVertexAI(): VertexAI {
  if (_vertexAI) return _vertexAI;

  const { projectId, location } = getVertexEnvironment();
  const credentials = getServiceAccountCredentials();

  _vertexAI = new VertexAI({
    project: projectId,
    location,
    googleAuthOptions: {
      credentials,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    },
  });

  console.log(`[VertexAI] Initialized: project=${projectId}, location=${location}`);
  return _vertexAI;
}

export function getVertexAIForLocation(locationOverride: string): VertexAI {
  const { projectId } = getVertexEnvironment();
  const credentials = getServiceAccountCredentials();
  const location = getVertexSdkLocation(locationOverride || getVertexEnvironment().location);
  const cacheKey = `${projectId}:${location}`;

  const cached = _vertexAIByLocation.get(cacheKey);
  if (cached) return cached;

  const vertexAI = new VertexAI({
    project: projectId,
    location,
    googleAuthOptions: {
      credentials,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    },
  });

  _vertexAIByLocation.set(cacheKey, vertexAI);
  console.log(`[VertexAI] Initialized: project=${projectId}, location=${location}`);
  return vertexAI;
}

/**
 * Returns a singleton GenerativeModel instance for text generation.
 */
export function getGenerativeModel(modelName: string = 'gemini-2.5-flash'): GenerativeModel {
  const vertexAI = getVertexAI();
  return vertexAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });
}

// ═══════════════════════════════════════════════════════════════
//  Smart Retry Engine — model fallback on server side
// ═══════════════════════════════════════════════════════════════

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isQuotaError = (m: string) =>
  /429|QUOTA|RESOURCE_EXHAUSTED|Too Many Requests|rate.?limit/i.test(m);
const isModelNotFound = (m: string) =>
  /404|not.?found|NOT_FOUND|does not exist|unsupported model|INVALID_ARGUMENT/i.test(m);
const isRetryable = (m: string) =>
  /503|UNAVAILABLE|high demand|overloaded|INTERNAL|deadline/i.test(m);

/**
 * Smart retry with model fallback.
 * Tries each model in order; retries on 503, skips on 404, throws on others.
 */
export async function smartRetry<T>(
  callFn: (model: string, ai: VertexAI) => Promise<T>,
  models: string[],
  maxRetries: number = 2,
): Promise<T> {
  const vertexAI = getVertexAI();
  let lastError: any;
  const tried: string[] = [];

  for (const model of models) {
    let skipModel = false;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[SmartRetry] model="${model}" attempt=${attempt + 1}`);
        const result = await callFn(model, vertexAI);
        console.log(`[SmartRetry] ✅ Success: model="${model}"`);
        return result;
      } catch (err: any) {
        lastError = err;
        const msg = err?.message || String(err);
        tried.push(model);

        if (isModelNotFound(msg)) {
          console.warn(`[SmartRetry] ❌ Model "${model}" not found, skipping...`);
          skipModel = true;
          break;
        }
        if (isQuotaError(msg)) {
          console.warn(`[SmartRetry] ⚠️ Quota exhausted for "${model}"`);
          break; // → next model
        }
        if (!isRetryable(msg)) throw err;

        console.warn(`[SmartRetry] 🔄 Retry ${attempt + 1}/${maxRetries + 1}`);
        if (attempt < maxRetries) await delay(1000 * (attempt + 1));
      }
    }
    if (skipModel) continue;
  }

  const detail = lastError?.message || 'Unknown error';
  throw new Error(
    `Vertex AI: ลองแล้ว ${tried.length} ครั้ง ไม่สำเร็จ\n` +
    `Models: ${models.join(', ')}\n` +
    `Error: ${lastError?.message || detail}\n\n` +
    `💡 ตรวจสอบ GCP project, Vertex AI access, region, quotas`,
  );
}
