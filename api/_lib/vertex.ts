/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Vertex AI Client — Shared client for all API routes           ║
 * ║  Uses @google/genai SDK with Vertex AI mode                    ║
 * ║  Auth: GCP Service Account (base64-encoded in env var)         ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
import { GoogleGenAI, Type } from '@google/genai';

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
    'imagen-3.0-generate-002',       // Imagen 3 — highest quality
    'imagen-3.0-fast-generate-001',  // Imagen 3 — fast
    'gemini-2.0-flash-exp',          // Gemini native image gen (experimental)
  ],
};

// ═══════════════════════════════════════════════════════════════
//  Vertex AI Client Singleton
// ═══════════════════════════════════════════════════════════════

let _ai: GoogleGenAI | null = null;
let _geminiAi: GoogleGenAI | null = null;

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

export function getVertexConfigStatus() {
  const projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GCP_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
  const serviceAccount = process.env.GCP_SERVICE_ACCOUNT;

  return {
    hasProjectId: Boolean(projectId),
    hasServiceAccount: Boolean(serviceAccount),
    location,
    serviceAccountLooksJson: Boolean(serviceAccount?.trim().startsWith('{')),
  };
}

export function getServerGeminiAI(): GoogleGenAI {
  if (_geminiAi) return _geminiAi;

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY fallback environment variable');
  }

  _geminiAi = new GoogleGenAI({ apiKey });
  return _geminiAi;
}

/**
 * Returns a singleton GoogleGenAI instance configured for Vertex AI.
 *
 * Environment variables required:
 *   GCP_PROJECT_ID       — GCP project ID
 *   GCP_LOCATION         — region, e.g. "us-central1" (default)
 *   GCP_SERVICE_ACCOUNT  — base64-encoded service account JSON key
 */
export function getVertexAI(): GoogleGenAI {
  if (_ai) return _ai;

  const projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GCP_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
  const saBase64 = process.env.GCP_SERVICE_ACCOUNT;

  if (!projectId) {
    throw new Error('Missing GCP_PROJECT_ID environment variable. Set it in Vercel Project Settings.');
  }
  if (!saBase64) {
    throw new Error(
      'Missing GCP_SERVICE_ACCOUNT environment variable.\n' +
      'Set it to a base64-encoded GCP service account JSON key.\n' +
      'Encode with: cat service-account.json | base64 (Linux/Mac)\n' +
      'Or: [Convert]::ToBase64String([IO.File]::ReadAllBytes("service-account.json")) (PowerShell)'
    );
  }

  const credentials = parseServiceAccountCredentials(saBase64);

  _ai = new GoogleGenAI({
    vertexai: true,
    project: projectId,
    location,
    googleAuthOptions: {
      credentials,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    },
  });

  console.log(`[VertexAI] Initialized: project=${projectId}, location=${location}`);
  return _ai;
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
  callFn: (model: string, ai: GoogleGenAI) => Promise<T>,
  models: string[],
  maxRetries: number = 2,
): Promise<T> {
  const ai = getVertexAI();
  let lastError: any;
  const tried: string[] = [];

  for (const model of models) {
    let skipModel = false;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[SmartRetry] model="${model}" attempt=${attempt + 1}`);
        const result = await callFn(model, ai);
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
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (apiKey) {
    const geminiAi = getServerGeminiAI();
    for (const model of models) {
      try {
        console.log(`[SmartRetry] Gemini API fallback model="${model}"`);
        return await callFn(model, geminiAi);
      } catch (err: any) {
        lastError = err;
        const msg = err?.message || String(err);
        if (isModelNotFound(msg) || isQuotaError(msg)) continue;
        throw err;
      }
    }
  }

  throw new Error(
    `Vertex AI: ลองแล้ว ${tried.length} ครั้ง ไม่สำเร็จ\n` +
    `Models: ${models.join(', ')}\n` +
    `Error: ${lastError?.message || detail}\n\n` +
    `💡 ตรวจสอบ GCP project, Vertex AI access, region, quotas หรือ set GEMINI_API_KEY เป็น backend fallback`,
  );
}

// Re-export Type for convenience
export { Type };
