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

  const projectId = process.env.GCP_PROJECT_ID;
  const location = process.env.GCP_LOCATION || 'us-central1';
  const saBase64 = process.env.GCP_SERVICE_ACCOUNT;

  if (!projectId) {
    throw new Error('Missing GCP_PROJECT_ID environment variable');
  }
  if (!saBase64) {
    throw new Error(
      'Missing GCP_SERVICE_ACCOUNT environment variable.\n' +
      'Set it to a base64-encoded GCP service account JSON key.\n' +
      'Encode with: cat service-account.json | base64 (Linux/Mac)\n' +
      'Or: [Convert]::ToBase64String([IO.File]::ReadAllBytes("service-account.json")) (PowerShell)'
    );
  }

  // Decode service account credentials
  const credentials = JSON.parse(
    Buffer.from(saBase64, 'base64').toString('utf-8')
  );

  _ai = new GoogleGenAI({
    vertexai: true,
    project: projectId,
    location,
    googleAuthOptions: {
      credentials,
    },
  } as any);

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
  throw new Error(
    `Vertex AI: ลองแล้ว ${tried.length} ครั้ง ไม่สำเร็จ\n` +
    `Models: ${models.join(', ')}\n` +
    `Error: ${detail}\n\n` +
    `💡 ตรวจสอบ GCP quotas ที่ https://console.cloud.google.com/iam-admin/quotas`,
  );
}

// Re-export Type for convenience
export { Type };
