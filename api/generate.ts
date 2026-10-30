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

function buildProductContext(productData: any, category?: string, style?: string) {
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

  const catUpper = String(category || '').toUpperCase();
  const isVariantMode = description.includes('ตัวเลือกที่ต้องสร้างภาพนี้:');
  const isTopSellerStyle = String(style || '').toLowerCase() === 'shopee-top-seller';
  const isCover = catUpper === 'COVER' && !isVariantMode && !isTopSellerStyle;
  const isPurePhoto = catUpper === 'CLOSE_UP' || catUpper.startsWith('LIFESTYLE_') || catUpper === 'SOCIAL_PROOF';
  const isTutorial = catUpper === 'TUTORIAL';

  const contextHeader = isPurePhoto
    ? 'PRODUCT CONTEXT (Pure photographic scene — use strictly to understand the physical product and its real-world usage context; DO NOT render marketing slogans, banners, or feature text):'
    : isTutorial
      ? 'PRODUCT CONTEXT (Use this product data to synthesize 3 to 4 brand-new, concise Thai step-by-step usage captions; NEVER copy text from the uploaded source image):'
      : isVariantMode
        ? 'PRODUCT CONTEXT (Variant Studio Mode — showcase this exact variant in a unified studio theme; learn and re-render any dimension arrows/measurements from the source image using a fresh modern typography & arrow style while stripping seller store logos):'
        : 'PRODUCT CONTEXT (Use this real product data to synthesize original, highly relevant Thai marketing slogans/callouts):';

  return [
    contextHeader,
    name ? `- Product Name: ${name}` : '',
    description ? `- Product Description: ${description}` : '',
    (!isPurePhoto && features.length) ? `- Product Selling Points: ${features.join(' | ')}` : '',
    (!isCover && !isPurePhoto && price) ? `- Price: ${price}` : '',
    (!isCover && !isPurePhoto && variants.length) ? `- Options: ${variants.join(' | ')}` : '',
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
  // The former preview model was retired/unavailable for this project. Only
  // permit this legacy route when an administrator explicitly configures a
  // currently entitled model in Vercel.
  return process.env.IMAGEN_RECONTEXT_MODEL?.trim() || undefined;
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

  const isVariantMode =
    args.legacyPrompt.includes('[VARIANT_STUDIO_MODE]') ||
    args.productContext.includes('ตัวเลือกที่ต้องสร้างภาพนี้:');
  const isTopSellerStyle = String(args.style || '').toLowerCase() === 'shopee-top-seller';

  const instruction = `
Goal:
- Analyze the attached product image(s) and product context details.
- Use the existing legacy prompt as creative direction, not as a final prompt.
- Produce a detailed, high-precision product image generation prompt that keeps the exact same product while upgrading the studio scene, lighting, and graphic presentation.
- PRODUCT IDENTITY ANCHOR: The FIRST attached image is the canonical physical product. Preserve it exactly: silhouette, dimensions/proportions, construction, handle/fasteners, colour, material finish, authentic manufacturer brand emblem on the product body (e.g. embossed or stickered product brand mark), and included pieces. Any later images only confirm alternate views. Never replace it with a generic product from the same category or redesign its physical form.
${isVariantMode || String(args.category || '').toUpperCase() === 'SIZE_CHART' ? `- SMART VARIANT DIMENSION LEARNING & ANTI-MULTI-SHOP REDESIGN (HIGHEST PRIORITY):
  1. LEARN & EXTRACT SOURCE DIMENSIONS/SCALE ARROWS: Inspect the FIRST attached reference image carefully. Does it contain dimension lines, bi-directional arrows, extension lines, measurement numbers (e.g. "36 ซม.", "11 ซม.", "10.5 ซม.", "14.3 ซม."), or capacity/tier specifications (e.g. "บรรจุน้ำได้ 13 ลิตร", "3 ชั้น", "เบอร์ 36")?
     - IF YES: You MUST extract every single measurement number, unit, and capacity note accurately, and identify the exact anatomical part of the product each dimension arrow measures (for example: horizontal arrow across top opening = "36 ซม.", vertical segmented arrows along the right side: lid height = "11 ซม.", upper tier height = "10.5 ซม.", middle tier height = "10.5 ซม.", bottom water-pot height & capacity = "14.3 ซม. บรรจุน้ำได้ 13 ลิตร"). In your output "prompt", explicitly instruct the image generator to draw clean, accurate dimension arrows and extension lines anchored to those exact same anatomical parts of the product, displaying those exact Thai numbers and capacity labels!
     - IF NO dimension arrows exist in the reference image: Do not invent fake measurements; focus on showcasing the exact variant option clearly.
  2. ERASE SELLER STORE LOGOS & UI ARTIFACTS: If the source image contains any third-party seller store logo/watermark (such as a corner circle badge like "Allgoodz88" or shop name stamp) or webpage screenshot UI controls (such as left/right "<" ">" carousel navigation arrows), explicitly instruct the image generator to COMPLETELY OMIT and ERASE them. Keep ONLY the authentic manufacturer emblem physically on the product body itself.
  3. ANTI-FOOTPRINT TYPOGRAPHY & SELECTED STYLE COHESION (SHOPEE MULTI-STORE SAFE): Explicitly forbid copying the source image's old font style, old red/teal-green text color combination, or flat cutout white background. Instruct the image generator to follow the exact requested STYLE ("${args.style || 'shopee'}") described in LEGACY CREATIVE DIRECTION so all variants in this style share a unified look:
     - Single Product Unit: Render strictly ONE single physical product matching the exact tier count and silhouette of the first reference image (never a group of multiple pots).
     - Scene & Lighting: Follow the requested STYLE ("${args.style || 'shopee'}") palette, lighting, and studio environment consistently across the variant set.
     - Header & Badge Style: Modern bold Thai headline at the top with a high-contrast badge matching the "${args.style || 'shopee'}" theme displaying the exact variant name/size.
     - Dimension Arrow Style (Mandatory when source has dimension arrows): Draw crisp, high-contrast bi-directional dimension arrows and extension lines anchored to the exact product edges, with clean high-contrast pill callout badges displaying every extracted Thai measurement number and capacity spec.` : `- SOURCE IMAGE TEXT & GRAPHIC SUPPRESSION (CRITICAL): If the attached source reference photo contains any existing promotional text, Chinese/Thai/English typography, callout lines, dimension numbers, step numbers, stickers, badges, or infographic overlays, DO NOT copy, OCR, or reproduce any of that source text or graphic layout into the generated image. Extract ONLY the 3D physical product itself.`}
- CATEGORY-SPECIFIC SCENE & TEXT RULES (CRITICAL):
  * For CLOSE_UP (รายละเอียด): Produce a single-frame commercial macro detail inspection shot focusing on the exact material texture, surface finish, joints, and build craftsmanship of ONE single physical product (filling 75–85% of the frame). STRICTLY FORBID double exposure, ghosted secondary products, split screens, collage panels, floating magnifying-glass circles, or any text/headlines/banners.
  * For CONTEXTUAL LIFESTYLE SCENES (LIFESTYLE_THAI_STREET_FOOD, LIFESTYLE_THAI_MARKET, LIFESTYLE_THAI_KITCHEN, LIFESTYLE_ISAN_KITCHEN, LIFESTYLE_THAI_LOCAL_RESTAURANT, LIFESTYLE_A, LIFESTYLE_B, LIFESTYLE_C): Produce a 100% pure, candid, documentary-style real-usage photograph in the exact requested environment (e.g. LIFESTYLE_THAI_STREET_FOOD: bustling Thai street food stall / stainless steel roadside food cart, condiment trays, street ingredients, plastic stools, warm street lighting; LIFESTYLE_THAI_MARKET: vibrant traditional Thai fresh market or open-air flea market, colorful woven plastic baskets, wooden vendor tables, fresh local produce, market umbrellas; LIFESTYLE_THAI_KITCHEN: authentic Thai home/local kitchen with tiled/concrete counter, real Thai gas stove burner, stone/wooden mortar and pestle, fresh Thai herbs like holy basil/chili/lime/garlic, fish sauce bottles, and real cooking action). STRICTLY FORBID cover-style layouts, studio backdrops, podiums, marketing slogans, promotional banners, or text overlays on ANY lifestyle scene.
  * For TUTORIAL (วิธีใช้งาน): Design a clean, structured step-by-step instructional infographic showing how to use the product. NEVER copy or repeat text from the uploaded source image. Synthesize 3 to 4 brand-new, concise, logical Thai step captions (3–5 words each, e.g. "1. เตรียมอุปกรณ์...", "2. ใช้งาน...", "3. ล้างเก็บง่าย") tailored to the product's actual function. Keep the physical product 100% undistorted and place all numbered step badges/captions in clean, separated margin or card zones so text NEVER overlaps or obscures the product.
  * For COVER / INFOGRAPHIC / SIZE_CHART: Read the product description and selling points carefully and synthesize unique, highly relevant Thai marketing copy or callouts tailored specifically to this product (never use hardcoded static phrases like "เผาแล้ว พร้อมใช้" unless the product is specifically a pre-seasoned cast iron pan).
- CRITICAL LANGUAGE RULE: Whenever text is permitted by the category rules above, all text, headlines, badges, callouts, step captions, and size labels rendered inside the generated image MUST BE IN THAI LANGUAGE ONLY (ภาษาไทยเท่านั้น). Do NOT generate English text, pseudo-Latin, or gibberish text unless the confirmed product brand name itself is explicitly in English.
- STRICT NO-METADATA RULE: NEVER render system metadata headings or category headers such as "จุดเด่นสินค้า:", "ราคาที่ผู้ขายยืนยัน:", "Key features:", "Confirmed selling price:", "Description:", "Product:", "Specs:", or "Features:".
- HUMAN ANATOMY & HAND QUALITY (CRITICAL): When generating images that include people, you MUST ensure anatomically correct human features. Hands must have exactly 5 fingers each with natural proportions, natural grip posture, and correct joint articulation. Arms must connect naturally to shoulders. Faces must have symmetrical features, natural skin texture, and realistic proportions. If a person is holding or using the product, ensure the grip is physically plausible — fingers wrap around the handle/body naturally, thumbs oppose correctly, and the wrist angle is anatomically possible. NEVER generate: extra fingers, fused fingers, missing fingers, distorted knuckles, backwards thumbs, floating hands, hands clipping through objects, unnatural wrist bends exceeding 90 degrees, or arms that appear disconnected. If realistic human anatomy cannot be rendered with high confidence, prefer a product-only composition instead.
- STRICT NO-WATERMARK MANDATE: Do NOT add any watermark, logo overlay, brand emblem, AI attribution mark, Google/Gemini logo, spark icon, camera watermark, corner stamp, semi-transparent badge, or any kind of attribution mark anywhere on the image. The output must be 100% clean commercial photography with zero watermarks. Also ensure the negativePrompt includes: watermark, logo overlay, corner stamp, attribution mark, semi-transparent text.
${isVariantMode
  ? `- VARIANT STUDIO COHESION RULE (CRITICAL): Strictly apply the requested visual style ("${args.style || 'shopee'}") specified in LEGACY CREATIVE DIRECTION across all variant cards—matching its background palette, studio lighting, and badge aesthetic—while rendering strictly ONE single product unit and drawing all extracted dimension arrows and Thai measurement labels accurately on the product whenever the source image contains dimension arrows/numbers.${isTopSellerStyle ? ' Since style is "shopee-top-seller", also use bold outlined Thai typography, a confirmed size/capacity callout badge, and 1 circular zoom inset detail badge showing material/functional proof.' : ''}`
  : isTopSellerStyle
    ? `- SHOPEE TOP-SELLER INFO-COVER RULE (CRITICAL — ACTIVE ONLY FOR "shopee-top-seller" STYLE): For this cover style, design an authentic high-CTR Shopee/Taobao-TH Best-Seller Info-Cover with 4 mandatory elements: (1) Bright, high-clarity real-usage or tabletop staging of the exact reference product showing its true material texture and utility; (2) A BOLD OUTLINED THAI HOOK at the top (concise 2–4 word main headline + short sub-hook with thick contrasting white/dark stroke outline and vivid red/yellow/orange/green accent); (3) A VISUAL SIZE / CAPACITY / QUANTITY CALLOUT STACK on the side or corner displaying confirmed sizes, capacities, dimensions, or piece counts from the product context/reference image (or 2–3 short 2-word Thai benefit tags if no numeric sizes exist); and (4) 1 to 2 CIRCULAR ZOOM INSET BADGES (Picture-in-Picture detail circles with a clean border) in the corner zooming in on a key functional proof (e.g. water resistance, thickness, scale markings, or active usage) with a short 2–3 word Thai caption.`
    : '- COVER IMAGE RULE: For COVER images (ภาพปกสินค้า / ImageCategory.COVER), render a clean, high-impact hero product shot (or presenter holding product) with 1 dynamic Thai marketing headline tailored to this product and optionally one short supporting line. Unless the first reference visibly shows a multi-piece set, depict the purchasable product exactly once: the presenter may interact with that same hero item, but never create a duplicate item elsewhere in the scene. Require a physically plausible pose; no floating product, no clipping into the body, and no product resting on the chest. For reflective materials, reflections must match the same indoor scene, people, and light direction. Never repeat any hook, product name, or selling line. Establish three typography levels: one large main hook; at most one smaller, calmer proof line; and at most one small accent on a verified phrase or number. Each level must use visibly different scale, weight, and treatment. Use a purposeful three-colour high-contrast palette—bright/cream or vivid main fill, deep outline/shadow, and one selective accent—so the copy is readable at mobile thumbnail size. Never apply the same yellow/red/black effect, font style, or visual weight to every text line. Treat every regeneration as a fresh art direction: vary the scene, camera, composition, and headline placement while preserving the exact product and presenter brief. Do NOT default to rounded banners, sticker frames, feature pills, ratings, seals, price tags, feature lists, or metadata labels unless explicitly confirmed by the supplied product facts.'}
- Avoid overloading the image with many badges, review cards, tiny captions, or dense text.
- Aspect ratio target (MANDATORY): ${args.aspectRatio} (${args.ratioDesc}). Explicitly state in your output "prompt" that the image canvas MUST be composed in ${args.aspectRatio} (${args.ratioDesc}) format and must NEVER inherit a horizontal 4:3 or rectangular aspect ratio from the reference image.

${args.productContext}

CATEGORY: ${isVariantMode ? 'VARIANT_STUDIO_CARD' : (args.category || 'unknown')}
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

  const catUpper = String(args.category || '').toUpperCase();
  const categoryNegative = isVariantMode
    ? 'seller store logo, corner circle shop watermark, Allgoodz88 logo, third-party shop stamp, left right carousel navigation arrows, slider arrows, webpage screenshot UI, copied old red green source font style'
    : catUpper === 'CLOSE_UP'
      ? 'double exposure, ghosted product, duplicate product, split screen, collage, floating magnifying glass circle, inset circle, promotional banner, text overlay, headline'
      : catUpper.startsWith('LIFESTYLE_')
        ? 'studio backdrop, product podium, cover layout, advertising banner, promotional text, marketing slogan, sticker, badge, price tag, Western showroom kitchen'
        : catUpper === 'TUTORIAL'
          ? 'copied source text, OCR text from reference image, text overlapping product, warped product, melted product, distorted product geometry'
          : '';
  const systemNegative = [
    categoryNegative,
    (isVariantMode || isTopSellerStyle) ? '' : 'specs list on cover image',
    'เผาแล้ว พร้อมใช้, static repeated phrases, จุดเด่นสินค้า, ราคาที่ผู้ขายยืนยัน, Key features, Confirmed selling price, metadata labels, category headers, watermark, logo overlay, corner stamp, attribution mark, semi-transparent text, Google logo, Gemini logo, spark icon, extra fingers, six fingers, deformed hands, fused fingers, missing fingers, distorted anatomy, backwards thumbs, unnatural hand pose, mutated hands, bad anatomy, disconnected limbs',
  ].filter(Boolean).join(', ');
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
  if (!modelName) {
    throw new Error('Product Recontext is not configured. Select Gemini Image or configure IMAGEN_RECONTEXT_MODEL with an available Vertex model.');
  }
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
        addWatermark: false,
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
        addWatermark: false,
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

  // Try locations in order: envLocation, 'asia-southeast1' (Singapore), 'us-central1', 'global'
  const locationsToTry = Array.from(new Set([envLocation, 'asia-southeast1', 'us-central1', 'global']));
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
            addWatermark: false,
          } as any,
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

    const safeAspectRatio = (typeof aspectRatio === 'string' && RATIO_DESCRIPTIONS[aspectRatio.trim()]) ? aspectRatio.trim() : '1:1';
    const ratioDesc = RATIO_DESCRIPTIONS[safeAspectRatio] || RATIO_DESCRIPTIONS['1:1'];
    const productContext = buildProductContext(productData, category, style);
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
      aspectRatio: safeAspectRatio,
      category,
      style,
      adBrief: safeAdBrief,
      imageParts,
    });

    const isThaiAds = Boolean(safeAdBrief || category === 'SHOPEE_THAI_AD');

    // Build negative instruction block from orchestrated negativePrompt.
    // Gemini Image API has no separate negativePrompt param, so we inject it
    // as explicit "DO NOT" instructions appended to the generation prompt.
    const negativeBlock = orchestrated.negativePrompt
      ? `\n\nCRITICAL NEGATIVE CONSTRAINTS (DO NOT generate any of the following): ${orchestrated.negativePrompt}`
      : '';

    const anatomyGuard = `\n\nHUMAN ANATOMY QUALITY GUARD: All people in this image must have anatomically correct features. Hands: exactly 5 fingers per hand, natural joint articulation, correct thumb opposition, physically plausible grip. No extra, fused, or missing digits. No floating or disconnected limbs. No distorted facial features. If holding the product, fingers must wrap naturally around it with a realistic wrist angle. Prefer clean product-only composition over poorly rendered human anatomy.`;

    const watermarkGuard = `\n\nABSOLUTE NO-WATERMARK RULE: The final image must contain ZERO watermarks, logo overlays, corner stamps, attribution marks, semi-transparent badges, or any AI-generated branding. This is a hard requirement — any watermark means the image is rejected.`;

    const aspectMandate = `MANDATORY OUTPUT ASPECT RATIO: Generate this image strictly in ${safeAspectRatio} (${ratioDesc}). Even if the attached reference product photo is horizontal (4:3, 16:9) or rectangular, you MUST output a ${safeAspectRatio} (${ratioDesc}) canvas.`;

    const isVariantRequest =
      legacyPrompt.includes('[VARIANT_STUDIO_MODE]') ||
      productContext.includes('ตัวเลือกที่ต้องสร้างภาพนี้:');
    const fullGenerationPrompt = isThaiAds
      ? `${aspectMandate}\n\n${legacyPrompt}${anatomyGuard}${watermarkGuard}${negativeBlock}`
      : isVariantRequest
        ? [
            aspectMandate,
            orchestrated.prompt ? `MANDATORY ORCHESTRATED VARIANT & DIMENSION SPECIFICATION (FOLLOW STRICTLY): ${orchestrated.prompt}` : '',
            legacyPrompt,
          ].filter(Boolean).join('\n\n') + anatomyGuard + watermarkGuard + negativeBlock
        : [
            aspectMandate,
            legacyPrompt,
            orchestrated.prompt ? `RECONTEXT SCENE DIRECTION: ${orchestrated.prompt}` : '',
          ].filter(Boolean).join('\n\n') + anatomyGuard + watermarkGuard + negativeBlock;

    const rawModel = typeof model === 'string' && model ? model : 'gemini-3.1-flash-image';
    const targetModel = ENTERPRISE_GEMINI_IMAGE_MODELS.has(rawModel) ? rawModel : 'gemini-3.1-flash-image';
    let generated;

    try {
      generated = await generateEnterpriseGeminiImage({
        modelName: targetModel,
        prompt: fullGenerationPrompt,
        imageParts,
        aspectRatio: safeAspectRatio,
      });
    } catch (error) {
      console.warn(`[api/generate] Enterprise model ${targetModel} failed; waiting before one retry with the same model...`, error);
      await new Promise(resolve => setTimeout(resolve, 1_500));
      generated = await generateEnterpriseGeminiImage({
        modelName: targetModel,
        prompt: fullGenerationPrompt,
        imageParts,
        aspectRatio: safeAspectRatio,
      });
    }

    console.log('[usage] image_generation_success', {
      status: 200,
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      pipeline: 'gemini-2.5-flash->gemini-image',
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
