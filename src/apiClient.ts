/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  API Client — Frontend client for Vercel Serverless Functions  ║
 * ║                                                                ║
 * ║  Calls /api/analyze, /api/generate, /api/summarize             ║
 * ║  Which proxy to Vertex AI (secure server-side auth)            ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import { ImageCategory, ImageGenerationResult, ProductData } from '../types';
import { auth } from './firebase';
import { uploadImageToStorage } from './imageStorage';

// ═══════════════════════════════════════════════════════════════
//  Config
// ═══════════════════════════════════════════════════════════════

/**
 * Base URL for API calls.
 * - In production (Vercel): empty string (same origin)
 * - In development: set VITE_API_BASE_URL in .env (e.g., "http://localhost:3000")
 */
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const MAX_API_IMAGE_BYTES = 360_000;
const MAX_API_PAYLOAD_BYTES = 1_200_000;
const STORAGE_RETRY_BACKOFF_MS = 5 * 60 * 1000;
const MAX_IMAGES_BY_ENDPOINT: Record<string, number> = {
  '/api/analyze': 4,
  '/api/generate': 3,
  '/api/summarize': 3,
};

// ═══════════════════════════════════════════════════════════════
//  Types (mirror server-side interfaces)
// ═══════════════════════════════════════════════════════════════

export interface ProductAnalysis {
  name: string;
  summary: string;
  features: string[];
  visualDescription: string;
}

export interface ShopeeAdBrief {
  role: string;
  title: string;
  objective: string;
  facts: string[];
  thaiCopy: string[];
  includePerson?: boolean;
  personBrief?: string;
}

const estimateBase64Bytes = (value: string): number => Math.ceil((value.length * 3) / 4);

function getImageLimitMessage(path: string): string {
  const maxImages = MAX_IMAGES_BY_ENDPOINT[path] ?? 3;
  return `รูปภาพที่ส่งไปยัง AI มีขนาดใหญ่เกินไป กรุณาส่งไม่เกิน ${maxImages} รูป และแต่ละรูปไม่เกิน 0.36 MB (ระบบจะย่อรูปให้อัตโนมัติ)`;
}

async function shrinkImageForApi(
  dataUrl: string,
  maxEdge: number,
  qualitySteps: number[],
): Promise<string> {
  if (!dataUrl.startsWith('data:image/')) return dataUrl;

  const approximateBytes = estimateBase64Bytes(dataUrl);
  if (approximateBytes <= MAX_API_IMAGE_BYTES && maxEdge >= 1024) return dataUrl;

  const image = new Image();
  image.decoding = 'async';
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Unable to load image for compression'));
  });
  image.src = dataUrl;
  await loaded;

  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;

  ctx.drawImage(image, 0, 0, width, height);

  for (const quality of qualitySteps) {
    const compressed = canvas.toDataURL('image/jpeg', quality);
    const compressedBytes = estimateBase64Bytes(compressed);
    if (compressedBytes <= MAX_API_IMAGE_BYTES || quality === qualitySteps[qualitySteps.length - 1]) {
      return compressed;
    }
  }

  return canvas.toDataURL('image/jpeg', qualitySteps[qualitySteps.length - 1] ?? 0.42);
}

interface PreparedImages {
  images?: string[];
  storagePaths?: string[];
}

// If Firebase Storage is unavailable (for example it responds with 402 while
// billing is disabled), avoid repeatedly attempting an upload for every card.
// The current request and short-lived subsequent requests use the safe inline
// fallback instead. This is browser-session state only; once Storage is fixed
// a fresh page session will immediately use it again.
let storageUnavailableUntil = 0;

function compactProductData(productData: ProductData): Omit<ProductData, 'images' | 'referenceImages'> {
  const { images: _images, referenceImages: _referenceImages, ...textData } = productData;
  return textData;
}

async function prepareImagesForApi(images?: string[], maxImages: number = 4): Promise<PreparedImages> {
  if (!images?.length) return {};
  const sourceImages = images.filter(Boolean).slice(0, maxImages);
  // Each generate request receives a fresh Storage namespace. Reusing a job
  // based on a short image fingerprint can accidentally reuse an older source
  // order, which breaks the Product Identity Anchor when users drag a new
  // image into position 1 in Results.
  const canTryStorage = Date.now() >= storageUnavailableUntil;
  if (canTryStorage) {
    const jobId = crypto.randomUUID();
    const stored = await Promise.allSettled(sourceImages.map((source, index) => uploadImageToStorage(source, jobId, index)));
    const allStored = stored.every((result) => result.status === 'fulfilled');

    if (allStored) {
      return {
        storagePaths: stored.map((result) => (result as PromiseFulfilledResult<Awaited<ReturnType<typeof uploadImageToStorage>>>).value.path),
      };
    }

    storageUnavailableUntil = Date.now() + STORAGE_RETRY_BACKOFF_MS;
    console.warn('[ApiClient] Firebase Storage unavailable; using compressed inline reference images for this session.', stored);
  }

  // Never mix successful Storage paths with inline fallbacks: that would let
  // the server change their sequence and could make a later image become the
  // Product Identity Anchor. Compress the full ordered source set instead.
  const inlineSources = sourceImages;

  const compressionProfiles = [
    { maxEdge: 900, qualitySteps: [0.72, 0.62, 0.52, 0.44] },
    { maxEdge: 720, qualitySteps: [0.64, 0.54, 0.46, 0.38] },
    { maxEdge: 560, qualitySteps: [0.56, 0.48, 0.4, 0.34] },
    { maxEdge: 420, qualitySteps: [0.48, 0.4, 0.34, 0.28] },
  ];

  let bestEffort: string[] = [];
  for (const profile of compressionProfiles) {
    const prepared = await Promise.all(
      inlineSources.map((image) => shrinkImageForApi(image, profile.maxEdge, profile.qualitySteps)),
    );
    const totalBytes = prepared.reduce((sum, image) => sum + estimateBase64Bytes(image), 0);
    bestEffort = prepared;

    if (totalBytes <= MAX_API_PAYLOAD_BYTES) {
      return { images: prepared };
    }
  }

  const packed: string[] = [];
  let totalBytes = 0;
  for (const image of bestEffort) {
    const imageBytes = estimateBase64Bytes(image);
    if (packed.length > 0 && totalBytes + imageBytes > MAX_API_PAYLOAD_BYTES) break;
    packed.push(image);
    totalBytes += imageBytes;
  }

  return { images: packed.length ? packed : undefined };
}

// ═══════════════════════════════════════════════════════════════
//  Generic fetch wrapper with error handling
// ═══════════════════════════════════════════════════════════════

async function apiPost<T>(path: string, body: any, signal?: AbortSignal): Promise<T> {
  const url = `${API_BASE}${path}`;
  console.log(`[ApiClient] POST ${url}`);
  const token = await auth.currentUser?.getIdToken();

  if (!token) {
    throw new Error('กรุณาเข้าสู่ระบบก่อนใช้งาน AI');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (signal?.aborted) {
      throw new Error('ผู้ใช้หยุดการสร้างภาพแล้ว');
    }
    if (err.name === 'AbortError') {
      throw new Error('คำขอสร้างภาพใช้เวลานานเกินไป (Timeout 2 นาที) กรุณากดสร้างใหม่อีกครั้ง');
    }
    throw err;
  } finally {
    signal?.removeEventListener('abort', abortFromCaller);
  }

  const contentType = response.headers.get('content-type') || '';
  const rawBody = await response.text();
  const looksLikeHtml = rawBody.trim().startsWith('<!DOCTYPE') || rawBody.trim().startsWith('<html');
  const parseJsonBody = () => {
    try {
      return rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return null;
    }
  };

  if (!response.ok) {
    let errorMsg = `API error ${response.status}`;
    const errBody = parseJsonBody();
    if (errBody) {
      errorMsg = errBody.error || errorMsg;
    } else if (looksLikeHtml) {
      errorMsg = 'API ส่งหน้าเว็บกลับมาแทน JSON กรุณาตรวจ Vercel API route, Root Directory และค่า VITE_API_BASE_URL';
    } else if (rawBody.trim()) {
      errorMsg = rawBody.slice(0, 300);
    }
    if (response.status === 413) {
      errorMsg = getImageLimitMessage(path);
    }
    throw new Error(errorMsg);
  }

  const data = parseJsonBody();
  if (!data || looksLikeHtml || !contentType.includes('application/json')) {
    throw new Error('API ส่งหน้าเว็บกลับมาแทน JSON กรุณาตรวจว่า Vercel deploy มีโฟลเดอร์ api และไม่ได้ตั้ง VITE_API_BASE_URL ไปผิดโปรเจกต์');
  }

  return data as T;
}

// ═══════════════════════════════════════════════════════════════
//  API Methods
// ═══════════════════════════════════════════════════════════════

/**
 * Analyze product info and extract key selling points.
 * Calls POST /api/analyze
 */
export async function analyzeProduct(
  productInfo: string,
  images?: string[],
): Promise<ProductAnalysis> {
  const preparedImages = await prepareImagesForApi(images, 4);
  return apiPost<ProductAnalysis>('/api/analyze', {
    productInfo,
    ...preparedImages,
  });
}

/**
 * Generate product image using Vertex AI.
 * Calls POST /api/generate
 */
export async function generateProductImage(
  category: ImageCategory,
  productData: ProductData,
  style: string,
  customPrompt?: string,
  imageModel?: string,
  aspectRatio: string = '1:1',
  styleIndex?: number,
  adBrief?: ShopeeAdBrief,
  signal?: AbortSignal,
): Promise<ImageGenerationResult> {
  // ThaiAds cards also carry imageUrl and prompt history for the UI. Never send
  // those large fields to the prompt orchestrator; it only needs this brief.
  const safeAdBrief = adBrief ? {
    role: adBrief.role,
    title: adBrief.title,
    objective: adBrief.objective,
    facts: adBrief.facts.filter(Boolean).slice(0, 24),
    thaiCopy: adBrief.thaiCopy.filter(Boolean).slice(0, 8),
    includePerson: adBrief.includePerson,
    personBrief: adBrief.personBrief,
  } : undefined;
  // Construct prompt based on category (simplified — full prompt construction
  // happens on client side using the same logic as before)
  let prompt = '';

  if (customPrompt && category !== ImageCategory.TUTORIAL) {
    prompt = buildGroundedProductPrompt(customPrompt, category, productData, style);
  } else {
    // Build category-specific prompt (for TUTORIAL, customPrompt may contain JSON step prompts)
    prompt = buildGroundedProductPrompt(
      buildCategoryPrompt(category, productData, style, styleIndex, customPrompt),
      category,
      productData,
      style,
    );
  }

  const preparedImages = await prepareImagesForApi(productData.referenceImages || productData.images, 4);
  const result = await apiPost<{
    imageUrl: string;
    promptUsed: string;
    model: string;
    textResponse?: string;
    thaiTextPlan?: string[];
  }>('/api/generate', {
    prompt,
    ...preparedImages,
    model: imageModel,
    aspectRatio,
    category,
    style,
    customPrompt,
    productData: compactProductData(productData),
    adBrief: safeAdBrief,
  }, signal);

  // Build thaiTexts for reference
  const thaiTexts = extractThaiTexts(productData, category, style);
  if (result.textResponse) {
    thaiTexts.push(`AI อธิบาย: ${result.textResponse.substring(0, 300)}`);
  }
  if (Array.isArray(result.thaiTextPlan)) {
    result.thaiTextPlan.forEach((text, index) => {
      thaiTexts.push(`ข้อความไทยแนะนำ ${index + 1}: ${text}`);
    });
  }

  return {
    imageUrl: result.imageUrl,
    promptUsed: result.promptUsed,
    thaiTexts,
    modelUsed: result.model,
  };
}

/** Generate one fact-grounded image in the Thai Detail-Rich Shopee ads workflow. */
export async function generateShopeeAdImage(
  productData: ProductData,
  brief: ShopeeAdBrief,
  imageModel = 'gemini-3.1-flash-image',
): Promise<ImageGenerationResult> {
  const facts = brief.facts.filter(Boolean).join(' | ');
  const thaiCopy = brief.thaiCopy.filter(Boolean).join(' | ');
  const prompt = [
    'Create a square Thai Shopee ecommerce advertisement for the exact attached product.',
    `Image role: ${brief.role}. Objective: ${brief.objective}.`,
    'Thai high-information ecommerce design: clear product hierarchy, professional callout areas, crisp commercial lighting, and a clean mobile-safe central composition.',
    `Confirmed facts only: ${facts || 'Use only visible product details.'}`,
    thaiCopy ? `Text to be added later as editable Thai overlay (do not attempt to render it inside the generated image): ${thaiCopy}. Leave intentional clean overlay zones instead.` : '',
    'All visible labels, callouts, captions, and marketing copy must be Thai only. Never generate English marketing copy, Latin placeholders, or mixed-language text. If Thai text cannot be rendered accurately, leave the area clean and text-free rather than inventing or garbling text.',
    brief.includePerson ? `Include an adult Thai or Asian person using the exact product naturally. ${brief.personBrief || 'The product must remain large and clearly visible in the foreground.'}` : 'No people unless required by the image role.',
    'Preserve product identity exactly: shape, color, materials, labels, proportions, included pieces. Never invent measurements, certifications, prices, promotions, reviews, accessories, variants, or performance claims.',
  ].filter(Boolean).join('\n\n');

  const preparedImages = await prepareImagesForApi(productData.referenceImages || productData.images, 4);
  const result = await apiPost<{ imageUrl: string; promptUsed: string; model: string; thaiTextPlan?: string[] }>('/api/generate', {
    prompt,
    ...preparedImages,
    model: imageModel,
    aspectRatio: '1:1',
    category: 'SHOPEE_THAI_AD',
    productData: compactProductData(productData),
    adBrief: brief,
  });

  return {
    imageUrl: result.imageUrl,
    promptUsed: result.promptUsed,
    thaiTexts: result.thaiTextPlan?.length ? result.thaiTextPlan : brief.thaiCopy,
    modelUsed: result.model,
  };
}

/**
 * Summarize product description for marketing copy.
 * Calls POST /api/summarize
 */
export async function summarizeProductDescription(
  currentDesc: string,
  images?: string[],
  summaryLength: 'short' | 'medium' | 'long' = 'medium',
): Promise<string> {
  const preparedImages = await prepareImagesForApi(images, 3);
  const result = await apiPost<{ summary: string }>('/api/summarize', {
    currentDesc,
    ...preparedImages,
    summaryLength,
  });
  return result.summary;
}

// ═══════════════════════════════════════════════════════════════
//  Client-side Prompt Builder (mirrors geminiService logic)
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//  Randomization Helper
// ═══════════════════════════════════════════════════════════════
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** เลือก style จาก index (0=random, 1-N=specific) */
function pickStyle<T>(arr: T[], styleIndex?: number): T {
  if (styleIndex && styleIndex >= 1 && styleIndex <= arr.length) {
    return arr[styleIndex - 1];
  }
  return pickRandom(arr);
}

function buildGroundedProductPrompt(
  taskPrompt: string,
  category: ImageCategory,
  productData: ProductData,
  visualStyle?: string,
): string {
  const isVariantMode =
    taskPrompt.includes('[VARIANT_STUDIO_MODE]') ||
    Boolean(productData.description?.includes('ตัวเลือกที่ต้องสร้างภาพนี้:'));
  const isCover = category === ImageCategory.COVER && !isVariantMode;
  const isPurePhotoScene =
    category === ImageCategory.CLOSE_UP ||
    category.startsWith('LIFESTYLE_') ||
    category === ImageCategory.SOCIAL_PROOF;
  const features = (!isCover && !isPurePhotoScene && productData.features?.filter(Boolean).slice(0, 8)) || [];
  const price = !isCover && !isPurePhotoScene && (productData.price?.display || (productData.price?.current ? `฿${productData.price.current.toLocaleString('th-TH')}` : ''));
  const variants = !isCover && !isPurePhotoScene && (productData.variantGroups || [])
    .map(group => `${group.name}: ${group.options.map(option => `${option.label}${option.price?.display ? ` (${option.price.display})` : ''}`).join(', ')}`)
    .join(' | ');
  return [
    `Create a ${isVariantMode ? 'VARIANT_SPEC_SHOWCASE' : category} ecommerce image for this exact product.`,
    `Product name: ${productData.name || 'Unknown product'}`,
    productData.description ? `Product description: ${productData.description}` : '',
    features.length ? `Product highlights: ${features.join(' | ')}` : '',
    price ? `Product price: ${price}` : '',
    variants ? `Product options: ${variants}` : '',
    (!isPurePhotoScene && visualStyle) ? `Visual direction preset: ${visualStyle}. Keep its colour palette, lighting, composition language, and typography zone consistent for this image.` : '',
    isPurePhotoScene ? 'PURE PHOTOGRAPHY SCENE MANDATE (CRITICAL — NOT A COVER OR AD POSTER): This slot requires 100% pure commercial/documentary photography with ZERO advertising headlines, ZERO promotional banners, ZERO feature callout boxes, ZERO price tags, and ZERO cover-style graphic overlays. Immerse the product in the exact requested photographic context only.' : '',
    'PRODUCT IDENTITY ANCHOR: The FIRST attached reference image is the canonical physical product. Match it exactly: silhouette, dimensions/proportions, construction, handle/fasteners, colour, material finish, logos, labels, and included pieces. Additional reference images only confirm other views. Never substitute, redesign, simplify, or create a generic product from its category.',
    category === ImageCategory.CLOSE_UP
      ? 'SINGLE-FRAME MACRO INTEGRITY (CRITICAL): Render ONE single physical product in a single continuous camera frame. NEVER create double exposure, ghosted secondary products, split screens, collage panels, or floating magnifying-glass circles. Keep the product geometry 100% intact and undistorted while focusing razor-sharp on material texture and craftsmanship.'
      : isVariantMode
        ? `COHESIVE VARIANT STUDIO PERSPECTIVE: Render strictly ONE single product unit matching the exact structure and tier count of the first reference image, centered in a clean commercial studio angle following the selected visual direction preset (${visualStyle || 'shopee'}) so all variant cards share that exact selected style and leave clean margin space for dimension arrows when present.`
        : '3D PERSPECTIVE FREEDOM: Reconstruct the exact 3D geometry of the product from the reference images. Do NOT copy the exact 2D camera perspective or framing of the uploaded photo. Feel free to render the product from dynamic commercial angles (such as 3/4 isometric view, low hero angle, side profile, top-down flatlay, or macro detail) that best showcase the product for each card, while keeping the product identity 100% identical.',
    'LANGUAGE MANDATE (CRITICAL): All text, headlines, badges, callouts, promotional tags, and dimension labels rendered inside the generated image MUST BE IN THAI LANGUAGE ONLY (ภาษาไทยเท่านั้น). Do not render any English words, pseudo-Latin, or gibberish text unless the brand name itself is explicitly in English.',
    isVariantMode
      ? 'STRICT GRAPHIC RULE FOR VARIANT STUDIO: NEVER render system metadata headings like "จุดเด่นสินค้า:" or "ราคาที่ผู้ขายยืนยัน:". Render a clean modern Thai header for the variant name/option badge, AND if the reference image contains dimension arrows/measurements, re-render those exact dimension arrows and Thai measurement numbers in a sleek, redesigned modern infographic style.'
      : 'STRICT GRAPHIC RULE: NEVER render system metadata headings or label prefixes like "จุดเด่นสินค้า:", "ราคาที่ผู้ขายยืนยัน:", "Key features:", or "Confirmed price:". On COVER images, do NOT draw feature lists or specification callouts; draw ONLY high-impact hero product photography and optional clean Thai marketing slogan.',
    'STRICT NO-WATERMARK MANDATE: Do NOT add, draw, or render any digital watermark, logo overlay, brand emblem, Google/Gemini logo, spark icon, camera watermark, corner stamp, semi-transparent badge, AI attribution mark, or any kind of branding mark at the bottom-left, bottom-right, or anywhere on the image canvas. The output must be 100% clean commercial product photography with absolutely zero watermarks. Any watermark means the image is rejected.',
    (isVariantMode || category === ImageCategory.SIZE_CHART)
      ? 'SMART VARIANT DIMENSION LEARNING & ANTI-MULTI-SHOP REDESIGN RULE (CRITICAL): Inspect the primary reference image carefully. (1) IF the source image contains dimension lines, scale arrows, measurement numbers (e.g., 36 ซม., 11 ซม., 10.5 ซม., 14.3 ซม.), or capacity specs (e.g., บรรจุน้ำได้ 13 ลิตร), LEARN and EXTRACT 100% of those exact numeric measurements, units, and anatomical arrow anchor points on the product, and DRAW clean dimension arrows with those exact Thai measurement labels on the new image. (2) COMPLETELY REMOVE any third-party seller store logo/watermark (such as corner circle shop logos like "Allgoodz88") and any webpage screenshot UI elements (such as left/right "<" ">" carousel slider arrows), while keeping authentic manufacturer markings physically on the product body itself. (3) ANTI-FOOTPRINT RESTYLING: NEVER copy the source image old font family, old red/green text color combination, or flat cutout white background—redesign all typography, dimension arrows, and measurement pill badges in a fresh, modern, unified commercial studio style.'
      : 'SOURCE IMAGE TEXT & WATERMARK SUPPRESSION RULE (CRITICAL): If the input reference photo contains any existing promotional text, Chinese/Thai/English typography, callout lines, dimension numbers, step badges, stickers, watermarks, or infographic overlays, DO NOT copy, OCR, or reproduce any of that source text or graphic layout into the new generated image. Extract ONLY the 3D physical product itself.',
    'HUMAN ANATOMY & HAND QUALITY (CRITICAL): When generating images that include people, ensure anatomically correct human features at all times. Hands must have exactly 5 fingers each with natural proportions and correct joint articulation. If a person is holding or using the product, fingers must wrap around the handle/body naturally, thumbs must oppose correctly, and the wrist angle must be anatomically possible. NEVER generate extra fingers, fused fingers, missing fingers, distorted knuckles, backwards thumbs, floating hands, hands clipping through objects, or arms that appear disconnected. If realistic human anatomy cannot be rendered with high confidence, prefer a clean product-only composition instead.',
    'Use the attached product reference images as the source of truth. Preserve the same product identity, shape, color, materials, logos/labels, and visible details. Improve only the scene, lighting, background, composition, and sales presentation. Do not invent a different product.',
    `Image task: ${taskPrompt}`,
  ].filter(Boolean).join('\n\n');
}

function buildCategoryPrompt(
  category: ImageCategory,
  productData: ProductData,
  style: string,
  styleIndex?: number,
  customPrompt?: string,
): string {
  const coverTypographyRule = `COVER TYPOGRAPHY & VISUAL HIERARCHY RULES (MANDATORY):
1. NO DUPLICATE HOOKS (Hook ห้ามซ้ำทั้งภาพ): Never repeat the same slogan, phrase, or text across lines anywhere on the image canvas.
2. DOMINANT MAIN HOOK (Main Hook ใหญ่ที่สุดเพียง 1 ชุด): The main Thai headline hook MUST be the single largest text element on the entire image.
3. MAX 1 SUPPORTING LINE (มีข้อความรองได้สูงสุด 1 บรรทัด): At most ONE supporting subtitle line below or next to the main headline. This line MUST be significantly simpler, lighter, and smaller than the main hook.
4. SINGLE FOCAL ACCENT (เน้นคำหรือเลขสำคัญได้เพียงจุดเดียว): Emphasize or highlight at most ONE single key word, number, or feature claim on the entire image canvas.
5. DISTINCT 3-LEVEL TYPOGRAPHY HIERARCHY (ทั้ง 3 ระดับต้องต่างกันจริง): The Main Hook, Supporting Line, and Accent Highlight MUST differ visibly in font size, font weight, and visual treatment.
6. 3-LAYER COLOR SYSTEM (บังคับใช้ระบบสี 3 ชั้น): Apply a refined 3-layer color system (Primary text color, Deep outline/drop shadow, and ONE dynamic accent color). NEVER use the identical yellow-red-black text effect across all lines, and NEVER use identical font styles or weights for every line.
7. THUMBNAIL READABILITY (เน้นการอ่านได้ชัดแม้อย่อเป็น thumbnail บนมือถือ): All rendered Thai headlines must be ultra-legible with high contrast, perfectly readable even when scaled down to a small mobile e-commerce thumbnail.`;
  switch (category) {
    case ImageCategory.COVER: {
      if (['brand-ambassador', 'brand-ambassador-female', 'brand-ambassador-male'].includes(style)) {
        const presenter = style === 'brand-ambassador-male'
          ? 'one handsome, attractive, young Thai male brand ambassador (age 25–30 years old) with a confident bright smile, modern stylish hair, and glowing clear healthy skin'
          : style === 'brand-ambassador-female'
            ? 'one beautiful, attractive, young Thai female brand ambassador (age 23–28 years old) with a cheerful bright smile, modern stylish hair, and glowing clear healthy skin'
            : 'one beautiful, attractive, young Thai brand ambassador (age 23–30 years old) with a cheerful bright smile, modern stylish hair, and glowing clear healthy skin';
        const variations = [
          'Editorial product hero: presenter on the right, exact product large in the lower-left foreground, with one sculptural Thai headline in generous negative space at upper-left. Use no boxes, pills, stickers, or feature chips.',
          'Warm real-use demonstration: presenter on the left actively using the exact product while the product remains the largest object. Compose one concise Thai hook as dimensional typography integrated into the scene, not inside a banner.',
          'Premium studio portrait: three-quarter product close-up in the foreground, presenter softly behind it. Use one elegant Thai hook with subtle bevel, depth, and a soft shadow; keep the rest of the canvas clean.',
          'Cinematic lifestyle moment: presenter naturally demonstrates the exact product in a relevant Thai setting. Use one dynamic Thai hook that follows the composition with a restrained supporting line; no infographic layout.',
          'Bold marketplace editorial: product and presenter create a strong diagonal composition with expressive lighting. Use one oversized Thai headline with tasteful colour blocking behind it, but never a rounded badge, pill, or sticker.',
          'Authentic testimonial frame: presenter makes eye contact while presenting the exact product at close range. Use a confident Thai hook in open negative space and one very small support line only; no ratings, seals, or extra claims.',
        ];
        const variation = variations[((styleIndex || 1) - 1) % variations.length];
        return `Thai Marketplace Brand Ambassador product cover for "${productData.name}". Use exactly ${presenter} who naturally demonstrates or introduces the exact reference product. The product must be the main purchase object: large, sharp, unobstructed, and faithful to the reference in shape, logo, colour, materials, proportions, labels, and included pieces. PHYSICAL STAGING RULE: Unless the first reference visibly shows a multi-piece set, depict the purchasable product exactly ONCE in the whole image. The presenter may touch, hold, or use that same hero item only; never create a second duplicate product. Keep it in a physically plausible position with a natural grip and clear separation from the torso—never floating, clipped through the body, or resting against the chest. For cookware, choose one believable action only: either the single pan is being used on the stove OR the single pan is held/presented away from the body; never show one pan cooking and another pan being held. Reflections on glossy metal must show the same kitchen, light direction, and people present in the scene, never sky, outdoor scenery, or an unrelated subject. CREATIVE COVER RULE: Build a fresh art direction around the product rather than reusing a fixed infographic template. ${coverTypographyRule} Design original Thai visual headline graphics with an expressive font treatment (for example: bold 3D lettering, a brush-style mark, glowing outline, slanted dynamic type, or restrained colour blocking) that belongs to the scene. Do NOT add rating badges, trust seals, feature chips, price tags, rounded pills, sticker frames, or generic "best seller" claims unless they are confirmed product facts. ${variation} On every regeneration change the pose, camera angle, composition, hook placement, typography treatment, and relevant props, while preserving the same product identity, young attractive brand-ambassador character, and campaign mood.`;
      }
      return `High-impact commercial E-Commerce COVER image (ภาพปกสินค้า) for "${productData.name}". Product Description: ${productData.description}. Visual Style: ${style}. Product is large and unmistakable in the foreground. Unless the first reference visibly shows a set, depict the purchasable product exactly once—never duplicate it in the presenter’s hands and again in the scene. Use a physically plausible pose; do not place the product on a person’s chest or let it float/clash with the body. Keep glossy reflections consistent with the same scene. Create a distinctive art-directed scene instead of a repeated infographic template. ${coverTypographyRule} Do NOT add generic feature pills, rating badges, prices, rounded banners, or stickers unless they are confirmed facts. All text MUST be in THAI LANGUAGE ONLY (ภาษาไทยเท่านั้น). Professional studio lighting, sharp product details.`;
    }
    case ImageCategory.INFOGRAPHIC:
      return `Product infographic for "${productData.name}". ${productData.features?.join(' | ') || ''}. ALL TEXT CALLOUTS AND HEADLINES MUST BE IN THAI LANGUAGE ONLY (ภาษาไทยเท่านั้น). Clean flat design.`;
    case ImageCategory.CLOSE_UP:
      return `Single-frame commercial close-up detail inspection photograph of "${productData.name}". SINGLE UNIFIED OBJECT MANDATE (NO DOUBLE EXPOSURE, NO GHOSTING, NO SPLIT SCREEN, NO INSET CIRCLES): Render exactly ONE single physical product in one continuous camera frame from a tight 45-degree near-focus inspection angle (filling 75–85% of the canvas). Do NOT superimpose a zoomed texture over a second ghosted product, do NOT create a split collage, and do NOT draw floating magnifying-glass circles. Keep the entire visible product geometry, proportions, and component placement 100% faithful to the reference image without warping or stretching. Highlight razor-sharp material texture, surface finish, joints/welds/stitching, and build craftsmanship under crisp directional studio lighting with a soft, clean bokeh background. Render ZERO text, ZERO banners, and ZERO slogans.`;
    case ImageCategory.LIFESTYLE_A:
      return `Authentic home lifestyle photography of "${productData.name}" being used naturally in a cozy domestic setting. REALISTIC LIFESTYLE & KITCHEN PHYSICS (CRITICAL): If the product is cookware, a wok, pan, or appliance used for cooking, it MUST be placed directly ON A STOVE, GAS HOB, or INDUCTION BURNER when cooking food with steam. NEVER render a hot pan stir-frying food directly on a bare wooden dining table or countertop without a stove. Ensure natural hand ergonomics and believable posture—one hand holding utensil or handle with a natural grip. Warm natural daylight, high commercial realism, zero promotional text or cover banners.`;
    case ImageCategory.LIFESTYLE_B:
      return `Authentic outdoor lifestyle photography of "${productData.name}" actively used in a natural outdoor, garden, or patio setting. Ensure realistic product usage, natural hand posture, and genuine outdoor lighting with lush depth-of-field background. Zero promotional text or cover banners.`;
    case ImageCategory.LIFESTYLE_C:
      return `Authentic modern urban/professional lifestyle photography of "${productData.name}" in real-world daily use inside a clean modern workspace or city environment. Candid documentary realism, natural lighting, zero promotional text or cover banners.`;
    case ImageCategory.LIFESTYLE_THAI_STREET_FOOD:
      return `Authentic documentary-style real-usage photography of "${productData.name}" actively being used at a bustling Thai street food stall / stainless steel roadside food cart (ร้านสตรีทฟู้ดไทย / รถเข็นขายอาหารริมทาง). MANDATORY SCENE & ACTION CONTEXT (NOT A COVER IMAGE): Show the exact product in real-world action on a Thai street vendor's stainless steel cart or prep station, surrounded by realistic street stall details—stainless steel condiment trays (พวงเครื่องปรุง), fresh Thai street food ingredients, warm tungsten street-stall lighting or tropical daylight, plastic stools/folding tables, and softly blurred Thai street signage and lively street-food bokeh in the background. If the product is cookware or kitchenware, show it actively cooking or serving Thai street food on a real street-cart gas burner. NEVER use a studio backdrop, podium, or cover-style graphic layout. Render ZERO marketing headlines, ZERO banners, and ZERO stickers.`;
    case ImageCategory.LIFESTYLE_THAI_MARKET:
      return `Authentic documentary-style real-usage photography of "${productData.name}" in a vibrant traditional Thai fresh market or open-air Thai flea market (ตลาดสดไทย / ตลาดนัดไทย). MANDATORY SCENE & ACTION CONTEXT (NOT A COVER IMAGE): Show the exact product being used or handled naturally in a rich, lived-in Thai market stall environment—colorful woven plastic baskets (ตะกร้าพลาสติกในตลาด), wooden vendor tables, fresh local produce/herbs/ingredients, warm light filtering through colorful market umbrellas/awnings, and a softly blurred background of bustling Thai market vendors and shoppers. NEVER use a plain studio backdrop, podium, or cover-style graphic layout. Render ZERO marketing headlines, ZERO banners, and ZERO stickers.`;
    case ImageCategory.LIFESTYLE_THAI_KITCHEN:
      return `Authentic real-life photography of "${productData.name}" actively being used in a genuine Thai home kitchen or local Thai kitchen (ห้องครัวไทยจริง). MANDATORY THAI KITCHEN ENVIRONMENT & PHYSICS (NOT A COVER OR WESTERN SHOWROOM): Surround the product with unmistakable Thai culinary context—tiled or polished concrete Thai kitchen counter, real Thai gas stove burner (เตาแก๊สไทย), stone or wooden mortar and pestle (ครกสาก), fresh Thai herbs and aromatics (holy basil/กะเพรา, kaffir lime leaves, bird's eye chilies, garlic, shallots, lime), fish sauce and seasoning bottles, and warm natural daylight through Thai kitchen windows. If the product is cookware (wok, pan, pot), it MUST sit on a real gas burner actively cooking Thai food with natural steam—never stir-frying on a bare table. NEVER use a studio backdrop or cover-style graphic layout. Render ZERO marketing headlines, ZERO banners, and ZERO stickers.`;
    case ImageCategory.LIFESTYLE_ISAN_KITCHEN:
      return `Authentic real-life photography of "${productData.name}" actively being used in a traditional Thai-Isan kitchen or local som-tam stall setting (ครัวอีสาน / ร้านส้มตำ). Surround with authentic Isan culinary details: wooden mortar and pestle (ครกไม้), woven sticky rice basket (กระติ๊บข้าวเหนียว), fresh green papaya, lime, chilies, tomatoes, rustic wooden counter, and warm natural ambient daylight. Candid documentary realism, zero studio backdrop, zero promotional text or cover banners.`;
    case ImageCategory.LIFESTYLE_THAI_LOCAL_RESTAURANT:
      return `Authentic real-life photography of "${productData.name}" actively being used in a bustling local family-owned Thai restaurant (ร้านอาหารตามสั่ง / ร้านอาหารท้องถิ่นไทย). Realistic working restaurant table or kitchen station, Thai dishes, stainless steel utensils, warm inviting ambient lighting, and softly blurred local dining room background. Candid documentary realism, zero studio backdrop, zero promotional text or cover banners.`;
    case ImageCategory.SIZE_CHART:
      return `Clean product size comparison chart for "${productData.name}". Dimension annotations and specifications MUST BE IN THAI LANGUAGE ONLY (ภาษาไทยเท่านั้น, เช่น ขนาดสินค้า, ซม., มม.).`;
    case ImageCategory.SOCIAL_PROOF:
      return `Authentic customer review / unboxing / real-user satisfaction photograph featuring the exact "${productData.name}" in a relatable real-home environment. Natural window lighting, smartphone photography aesthetic, genuine unposed feel, zero copied source-image text.`;
    case ImageCategory.TUTORIAL: {
      let userSteps: string[] = [];
      if (customPrompt) {
        try {
          const parsed = JSON.parse(customPrompt);
          if (Array.isArray(parsed)) {
            userSteps = parsed.map(s => String(s || '').trim()).filter(Boolean);
          }
        } catch {
          if (customPrompt.trim()) userSteps = [customPrompt.trim()];
        }
      }
      const stepsDirective = userSteps.length > 0
        ? `Use these exact user-specified steps (translate/render in clean Thai): ${userSteps.map((s, idx) => `ขั้นตอนที่ ${idx + 1}: ${s}`).join(' | ')}`
        : `Synthesize 3 to 4 brand-new, logical, concise Thai usage steps (ขั้นตอนที่ 1, 2, 3...) specifically explaining how a customer prepares, uses, and gets the best result from "${productData.name}" (${productData.description || ''}). Keep each step caption very short (3–5 Thai words, e.g. "1. เตรียมอุปกรณ์ให้พร้อม", "2. ใช้งานได้ทันที", "3. ล้างเก็บง่าย").`;
      const tutorialStyles = [
        'Clean 2x2 or 3-step modern infographic card layout with a soft neutral background, numbered circle badges (1, 2, 3), and thin clean dividers.',
        'Horizontal step-by-step timeline flow from left to right with numbered badges and connecting arrows on a soft cream/light-blue background.',
        'Editorial magazine how-to guide layout on warm off-white paper with generous whitespace and numbered step callout cards in the margins.',
        'Modern dark-tech instructional layout (#1E1E2E) with glowing cyan/emerald step numbers and clean separated step cards.',
        'Warm approachable DIY craft guide layout on light kraft-paper tone with clean numbered step badges and simple directional arrows.',
        'Vertical story-style step sequence with bold numbered step headers (01, 02, 03) and clean separated caption zones.',
      ];
      const chosenTutorialLayout = tutorialStyles[((styleIndex || 1) - 1) % tutorialStyles.length];
      return `Step-by-step "How to Use" instructional infographic (ภาพวิธีใช้งาน) for "${productData.name}".
LAYOUT & STYLE: ${chosenTutorialLayout}
STEP CONTENT MANDATE: ${stepsDirective}
STRICT SOURCE-TEXT BAN (CRITICAL): NEVER copy, OCR, or reproduce any existing text, labels, Chinese/Thai/English words, or old callouts from the uploaded source reference image! All Thai step captions must be newly composed for this tutorial.
PRODUCT FIDELITY & NON-OVERLAPPING TEXT RULE (CRITICAL): Preserve the exact 3D geometry, proportions, and details of the reference product without warping, melting, or distorting it. Place all numbered badges (1, 2, 3...) and short Thai step captions inside dedicated, clean margin or card zones so that text NEVER overlaps, covers, or cuts across the physical product.`;
    }
    default:
      return `Generate a product image for "${productData.name}". ${productData.description}. ALL TEXT MUST BE IN THAI LANGUAGE ONLY (ภาษาไทยเท่านั้น).`;
  }
}

function extractThaiTexts(
  productData: ProductData,
  category: ImageCategory,
  style: string,
): string[] {
  const name = productData.name || '';
  const s = style.toLowerCase();

  switch (category) {
    case ImageCategory.COVER: {
      const texts = [`ชื่อสินค้า: ${name}`];
      if (['shopee', 'shopee-mall'].includes(s)) {
        texts.push('แบนเนอร์: Flash Sale / ส่งฟรี');
        texts.push('ป้ายราคา: ราคาเดิม (ขีดฆ่า) → ราคาลด');
      } else if (['lazada', 'lazada-flagship'].includes(s)) {
        texts.push('แบนเนอร์: LazMall / Official Store ✓');
        texts.push('ป้ายราคา: ราคาเดิม → ราคา SALE');
      }
      return texts;
    }
    case ImageCategory.INFOGRAPHIC: {
      const texts = [`ชื่อสินค้า: ${name}`];
      productData.features?.forEach((f, i) => {
        texts.push(`จุดเด่น ${i + 1}: ${f}`);
      });
      return texts;
    }
    case ImageCategory.CLOSE_UP:
      return [`ชื่อสินค้า: ${name}`, '(ภาพ Close-up — เน้นวัสดุ/texture)'];
    default:
      return [`ชื่อสินค้า: ${name}`];
  }
}
