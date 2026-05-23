/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  API Client — Frontend client for Vercel Serverless Functions  ║
 * ║                                                                ║
 * ║  Calls /api/analyze, /api/generate, /api/summarize             ║
 * ║  Which proxy to Vertex AI (secure server-side auth)            ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import { ImageCategory, ImageGenerationResult, ProductData } from '../types';
import { buildImageGenerationPrompt } from './imagePromptBuilder';
import { auth } from './firebase';

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

// ═══════════════════════════════════════════════════════════════
//  Types (mirror server-side interfaces)
// ═══════════════════════════════════════════════════════════════

export interface ProductAnalysis {
  name: string;
  summary: string;
  features: string[];
  visualDescription: string;
}

const estimateBase64Bytes = (value: string): number => Math.ceil((value.length * 3) / 4);

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

async function prepareImagesForApi(images?: string[], maxImages: number = 4): Promise<string[] | undefined> {
  if (!images?.length) return undefined;
  const sourceImages = images.filter(Boolean).slice(0, maxImages);
  const compressionProfiles = [
    { maxEdge: 900, qualitySteps: [0.72, 0.62, 0.52, 0.44] },
    { maxEdge: 720, qualitySteps: [0.64, 0.54, 0.46, 0.38] },
    { maxEdge: 560, qualitySteps: [0.56, 0.48, 0.4, 0.34] },
    { maxEdge: 420, qualitySteps: [0.48, 0.4, 0.34, 0.28] },
  ];

  let bestEffort: string[] = [];
  for (const profile of compressionProfiles) {
    const prepared = await Promise.all(
      sourceImages.map((image) => shrinkImageForApi(image, profile.maxEdge, profile.qualitySteps)),
    );
    const totalBytes = prepared.reduce((sum, image) => sum + estimateBase64Bytes(image), 0);
    bestEffort = prepared;

    if (totalBytes <= MAX_API_PAYLOAD_BYTES) {
      return prepared;
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

  return packed.length ? packed : undefined;
}

// ═══════════════════════════════════════════════════════════════
//  Generic fetch wrapper with error handling
// ═══════════════════════════════════════════════════════════════

async function apiPost<T>(path: string, body: any): Promise<T> {
  const url = `${API_BASE}${path}`;
  console.log(`[ApiClient] POST ${url}`);
  const token = await auth.currentUser?.getIdToken();

  if (!token) {
    throw new Error('กรุณาเข้าสู่ระบบก่อนใช้งาน AI');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const contentType = response.headers.get('content-type') || '';
  const rawBody = await response.text();
  const trimmedBody = rawBody.trim();
  const looksLikeHtml = /^<!doctype\s+html/i.test(trimmedBody) || /^<html[\s>]/i.test(trimmedBody);
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
      errorMsg = 'รูปภาพที่ส่งไปยัง AI มีขนาดใหญ่เกินไป กรุณาลองใช้รูปน้อยลงหรือรูปที่เล็กลง';
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
  const apiImages = await prepareImagesForApi(images, 4);
  return apiPost<ProductAnalysis>('/api/analyze', {
    productInfo,
    images: apiImages,
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
): Promise<ImageGenerationResult> {
  const prompt = buildImageGenerationPrompt(
    category,
    productData,
    style,
    customPrompt,
    styleIndex,
  );

  const apiImages = await prepareImagesForApi(productData.images, 3);
  const result = await apiPost<{
    imageUrl: string;
    promptUsed: string;
    model: string;
    textResponse?: string;
    thaiTextPlan?: string[];
    requestedModel?: string;
    fallbackNotice?: string;
    fallbackEvents?: Array<{ model: string; success: boolean; message?: string }>;
  }>('/api/generate', {
    prompt,
    images: apiImages,
    model: imageModel,
    aspectRatio,
    category,
    style,
    customPrompt,
    productData,
  });

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
    requestedModel: result.requestedModel || imageModel,
    fallbackNotice: result.fallbackNotice,
    fallbackEvents: result.fallbackEvents,
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
  const apiImages = await prepareImagesForApi(images, 3);
  const result = await apiPost<{ summary: string }>('/api/summarize', {
    currentDesc,
    images: apiImages,
    summaryLength,
  });
  return result.summary;
}

// ═══════════════════════════════════════════════════════════════
//  Thai Text Extractor (for reference overlays)
// ═══════════════════════════════════════════════════════════════

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
      } else if (['tiktok', 'tiktok02'].includes(s)) {
        texts.push('Hook: ราคานี้ห้ามพลาด!');
        texts.push('ป้าย: TikTok Shop | ซื้อเลย');
        texts.push('ราคา: ฿เดิม → ฿ลด');
        texts.push('#TikTokShop #FlashSale');
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
