/**
 * POST /api/generate
 *
 * 2-stage product image pipeline:
 *   1) Gemini 2.5 Flash analyzes product images + legacy direction prompt.
 *   2) Gemini image model (default gemini-3.1-flash-image-preview) generates a new scene
 *      while preserving the product from reference images.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getVertexAIForLocation, getVertexAccessToken, getVertexEnvironment } from './_lib/vertex.js';
import { generateGeminiImage } from './_lib/geminiFallback.js';
import { requireFirebaseUser } from './_lib/firebaseAdmin.js';
import {
  getCategoryHardConstraintsForApi,
  getOrchestratorInstructions,
  isMarketingPlatformStyle,
} from './_lib/imagePromptBuilder.js';

const DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const GEMINI_IMAGE_MODEL_FALLBACKS = [
  DEFAULT_GEMINI_IMAGE_MODEL,
  'gemini-2.5-flash-image',
  'gemini-3-pro-image-preview',
];

const RATIO_DESCRIPTIONS: Record<string, string> = {
  '1:1': 'square format (1:1 aspect ratio)',
  '4:5': 'portrait format (4:5 aspect ratio)',
  '9:16': 'vertical portrait format (9:16 aspect ratio, mobile/story)',
  '16:9': 'landscape widescreen format (16:9 aspect ratio)',
  '3:4': 'portrait format (3:4 aspect ratio)',
};

type InlineImagePart = {
  inlineData: {
    data: string;
    mimeType: string;
  };
};

type OrchestratedPrompt = {
  prompt: string;
  negativePrompt?: string;
  productSummary?: string;
  thaiTextPlan?: string[];
};

type ModelFallbackEvent = {
  model: string;
  success: boolean;
  message?: string;
};

type GeneratedImagePayload = {
  imageUrl: string;
  modelName: string;
  textResponse?: string;
  requestedModel: string;
  fallbackEvents: ModelFallbackEvent[];
};

function buildProductContext(productData: any) {
  if (!productData || typeof productData !== 'object') return '';

  const name = String(productData.name || '').trim();
  const description = String(productData.description || '').trim();
  const features = Array.isArray(productData.features)
    ? productData.features.filter(Boolean).map(String).slice(0, 8)
    : [];

  return [
    'PRODUCT CONTEXT:',
    name ? `- Product name: ${name}` : '',
    description ? `- Description: ${description}` : '',
    features.length ? `- Key features: ${features.join(' | ')}` : '',
  ].filter(Boolean).join('\n');
}

function parseSourceImages(images?: string[]): InlineImagePart[] {
  const imageParts: InlineImagePart[] = [];
  if (!images?.length) return imageParts;

  for (const img of images.slice(0, 3)) {
    if (!img || !img.includes('base64')) continue;

    const parts = img.split(',');
    const mimePart = parts[0];
    const dataPart = parts[1] || parts[0];
    const mimeType = mimePart.match(/:(.*?);/)?.[1] || 'image/png';

    imageParts.push({
      inlineData: {
        data: dataPart,
        mimeType,
      },
    });
  }

  return imageParts;
}

function extractVertexText(response: any) {
  return response?.response?.candidates?.[0]?.content?.parts
    ?.map((part: any) => part.text || '')
    .join('')
    .trim() || '';
}

function parseJsonObject(text: string): any {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const jsonText = start >= 0 && end >= start ? cleaned.slice(start, end + 1) : cleaned;
  try {
    return JSON.parse(jsonText);
  } catch {
    throw new Error('Prompt orchestrator returned invalid JSON.');
  }
}

function getOrchestratorLocations() {
  const primary = process.env.GCP_ORCHESTRATOR_LOCATION || process.env.GCP_IMAGE_LOCATION || 'global';
  const fallback = process.env.GCP_LOCATION || 'us-central1';
  return [...new Set([primary, fallback])];
}

function getImageGenLocation() {
  return process.env.GCP_IMAGE_LOCATION || process.env.GCP_ORCHESTRATOR_LOCATION || 'global';
}

function getVertexApiHost(location: string) {
  return location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
}

function isImagen4TextModel(model?: string) {
  return model === 'imagen-4.0-generate-001' || model === 'imagen-4.0-fast-generate-001';
}

function normalizeImageModel(requested?: string) {
  if (!requested || requested === 'product-recontext-v1') {
    return process.env.GCP_DEFAULT_IMAGE_MODEL || DEFAULT_GEMINI_IMAGE_MODEL;
  }
  return requested;
}

function resolveGeminiImageModelChain(requested?: string) {
  const normalized = normalizeImageModel(requested);
  const chain: string[] = [];
  if (!isImagen4TextModel(normalized) && !normalized.startsWith('imagen-product-recontext')) {
    chain.push(normalized);
  }
  for (const model of GEMINI_IMAGE_MODEL_FALLBACKS) {
    if (!chain.includes(model)) chain.push(model);
  }
  return chain;
}

function shortenErrorMessage(message: string, max = 100) {
  return message.replace(/\s+/g, ' ').trim().slice(0, max);
}

function buildFallbackNotice(
  requestedModel: string,
  events: ModelFallbackEvent[],
  finalModel: string,
) {
  const failed = events.filter((event) => !event.success);
  if (failed.length === 0 && finalModel === requestedModel) return undefined;

  const lines: string[] = [];
  for (const event of failed) {
    const detail = event.message ? ` (${event.message})` : '';
    lines.push(`• ${event.model} ใช้ไม่ได้${detail}`);
  }
  if (finalModel !== requestedModel) {
    lines.push(`กำลังใช้ ${finalModel} แทน`);
  }
  return lines.join('\n');
}

function extractImageFromGenerateContentPayload(payload: any) {
  const parts = payload?.candidates?.[0]?.content?.parts
    || payload?.response?.candidates?.[0]?.content?.parts
    || [];

  let imageUrl = '';
  let text = '';

  for (const part of parts) {
    const inline = part?.inlineData || part?.inline_data;
    if (inline?.data) {
      const mimeType = inline.mimeType || inline.mime_type || 'image/png';
      imageUrl = `data:${mimeType};base64,${inline.data}`;
    }
    if (part?.text) text += part.text;
  }

  return { imageUrl, text: text.trim() };
}

async function orchestratePromptAtLocation(
  location: string,
  args: {
    productContext: string;
    legacyPrompt: string;
    ratioDesc: string;
    aspectRatio: string;
    category?: string;
    style?: string;
    imageParts: InlineImagePart[];
  },
): Promise<OrchestratedPrompt> {
  const vertexAI = getVertexAIForLocation(location);
  const model = vertexAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const instruction = getOrchestratorInstructions({
    category: args.category,
    style: args.style,
    aspectRatio: args.aspectRatio,
    ratioDesc: args.ratioDesc,
    productContext: args.productContext,
    legacyPrompt: args.legacyPrompt,
  });

  const response = await model.generateContent({
    contents: [{ role: 'user', parts: [...args.imageParts, { text: instruction }] }],
  });

  const parsed = parseJsonObject(extractVertexText(response));
  if (!parsed.prompt || typeof parsed.prompt !== 'string') {
    throw new Error('Prompt orchestrator did not return a valid prompt.');
  }

  return {
    prompt: parsed.prompt,
    negativePrompt: parsed.negativePrompt,
    productSummary: parsed.productSummary,
    thaiTextPlan: Array.isArray(parsed.thaiTextPlan) ? parsed.thaiTextPlan.map(String) : [],
  };
}

async function orchestratePrompt(args: {
  productContext: string;
  legacyPrompt: string;
  ratioDesc: string;
  aspectRatio: string;
  category?: string;
  style?: string;
  imageParts: InlineImagePart[];
}): Promise<OrchestratedPrompt> {
  let lastError: any;
  for (const location of getOrchestratorLocations()) {
    try {
      return await orchestratePromptAtLocation(location, args);
    } catch (error) {
      lastError = error;
      console.warn(`[orchestratePrompt] location=${location} failed:`, (error as Error)?.message || error);
    }
  }
  throw lastError || new Error('Prompt orchestrator failed on all configured regions.');
}

async function generateGeminiReferenceImage(args: {
  prompt: string;
  imageParts: InlineImagePart[];
  aspectRatio: string;
  modelName: string;
  negativePrompt?: string;
  style?: string;
  category?: string;
}) {
  const { projectId } = getVertexEnvironment();
  const location = getImageGenLocation();
  const accessToken = await getVertexAccessToken();
  const host = getVertexApiHost(location);
  const endpoint = `https://${host}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${args.modelName}:generateContent`;

  const ratioDesc = RATIO_DESCRIPTIONS[args.aspectRatio] || RATIO_DESCRIPTIONS['1:1'];
  const marketing = isMarketingPlatformStyle(args.style);
  const categoryLock = getCategoryHardConstraintsForApi(args.category);
  const promptSections = [
    args.prompt,
    categoryLock,
    `Generate this ecommerce product image in ${args.aspectRatio} (${ratioDesc}).`,
    args.category ? `Image category for this request: ${args.category}.` : '',
    marketing
      ? 'Create a NEW composition from the reference product matching the category above. Do NOT output a near-duplicate of the reference photo. Do NOT default non-COVER categories to a main listing cover layout.'
      : 'Preserve product identity. Refine scene and lighting with minimal promotional elements.',
  ];
  if (args.negativePrompt) {
    promptSections.push(`Avoid: ${args.negativePrompt}`);
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [...args.imageParts, { text: promptSections.join('\n\n') }],
      }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || response.statusText || 'Gemini image generation failed';
    throw new Error(`${args.modelName}: ${message}`);
  }

  const extracted = extractImageFromGenerateContentPayload(payload);
  if (!extracted.imageUrl) {
    throw new Error(`${args.modelName}: no image data returned`);
  }

  return {
    imageUrl: extracted.imageUrl,
    modelName: args.modelName,
    textResponse: extracted.text || undefined,
  };
}

async function generateGeminiReferenceImageWithFallbacks(args: {
  prompt: string;
  imageParts: InlineImagePart[];
  aspectRatio: string;
  negativePrompt?: string;
  modelChain: string[];
  style?: string;
  category?: string;
}): Promise<GeneratedImagePayload> {
  const requestedModel = args.modelChain[0] || DEFAULT_GEMINI_IMAGE_MODEL;
  const fallbackEvents: ModelFallbackEvent[] = [];
  let lastError: any;

  for (const modelName of args.modelChain) {
    try {
      const result = await generateGeminiReferenceImage({
        prompt: args.prompt,
        imageParts: args.imageParts,
        aspectRatio: args.aspectRatio,
        negativePrompt: args.negativePrompt,
        modelName,
        style: args.style,
        category: args.category,
      });

      if (fallbackEvents.length > 0 || modelName !== requestedModel) {
        fallbackEvents.push({ model: modelName, success: true });
      }

      return {
        imageUrl: result.imageUrl,
        modelName: result.modelName,
        textResponse: result.textResponse,
        requestedModel,
        fallbackEvents,
      };
    } catch (error) {
      lastError = error;
      const message = (error as Error)?.message || String(error);
      fallbackEvents.push({
        model: modelName,
        success: false,
        message: shortenErrorMessage(message),
      });
      console.warn(`[generate] Vertex image model="${modelName}" failed:`, message);
    }
  }

  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    try {
      const ratioDesc = RATIO_DESCRIPTIONS[args.aspectRatio] || RATIO_DESCRIPTIONS['1:1'];
      const categoryLock = getCategoryHardConstraintsForApi(args.category);
      const fallbackPrompt = [
        args.prompt,
        categoryLock,
        `Aspect ratio: ${args.aspectRatio} (${ratioDesc}).`,
        args.category ? `Image category: ${args.category}.` : '',
        args.negativePrompt ? `Avoid: ${args.negativePrompt}` : '',
      ].filter(Boolean).join('\n\n');

      const fallback = await generateGeminiImage(fallbackPrompt, args.imageParts, args.aspectRatio);
      const apiModelName = `${fallback.model} (Gemini API fallback)`;
      fallbackEvents.push({ model: apiModelName, success: true });

      return {
        imageUrl: fallback.imageUrl,
        modelName: apiModelName,
        textResponse: fallback.text || undefined,
        requestedModel,
        fallbackEvents,
      };
    } catch (error) {
      lastError = error;
      console.warn('[generate] Gemini API fallback failed:', (error as Error)?.message || error);
    }
  }

  throw lastError || new Error('All image generation models failed.');
}

async function generateImagen4TextImage(args: {
  modelName: string;
  prompt: string;
  aspectRatio: string;
}) {
  const { projectId } = getVertexEnvironment();
  const location = process.env.GCP_IMAGEN4_LOCATION || process.env.GCP_RECONTEXT_LOCATION || process.env.GCP_LOCATION || 'us-central1';
  const accessToken = await getVertexAccessToken();
  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${args.modelName}:predict`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instances: [{ prompt: args.prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: args.aspectRatio,
        addWatermark: true,
        enhancePrompt: true,
        personGeneration: 'allow_adult',
        safetySetting: 'block_few',
        outputOptions: {
          mimeType: 'image/png',
          compressionQuality: 90,
        },
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || response.statusText || 'Imagen 4 request failed';
    throw new Error(`${args.modelName}: ${message}`);
  }

  const prediction = payload?.predictions?.[0];
  const base64 = prediction?.bytesBase64Encoded || prediction?.image?.bytesBase64Encoded;
  const mimeType = prediction?.mimeType || prediction?.image?.mimeType || 'image/png';

  if (!base64) {
    throw new Error(`${args.modelName}: no image data returned`);
  }

  return {
    imageUrl: `data:${mimeType};base64,${base64}`,
    modelName: args.modelName,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const firebaseUser = await requireFirebaseUser(req);

    const {
      prompt,
      images,
      aspectRatio = '1:1',
      customPrompt,
      category,
      style,
      productData,
      model,
    } = req.body;

    if (!prompt && !customPrompt) {
      return res.status(400).json({ error: 'Provide prompt or customPrompt' });
    }

    const imageParts = parseSourceImages(images);
    if (imageParts.length === 0) {
      return res.status(400).json({
        error: 'Product Recontext pipeline requires at least one source product image.',
      });
    }

    const ratioDesc = RATIO_DESCRIPTIONS[aspectRatio] || RATIO_DESCRIPTIONS['1:1'];
    const productContext = buildProductContext(productData);
    const legacyPrompt = [productContext, prompt || customPrompt].filter(Boolean).join('\n\n');

    const orchestrated = await orchestratePrompt({
      productContext,
      legacyPrompt,
      ratioDesc,
      aspectRatio,
      category,
      style,
      imageParts,
    });

    const selectedModel = typeof model === 'string' ? model : DEFAULT_GEMINI_IMAGE_MODEL;
    const requestedModel = normalizeImageModel(selectedModel);
    const generated = isImagen4TextModel(selectedModel)
      ? {
          ...(await generateImagen4TextImage({
            modelName: selectedModel,
            prompt: orchestrated.prompt,
            aspectRatio,
          })),
          requestedModel,
          fallbackEvents: [] as ModelFallbackEvent[],
        }
      : await generateGeminiReferenceImageWithFallbacks({
          prompt: orchestrated.prompt,
          imageParts,
          aspectRatio,
          negativePrompt: orchestrated.negativePrompt,
          modelChain: resolveGeminiImageModelChain(selectedModel),
          style,
          category: typeof category === 'string' ? category : undefined,
        });

    const fallbackNotice = buildFallbackNotice(
      requestedModel,
      generated.fallbackEvents,
      generated.modelName,
    );

    console.log('[usage] image_generation_success', {
      status: 200,
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      pipeline: isImagen4TextModel(selectedModel)
        ? 'gemini-2.5-flash->imagen-4'
        : `gemini-2.5-flash->${generated.modelName}`,
      orchestratorModel: 'gemini-2.5-flash',
      imageModel: generated.modelName,
      category,
      hadModelFallback: Boolean(fallbackNotice),
    });

    return res.status(200).json({
      imageUrl: generated.imageUrl,
      promptUsed: orchestrated.prompt,
      model: `gemini-2.5-flash -> ${generated.modelName}`,
      textResponse: generated.textResponse || orchestrated.productSummary || undefined,
      thaiTextPlan: orchestrated.thaiTextPlan,
      requestedModel,
      fallbackEvents: generated.fallbackEvents,
      fallbackNotice,
    });
  } catch (error: any) {
    console.error('[api/generate] Error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
  }
}
