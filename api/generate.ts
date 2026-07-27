/**
 * POST /api/generate
 *
 * 2-stage product content generation pipeline:
 *   1) Gemini 2.5 Flash analyzes product images + legacy direction prompt.
 *   2) Imagen Product Recontext places the same product into the generated scene.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Modality } from '@google/genai';
import { getServiceAccountCredentials, getVertexAIForLocation, getVertexAccessToken, getVertexEnvironment } from './_lib/vertex.js';
import { requireFirebaseUser } from './_lib/firebaseAdmin.js';
import { resolveImageParts } from './_lib/storageImages.js';

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

function buildProductContext(productData: any, category?: string) {
  if (!productData || typeof productData !== 'object') return '';

  const name = String(productData.name || '').trim();
  const description = String(productData.description || '').trim();
  const features = Array.isArray(productData.features)
    ? productData.features.filter(Boolean).map(String).slice(0, 24)
    : [];
  const price = productData.price?.display || (productData.price?.current ? `฿${Number(productData.price.current).toLocaleString('th-TH')}` : '');
  const variants = Array.isArray(productData.variantGroups)
    ? productData.variantGroups.slice(0, 3).map((group: any) => {
      const options = Array.isArray(group?.options) ? group.options.slice(0, 20) : [];
      return `${String(group?.name || 'Option')}: ${options.map((option: any) => `${String(option?.label || '')}${option?.price?.display ? ` (${option.price.display})` : ''}`).filter(Boolean).join(', ')}`;
    }).filter(Boolean)
    : [];

  const isCover = category === 'COVER' || category === 'cover';

  return [
    'PRODUCT CONTEXT:',
    name ? `- Product: ${name}` : '',
    description ? `- Summary: ${description}` : '',
    (!isCover && features.length) ? `- Highlights: ${features.join(' | ')}` : '',
    (!isCover && price) ? `- Price: ${price}` : '',
    (!isCover && variants.length) ? `- Options: ${variants.join(' | ')}` : '',
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

const ENTERPRISE_GEMINI_IMAGE_MODELS = new Set([
  'gemini-3.1-flash-image',
  // Keep saved selections from earlier builds working, but send them to the
  // GA model. The preview name was retired on 17 July 2026.
  'gemini-3.1-flash-image-preview',
  'gemini-2.5-flash-image',
  'gemini-3-pro-image-preview',
  'gemini-3-pro-image',
]);

function getEnterpriseGeminiImageModel(model: string) {
  if (model === 'gemini-3.1-flash-image-preview') return 'gemini-3.1-flash-image';
  if (model === 'gemini-3-pro-image-preview') return 'gemini-3-pro-image';
  return model;
}

function getGeminiAspectRatio(aspectRatio: string) {
  const supported = new Set(['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '21:9']);
  if (supported.has(aspectRatio)) return aspectRatio;
  // Gemini Image does not expose 4:5. Keep the closest portrait composition.
  return aspectRatio === '4:5' ? '3:4' : '1:1';
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
- CRITICAL LANGUAGE RULE: All text, banners, headlines, badges, callouts, size labels, and promotional text rendered inside the generated image MUST BE IN THAI LANGUAGE ONLY (ภาษาไทยเท่านั้น). Do NOT generate English text, pseudo-Latin, or gibberish text unless the confirmed product brand name itself is explicitly in English.
- STRICT NO-METADATA RULE: NEVER render system metadata headings or category headers such as "จุดเด่นสินค้า:", "ราคาที่ผู้ขายยืนยัน:", "Key features:", "Confirmed selling price:", "Description:", "Product:", "Specs:", or "Features:". If rendering text, render ONLY clean natural marketing headlines (e.g. "เผาแล้ว พร้อมใช้!"), never system category headers or label prefixes.
- COVER IMAGE RULE: For COVER images (ภาพปกสินค้า / ImageCategory.COVER), render a clean, high-impact hero product shot (or presenter holding product). Do NOT render feature bullet points, feature lists, or metadata labels on Cover images.
- Avoid overloading the image with many badges, review cards, tiny captions, or dense text.
- Aspect ratio target: ${args.aspectRatio} (${args.ratioDesc}).

${args.productContext}

CATEGORY: ${args.category || 'unknown'}
STYLE: ${args.style || 'default'}

${args.adBrief ? `SHOPEE THAI ADS BRIEF (facts are the only permitted product claims):
${JSON.stringify(args.adBrief)}
For this workflow, preserve the exact product and create clean intentional zones for the supplied Thai copy. Render only the short Thai copy supplied in the brief when the model can render it clearly; do not invent extra copy, claims, prices, or promotions. If Thai text cannot be rendered reliably, omit it and leave the requested zone clean for editing. Never add prices, discounts, ratings, certifications, measurements, or accessories that are not explicitly confirmed. The generated image must not contain English marketing copy, Latin placeholders, or mixed-language labels. Use a marketplace-safe open composition: no border, rounded frame, thick outline, side rails, left/right information panels, top banner frame, card containers, or UI chrome around the image. For a specification/size card, you may design a Thai spec table and dimension callouts, but use confirmed measurements only. When a measurement is missing, use clearly marked editable placeholders such as "กรอกความยาว: ____ ซม." and "รอตรวจสอบ"—never invent plausible numeric values.` : ''}

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

  const systemNegative = 'จุดเด่นสินค้า, ราคาที่ผู้ขายยืนยัน, Key features, Confirmed selling price, metadata labels, category headers, specs list on cover image';
  const finalNegativePrompt = parsed.negativePrompt ? `${parsed.negativePrompt}, ${systemNegative}` : systemNegative;

  return {
    prompt: parsed.prompt,
    negativePrompt: finalNegativePrompt,
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

/**
 * Generates or edits an image through the current Google Gen AI SDK. This is
 * intentionally separate from the legacy Vertex SDK used by the prompt
 * orchestrator: Gemini 3.1 Flash Image is available on the global Enterprise
 * Agent Platform endpoint and supports image input/output in one request.
 */
async function generateEnterpriseGeminiImage(args: {
  modelName: string;
  prompt: string;
  imageParts: InlineImagePart[];
  aspectRatio: string;
}) {
  const { projectId, location: envLocation } = getVertexEnvironment();
  const modelName = getEnterpriseGeminiImageModel(args.modelName);

  // Try locations in order: envLocation (default us-central1), 'us-central1', 'global'
  const locationsToTry = Array.from(new Set([envLocation, 'us-central1', 'global']));
  let lastError: any;

  for (const loc of locationsToTry) {
    try {
      const ai = new GoogleGenAI({
        enterprise: true,
        project: projectId,
        location: loc,
        apiVersion: 'v1',
        googleAuthOptions: {
          credentials: getServiceAccountCredentials(),
        },
      });

      const response = await ai.models.generateContent({
        model: modelName,
        contents: [{
          role: 'user',
          parts: [
            ...args.imageParts,
            { text: args.prompt },
          ],
        }],
        config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
          imageConfig: {
            aspectRatio: getGeminiAspectRatio(args.aspectRatio),
            personGeneration: 'ALLOW_ADULT',
            outputMimeType: 'image/png',
          },
        },
      });

      const outputPart = response.candidates
        ?.flatMap(candidate => candidate.content?.parts || [])
        .find(part => part.inlineData?.data);
      const base64 = outputPart?.inlineData?.data;
      const mimeType = outputPart?.inlineData?.mimeType || 'image/png';

      if (base64) {
        return {
          imageUrl: `data:${mimeType};base64,${base64}`,
          modelName,
        };
      }
    } catch (err) {
      lastError = err;
      console.warn(`[generateEnterpriseGeminiImage] Location "${loc}" attempt failed for model "${modelName}":`, err);
    }
  }

  throw lastError || new Error(`${modelName}: no image data returned`);
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
      storagePaths,
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

    const imageParts = await resolveImageParts(firebaseUser.uid, images, storagePaths);
    if (imageParts.length === 0) {
      return res.status(400).json({
        error: 'Product Recontext pipeline requires at least one source product image.',
      });
    }

    const ratioDesc = RATIO_DESCRIPTIONS[aspectRatio] || RATIO_DESCRIPTIONS['1:1'];
    const productContext = buildProductContext(productData, category);
    const legacyPrompt = [productContext, prompt || customPrompt].filter(Boolean).join('\n\n');
    // Defend the orchestrator against UI-only card state (especially data-URL
    // imageUrl values) being accidentally included in a ThaiAds brief.
    const safeAdBrief = adBrief && typeof adBrief === 'object' ? {
      role: typeof adBrief.role === 'string' ? adBrief.role : undefined,
      title: typeof adBrief.title === 'string' ? adBrief.title : undefined,
      objective: typeof adBrief.objective === 'string' ? adBrief.objective : undefined,
      facts: Array.isArray(adBrief.facts) ? adBrief.facts.filter(Boolean).map(String).slice(0, 24) : [],
      thaiCopy: Array.isArray(adBrief.thaiCopy) ? adBrief.thaiCopy.filter(Boolean).map(String).slice(0, 8) : [],
      includePerson: Boolean(adBrief.includePerson),
      personBrief: typeof adBrief.personBrief === 'string' ? adBrief.personBrief : undefined,
    } : undefined;

    const orchestrated = await orchestratePrompt({
      productContext,
      legacyPrompt,
      ratioDesc,
      aspectRatio,
      category,
      style,
      adBrief: safeAdBrief,
      imageParts,
    });

    const fullGenerationPrompt = [
      legacyPrompt,
      orchestrated.prompt ? `RECONTEXT SCENE DIRECTION: ${orchestrated.prompt}` : '',
    ].filter(Boolean).join('\n\n');

    const selectedModel = typeof model === 'string' && model ? model : 'gemini-3.1-flash-image';
    let generated;

    if (ENTERPRISE_GEMINI_IMAGE_MODELS.has(selectedModel)) {
      try {
        generated = await generateEnterpriseGeminiImage({
          modelName: selectedModel,
          prompt: fullGenerationPrompt,
          imageParts,
          aspectRatio,
        });
      } catch (error) {
        console.warn(`[api/generate] Enterprise model ${selectedModel} failed; attempting Product Recontext with source image...`, error);
        try {
          generated = await generateProductRecontextImage({
            prompt: orchestrated.prompt || fullGenerationPrompt,
            imageParts,
            aspectRatio,
            negativePrompt: orchestrated.negativePrompt,
          });
        } catch (recontextError) {
          console.warn(`[api/generate] Product Recontext fallback failed; trying Imagen text model...`, recontextError);
          const fallbackModel = process.env.IMAGEN_FALLBACK_MODEL || 'imagen-3.0-generate-002';
          generated = await generateImagen4TextImage({
            modelName: fallbackModel,
            prompt: fullGenerationPrompt,
            aspectRatio,
          });
        }
      }
    } else if (isImagenTextModel(selectedModel)) {
      // If user explicitly chose a text model or fallback, attempt product recontext first to preserve source image
      try {
        generated = await generateProductRecontextImage({
          prompt: orchestrated.prompt || fullGenerationPrompt,
          imageParts,
          aspectRatio,
          negativePrompt: orchestrated.negativePrompt,
        });
      } catch (recontextErr) {
        generated = await generateImagen4TextImage({
          modelName: selectedModel,
          prompt: fullGenerationPrompt,
          aspectRatio,
        });
      }
    } else {
      try {
        generated = await generateProductRecontextImage({
          prompt: orchestrated.prompt || fullGenerationPrompt,
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
          prompt: fullGenerationPrompt,
          aspectRatio,
        });
      }
    }

    console.log('[usage] image_generation_success', {
      status: 200,
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      pipeline: ENTERPRISE_GEMINI_IMAGE_MODELS.has(selectedModel)
        ? 'gemini-2.5-flash->gemini-image-or-imagen-fallback'
        : isImagenTextModel(selectedModel)
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
