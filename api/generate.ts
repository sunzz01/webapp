/**
 * POST /api/generate
 *
 * 2-stage product content generation pipeline:
 *   1) Gemini 2.5 Flash analyzes product images + legacy direction prompt.
 *   2) Imagen Product Recontext places the same product into the generated scene.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getVertexAIForLocation, getVertexAccessToken, getVertexEnvironment } from './_lib/vertex.js';
import { requireFirebaseUser } from './_lib/firebaseAdmin.js';

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
  return JSON.parse(jsonText);
}

function getOrchestratorLocation() {
  return process.env.GCP_ORCHESTRATOR_LOCATION || process.env.GCP_IMAGE_LOCATION || 'global';
}

function getRecontextLocation() {
  return process.env.GCP_RECONTEXT_LOCATION || process.env.GCP_LOCATION || 'us-central1';
}

function getRecontextModel() {
  return process.env.IMAGEN_RECONTEXT_MODEL || 'imagen-product-recontext-preview-06-30';
}

function isImagenTextModel(model?: string) {
  return [
    'imagen-3.0-generate-002',
    'imagen-3.0-fast-generate-001',
    'imagen-4.0-generate-001',
    'imagen-4.0-fast-generate-001',
  ].includes(model || '');
}

function isUnavailableRecontextModel(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /publisher model|not found|does not have access|unsupported model/i.test(message);
}

async function orchestratePrompt(args: {
  productContext: string;
  legacyPrompt: string;
  ratioDesc: string;
  aspectRatio: string;
  category?: string;
  style?: string;
  adBrief?: {
    role?: string;
    title?: string;
    objective?: string;
    facts?: string[];
    thaiCopy?: string[];
    includePerson?: boolean;
    personBrief?: string;
  };
  imageParts: InlineImagePart[];
}): Promise<OrchestratedPrompt> {
  const vertexAI = getVertexAIForLocation(getOrchestratorLocation());
  const model = vertexAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const instruction = `
You are the Prompt Orchestrator for an ecommerce Product Recontext pipeline.

Goal:
- Analyze the attached product image(s).
- Use the existing legacy prompt as creative direction, not as a final prompt.
- Produce a concise Imagen Product Recontext prompt that keeps the exact same product but changes the scene/background.
- Preserve product identity: shape, color, material, logo/label placement, visible accessories, and proportions.
- The final prompt may include Thai text direction if the legacy prompt asks for Thai marketing text, but keep text concise and readable.
- Avoid overloading the image with many badges, review cards, tiny captions, or dense text.
- Aspect ratio target: ${args.aspectRatio} (${args.ratioDesc}).

${args.productContext}

CATEGORY: ${args.category || 'unknown'}
STYLE: ${args.style || 'default'}

${args.adBrief ? `SHOPEE THAI ADS BRIEF (facts are the only permitted product claims):
${JSON.stringify(args.adBrief)}
For this workflow, preserve the exact product and create clean intentional zones for the supplied Thai copy. Do not try to render Thai text in the generated pixels: the client will place it as an editable overlay. Never add prices, discounts, ratings, certifications, measurements, or accessories that are not explicitly confirmed.` : ''}

LEGACY CREATIVE DIRECTION:
${args.legacyPrompt}

Return valid JSON only:
{
  "prompt": "final recontext prompt for Imagen",
  "negativePrompt": "things to avoid",
  "productSummary": "short product identity summary",
  "thaiTextPlan": ["short Thai text ideas if useful"]
}
`.trim();

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

async function generateProductRecontextImage(args: {
  prompt: string;
  imageParts: InlineImagePart[];
  aspectRatio: string;
  negativePrompt?: string;
}) {
  const { projectId } = getVertexEnvironment();
  const location = getRecontextLocation();
  const modelName = getRecontextModel();
  const accessToken = await getVertexAccessToken();
  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelName}:predict`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instances: [
        {
          prompt: args.prompt,
          productImages: args.imageParts.map((part) => ({
            image: {
              bytesBase64Encoded: part.inlineData.data,
            },
          })),
        },
      ],
      parameters: {
        addWatermark: true,
        enhancePrompt: true,
        personGeneration: 'allow_adult',
        safetySetting: 'block_few',
        sampleCount: 1,
        negativePrompt: args.negativePrompt,
        outputOptions: {
          mimeType: 'image/png',
          compressionQuality: 90,
        },
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || response.statusText || 'Product recontext request failed';
    throw new Error(`${modelName}: ${message}`);
  }

  const prediction = payload?.predictions?.[0];
  const base64 = prediction?.bytesBase64Encoded || prediction?.image?.bytesBase64Encoded;
  const mimeType = prediction?.mimeType || prediction?.image?.mimeType || 'image/png';

  if (!base64) {
    throw new Error(`${modelName}: no image data returned`);
  }

  return {
    imageUrl: `data:${mimeType};base64,${base64}`,
    modelName,
  };
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
      adBrief,
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
      adBrief,
      imageParts,
    });

    const selectedModel = typeof model === 'string' ? model : 'imagen-3.0-generate-002';
    let generated;
    if (isImagenTextModel(selectedModel)) {
      generated = await generateImagen4TextImage({
        modelName: selectedModel,
        prompt: orchestrated.prompt,
        aspectRatio,
      });
    } else {
      // Product Recontext is a preview/allowlisted publisher model. Projects
      // without access still receive a generated listing image rather than 500.
      try {
        generated = await generateProductRecontextImage({
          prompt: orchestrated.prompt,
          imageParts,
          aspectRatio,
          negativePrompt: orchestrated.negativePrompt,
        });
      } catch (error) {
        if (!isUnavailableRecontextModel(error)) throw error;
        const fallbackModel = process.env.IMAGEN_FALLBACK_MODEL || 'imagen-3.0-generate-002';
        console.warn(`[api/generate] Recontext is unavailable; falling back to ${fallbackModel}.`);
        generated = await generateImagen4TextImage({
          modelName: fallbackModel,
          prompt: orchestrated.prompt,
          aspectRatio,
        });
      }
    }

    console.log('[usage] image_generation_success', {
      status: 200,
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      pipeline: isImagenTextModel(selectedModel)
        ? 'gemini-2.5-flash->imagen'
        : 'gemini-2.5-flash->imagen-product-recontext-or-fallback',
      orchestratorModel: 'gemini-2.5-flash',
      imageModel: generated.modelName,
      category,
    });

    return res.status(200).json({
      imageUrl: generated.imageUrl,
      promptUsed: orchestrated.prompt,
      model: `gemini-2.5-flash -> ${generated.modelName}`,
      textResponse: orchestrated.productSummary || undefined,
      thaiTextPlan: orchestrated.thaiTextPlan,
    });
  } catch (error: any) {
    console.error('[api/generate] Error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
  }
}
