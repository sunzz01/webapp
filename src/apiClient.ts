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
const MAX_API_PAYLOAD_BYTES = 1_850_000;
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

function compactProductData(productData: ProductData): Omit<ProductData, 'images' | 'referenceImages'> {
  const { images: _images, referenceImages: _referenceImages, ...textData } = productData;
  return textData;
}

const imageJobIds = new Map<string, string>();

async function prepareImagesForApi(images?: string[], maxImages: number = 4): Promise<PreparedImages> {
  if (!images?.length) return {};
  const sourceImages = images.filter(Boolean).slice(0, maxImages);
  const fingerprint = sourceImages.map((source) => `${source.length}:${source.slice(0, 64)}`).join('|');
  const jobId = imageJobIds.get(fingerprint) || crypto.randomUUID();
  imageJobIds.set(fingerprint, jobId);
  const stored = await Promise.allSettled(sourceImages.map((source, index) => uploadImageToStorage(source, jobId, index)));
  const storagePaths = stored
    .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof uploadImageToStorage>>> => result.status === 'fulfilled')
    .map(result => result.value.path);
  const uploadFailed = sourceImages.filter((_, index) => stored[index]?.status !== 'fulfilled');

  // A failed Storage upload should not block the existing workflow. Compress only
  // those images and send them inline as the temporary fallback.
  if (!uploadFailed.length) return { storagePaths };

  const compressionProfiles = [
    { maxEdge: 900, qualitySteps: [0.72, 0.62, 0.52, 0.44] },
    { maxEdge: 720, qualitySteps: [0.64, 0.54, 0.46, 0.38] },
    { maxEdge: 560, qualitySteps: [0.56, 0.48, 0.4, 0.34] },
    { maxEdge: 420, qualitySteps: [0.48, 0.4, 0.34, 0.28] },
  ];

  let bestEffort: string[] = [];
  for (const profile of compressionProfiles) {
    const prepared = await Promise.all(
      uploadFailed.map((image) => shrinkImageForApi(image, profile.maxEdge, profile.qualitySteps)),
    );
    const totalBytes = prepared.reduce((sum, image) => sum + estimateBase64Bytes(image), 0);
    bestEffort = prepared;

    if (totalBytes <= MAX_API_PAYLOAD_BYTES) {
      return { storagePaths: storagePaths.length ? storagePaths : undefined, images: prepared };
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

  return { storagePaths: storagePaths.length ? storagePaths : undefined, images: packed.length ? packed : undefined };
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
  const timeoutId = setTimeout(() => controller.abort(), 60000);
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
      throw new Error('คำขอสร้างภาพใช้เวลานานเกินไป (Timeout 60 วินาที) กรุณากดสร้างใหม่อีกครั้ง');
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

  if (customPrompt) {
    prompt = buildGroundedProductPrompt(customPrompt, category, productData, style);
  } else {
    // Build category-specific prompt
    prompt = buildGroundedProductPrompt(
      buildCategoryPrompt(category, productData, style, styleIndex),
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
  const isCover = category === ImageCategory.COVER;
  const features = (!isCover && productData.features?.filter(Boolean).slice(0, 8)) || [];
  const price = !isCover && (productData.price?.display || (productData.price?.current ? `฿${productData.price.current.toLocaleString('th-TH')}` : ''));
  const variants = !isCover && (productData.variantGroups || [])
    .map(group => `${group.name}: ${group.options.map(option => `${option.label}${option.price?.display ? ` (${option.price.display})` : ''}`).join(', ')}`)
    .join(' | ');
  return [
    `Create a ${category} ecommerce image for this exact product.`,
    `Product name: ${productData.name || 'Unknown product'}`,
    productData.description ? `Product description: ${productData.description}` : '',
    features.length ? `Product highlights: ${features.join(' | ')}` : '',
    price ? `Product price: ${price}` : '',
    variants ? `Product options: ${variants}` : '',
    visualStyle ? `Visual direction preset: ${visualStyle}. Keep its colour palette, lighting, composition language, and typography zone consistent for this image.` : '',
    'PRODUCT IDENTITY ANCHOR: The FIRST attached reference image is the canonical physical product. Match it exactly: silhouette, dimensions/proportions, construction, handle/fasteners, colour, material finish, logos, labels, and included pieces. Additional reference images only confirm other views. Never substitute, redesign, simplify, or create a generic product from its category.',
    'LANGUAGE MANDATE (CRITICAL): All text, headlines, badges, callouts, promotional tags, and dimension labels rendered inside the generated image MUST BE IN THAI LANGUAGE ONLY (ภาษาไทยเท่านั้น). Do not render any English words, pseudo-Latin, or gibberish text unless the brand name itself is explicitly in English.',
    'STRICT GRAPHIC RULE: NEVER render system metadata headings or label prefixes like "จุดเด่นสินค้า:", "ราคาที่ผู้ขายยืนยัน:", "Key features:", or "Confirmed price:". On COVER images, do NOT draw feature lists or specification callouts; draw ONLY high-impact hero product photography and optional clean Thai marketing slogan.',
    'Use the attached product reference images as the source of truth. Preserve the same product identity, shape, color, materials, logos/labels, and visible details. Improve only the scene, lighting, background, composition, and sales presentation. Do not invent a different product.',
    `Image task: ${taskPrompt}`,
  ].filter(Boolean).join('\n\n');
}

function buildCategoryPrompt(
  category: ImageCategory,
  productData: ProductData,
  style: string,
  styleIndex?: number,
): string {
  switch (category) {
    case ImageCategory.COVER: {
      if (['brand-ambassador', 'brand-ambassador-female', 'brand-ambassador-male'].includes(style)) {
        const presenter = style === 'brand-ambassador-male'
          ? 'one handsome, attractive, young Thai male brand ambassador (age 25–30 years old) with a confident bright smile, modern stylish hair, and glowing clear healthy skin'
          : style === 'brand-ambassador-female'
            ? 'one beautiful, attractive, young Thai female brand ambassador (age 23–28 years old) with a cheerful bright smile, modern stylish hair, and glowing clear healthy skin'
            : 'one beautiful, attractive, young Thai brand ambassador (age 23–30 years old) with a cheerful bright smile, modern stylish hair, and glowing clear healthy skin';
        const variations = [
          'Presenter on the right, product large in the lower-left foreground, graphic slogan badge container and feature pills in the upper-left.',
          'Presenter on the left gesturing naturally toward the product on the right, graphic headline banner tag and trust chips in the upper-right.',
          'Three-quarter product close-up in the foreground with the young presenter softly behind it, stylized graphic slogan banner in the top safe area.',
          'Presenter actively demonstrating the product in a relevant Thai lifestyle setting, product still larger than the presenter, infographic headline badge tag in a clean upper zone.',
        ];
        const variation = variations[((styleIndex || 1) - 1) % variations.length];
        return `Thai Marketplace Brand Ambassador product cover for "${productData.name}". Use exactly ${presenter} who naturally holds, uses, or introduces the exact reference product. The product must be the main purchase object: large, sharp, unobstructed, and faithful to the reference in shape, logo, colour, materials, proportions, labels, and included pieces. HIGH-IMPACT E-COMMERCE INFOGRAPHIC BADGE & GRAPHIC TEXT DESIGN: Render the main Thai slogan inside a vibrant rounded contrast badge pill, gradient banner tag, 3D sticker overlay, or stylized text container with subtle drop shadow and bold typography. Next to or below the main slogan, include 1-2 stylized graphic feature chips, star rating badges, or trust stickers (e.g. '🔥 ขายดีอันดับ 1', '✓ เกรดพรีเมียม', '⭐ 5 ดาว'). The typography and graphic elements must look like a professionally designed top-selling Shopee/Lazada product cover banner, NOT plain unstyled text on a wall. ${variation} On every regeneration change the pose, camera angle, composition, hook placement, and relevant props, while preserving the same product identity, young attractive brand-ambassador character, and campaign mood.`;
      }
      return `High-impact commercial E-Commerce COVER image (ภาพปกสินค้า) for "${productData.name}". Product Description: ${productData.description}. Visual Style: ${style}. Product is large and unmistakable in the foreground. INFOGRAPHIC GRAPHIC BADGE DESIGN: Main Thai headline styled inside a vibrant rounded gradient banner tag, contrast badge container, or 3D sticker overlay with drop-shadow typography, accompanied by 1-2 stylized feature pills (e.g. '🔥 ขายดีอันดับ 1', '✓ รับประกันคุณภาพ'). All text MUST be in THAI LANGUAGE ONLY (ภาษาไทยเท่านั้น). Professional studio lighting, sharp product details.`;
    }
    case ImageCategory.INFOGRAPHIC:
      return `Product infographic for "${productData.name}". ${productData.features?.join(' | ') || ''}. ALL TEXT CALLOUTS AND HEADLINES MUST BE IN THAI LANGUAGE ONLY (ภาษาไทยเท่านั้น). Clean flat design.`;
    case ImageCategory.CLOSE_UP:
      return `Macro extreme close-up shot of "${productData.name}". Focus on material texture and high-quality details. Soft bokeh background.`;
    case ImageCategory.LIFESTYLE_A:
      return `Lifestyle photography of "${productData.name}" being used by a Thai/Asian person inside a cozy home environment. Warm natural light.`;
    case ImageCategory.LIFESTYLE_B:
      return `Lifestyle photography of "${productData.name}" in an outdoor nature setting. Bright sunny day, fresh feel.`;
    case ImageCategory.LIFESTYLE_C:
      return `Lifestyle photography of "${productData.name}" in a modern urban setting.`;
    case ImageCategory.SIZE_CHART:
      return `Clean product size comparison chart for "${productData.name}". Dimension annotations and specifications MUST BE IN THAI LANGUAGE ONLY (ภาษาไทยเท่านั้น, เช่น ขนาดสินค้า, ซม., มม.).`;
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
