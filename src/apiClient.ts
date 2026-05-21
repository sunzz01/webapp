/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  API Client — Frontend client for Vercel Serverless Functions  ║
 * ║                                                                ║
 * ║  Calls /api/analyze, /api/generate, /api/summarize             ║
 * ║  Which proxy to Vertex AI (secure server-side auth)            ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import { ImageCategory, ImageGenerationResult, ProductData } from '../types';

// ═══════════════════════════════════════════════════════════════
//  Config
// ═══════════════════════════════════════════════════════════════

/**
 * Base URL for API calls.
 * - In production (Vercel): empty string (same origin)
 * - In development: set VITE_API_BASE_URL in .env (e.g., "http://localhost:3000")
 */
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// ═══════════════════════════════════════════════════════════════
//  Types (mirror server-side interfaces)
// ═══════════════════════════════════════════════════════════════

export interface ProductAnalysis {
  name: string;
  summary: string;
  features: string[];
  visualDescription: string;
}

// ═══════════════════════════════════════════════════════════════
//  Generic fetch wrapper with error handling
// ═══════════════════════════════════════════════════════════════

async function apiPost<T>(path: string, body: any): Promise<T> {
  const url = `${API_BASE}${path}`;
  console.log(`[ApiClient] POST ${url}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errorMsg = `API error ${response.status}`;
    try {
      const errBody = await response.json();
      errorMsg = errBody.error || errorMsg;
    } catch { /* ignore */ }
    throw new Error(errorMsg);
  }

  return response.json();
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
  return apiPost<ProductAnalysis>('/api/analyze', {
    productInfo,
    images,
  });
}

/**
 * Generate product image using Vertex AI.
 * Calls POST /api/generate-image
 */
export async function generateProductImage(
  category: ImageCategory,
  productData: ProductData,
  style: string,
  customPrompt?: string,
  imageModel?: string,
  aspectRatio: string = '1:1',
): Promise<ImageGenerationResult> {
  // Construct prompt based on category (simplified — full prompt construction
  // happens on client side using the same logic as before)
  let prompt = '';

  if (customPrompt) {
    prompt = customPrompt;
  } else {
    // Build category-specific prompt
    prompt = buildCategoryPrompt(category, productData, style);
  }

  const result = await apiPost<{
    imageUrl: string;
    promptUsed: string;
    model: string;
    textResponse?: string;
  }>('/api/generate-image', {
    prompt,
    images: productData.images,
    model: imageModel,
    aspectRatio,
    category,
    style,
    customPrompt,
  });

  // Build thaiTexts for reference
  const thaiTexts = extractThaiTexts(productData, category, style);
  if (result.textResponse) {
    thaiTexts.push(`AI อธิบาย: ${result.textResponse.substring(0, 300)}`);
  }

  return {
    imageUrl: result.imageUrl,
    promptUsed: result.promptUsed,
    thaiTexts,
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
  const result = await apiPost<{ summary: string }>('/api/summarize', {
    currentDesc,
    images,
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

// ─── INFOGRAPHIC Variations (6 สไตล์) ────────────────────────────
const INFOGRAPHIC_VARIATIONS_API = [
  (features: string[]) => `A modern flat-design product infographic. Bold gradient background (deep purple→electric blue, coral→sunrise orange, or emerald→lime). Product center-left (40%). Right: ${features.length} feature callout boxes with flat icons. Features: ${features.join(' | ')}. Flat design, no shadows, bold geometric shapes, vibrant accent colors. Thin decorative lines connecting icons. Bottom-right: "Quality Guaranteed" badge. Pure vector/flat aesthetic.`,
  (features: string[]) => `A premium dark-themed infographic. Deep charcoal background with subtle diagonal pattern. Product hero shot center. Around it: ${features.length} neon-glow accent rings highlighting each feature. Features: ${features.join(' | ')}. Dark luxury, neon accent (electric cyan, hot pink, or gold), thin glowing lines. Clean white text, monospace for specs. Subtle grid pattern, tech-forward aesthetic.`,
  (features: string[]) => `An editorial magazine-style infographic. Soft cream textured paper background. Product centered with generous white space. Features as elegant pull-quote callouts with thin gold dividers. Features: ${features.join(' | ')}. Serif heading + sans-serif body. Navy, gold, cream palette. "★ EDITOR'S PICK" stamp. Luxury magazine spread aesthetic.`,
  (features: string[]) => `An isometric 3D-style infographic. Soft pastel gradient background. Product in isometric perspective (30°). ${features.length} floating isometric cards around it. Features: ${features.join(' | ')}. Isometric illustration, soft drop shadows, rounded elements. Dotted connecting lines. Soft pastels with bold accent. Modern, friendly, approachable.`,
  (features: string[]) => `A split-color-block infographic. Canvas split diagonally into 2 contrasting blocks (e.g., deep navy + bright orange). Product on bold side. Features on lighter side with numbered circles. Features: ${features.join(' | ')}. Extra bold condensed sans-serif. Geometric accent shapes at split boundary. High-contrast, bold, attention-grabbing.`,
  (features: string[]) => `A minimalist data-driven infographic. Pure white background. Product top-center with subtle shadow. Below: ${features.length} horizontal feature bars with thin colored left border, icon, and description. Features: ${features.join(' | ')}. Ultra-clean sans-serif, single accent color (teal, coral, or violet). Maximum white space. Apple-like minimalism.`,
];

// ─── SIZE_CHART Variations (6 สไตล์) ─────────────────────────────
const SIZE_CHART_VARIATIONS_API = [
  (name: string) => `Clean product size comparison grid. Light gray background. Product from two angles (front + side). Dimension lines with measurements in cm/inches. Smartphone or hand silhouette for scale. Specs table: Length | Width | Height | Weight. Monospace numbers. Technical product sheet.`,
  (name: string) => `Lifestyle size visualization. Product in real-life context: held in hand, next to coffee mug, or on desk. Natural indoor setting. Subtle dimension annotations with thin lines. Warm natural tones. Real-world photo with professional callouts. NOT a technical diagram.`,
  (name: string) => `Technical blueprint size chart. Dark navy background with blueprint grid lines (light blue). Product as white outline technical drawing. Dimension arrows with precise labels. Top/side/front orthographic projections. Both metric and imperial. Monospace engineering font. White lines on dark blue, cyan text.`,
  (name: string) => `Fun playful size comparison. Vibrant gradient background. Product next to everyday objects (coins, credit card, AA battery, banana). Each with cute label. "Actual Size: XX cm" callout. Rounded playful font, bright colors (orange, pink, teal). Social media friendly. NOT technical.`,
  (name: string) => `Multi-variant size display. White background with subtle pattern. Product in 3 sizes side by side (S/M/L) at proportional scale. Below each: dimensions, weight, use case. Color-coded badges (green=small, blue=medium, orange=large). Easy to compare at a glance.`,
  (name: string) => `Flat-lay size chart. White surface or light wood table. Product with physical ruler/tape measure alongside. Hand entering frame for scale. Common objects nearby (pen, phone). Thin measurement line overlays. Instagram flat-lay aesthetic with measurement info.`,
];

// ─── SOCIAL_PROOF Default Variations (4 สไตล์) ───────────────────
const SOCIAL_PROOF_VARIATIONS_API = [
  (name: string) => `Customer review collage. Soft gradient background (warm peach to cream). Product center with glowing halo. 3-4 floating review cards with star ratings (4.8★, 5★). Quotes: "Amazing quality!", "Fast shipping!". Counter: "2,847 happy customers". Warm, trustworthy. Gold stars.`,
  (name: string) => `Trust badge display. Deep navy/forest green background. Product on pedestal. Floating trust badges in circle: "✓ 100% Authentic", "⭐ Top Rated", "🚚 Fast Delivery", "🔄 Easy Returns". Large "4.9★" rating with review distribution bar. White text, gold accents. Premium trust-building.`,
  (name: string) => `Before/after comparison. Split design — left gray/muted, right vibrant. "Without" left, "With ${name}" right. Bold "VS" divider. Bottom: "Sold 5,000+" counter. High contrast, persuasive marketing visual.`,
  (name: string) => `Social media testimonial. Instagram gradient background (pink→purple→blue). Product with "Most Loved" badge. Floating hearts, comment bubbles, "Saved 1.2K". Mock "4.9/5" rating. User avatar thumbnails with reviews. Vibrant, FOMO-inducing, trendy.`,
];

// ─── TUTORIAL Variations (6 สไตล์) ───────────────────────────────
const TUTORIAL_VARIATIONS_API = [
  (steps: string[]) => `Clean 2×2 grid tutorial. Each cell: one step with product photo, numbered circle badge (1-4). Step 1: ${steps[0]}. Step 2: ${steps[1]}. Step 3: ${steps[2]}. Step 4: ${steps[3]}. White backgrounds, consistent lighting, thin borders. Accent color for badges (teal, coral, or violet). Modern e-commerce tutorial.`,
  (steps: string[]) => `Horizontal timeline infographic. Soft gradient background. 4 steps left-to-right connected by dotted timeline. Step 1: ${steps[0]}. Step 2: ${steps[1]}. Step 3: ${steps[2]}. Step 4: ${steps[3]}. Circular photos + number badges, alternating above/below. Electric blue, coral, or emerald timeline.`,
  (steps: string[]) => `Magazine editorial how-to guide. Textured paper background. Staggered editorial layout. Step 1: ${steps[0]}. Step 2: ${steps[1]}. Step 3: ${steps[2]}. Step 4: ${steps[3]}. Serif headings + sans-serif descriptions. Asymmetric layout, gold dividers. Muted earth tones. Sophisticated magazine spread.`,
  (steps: string[]) => `Dark tech-style guide. Dark charcoal background with hex grid. S-curve layout, glowing cards. Step 1: ${steps[0]}. Step 2: ${steps[1]}. Step 3: ${steps[2]}. Step 4: ${steps[3]}. Neon glow (cyan/purple/green) on numbers and lines. Geometric sans-serif. Futuristic dark UI.`,
  (steps: string[]) => `Hand-drawn sketch tutorial. Kraft paper texture. Organic layout with hand-drawn arrows. Step 1: ${steps[0]}. Step 2: ${steps[1]}. Step 3: ${steps[2]}. Step 4: ${steps[3]}. Sketch borders, handwritten font, doodle decorations. Pencil gray + marker accent. DIY craft aesthetic.`,
  (steps: string[]) => `Vertical story-style tutorial. Bold connecting arrows downward. Step 1: ${steps[0]}. Step 2: ${steps[1]}. Step 3: ${steps[2]}. Step 4: ${steps[3]}. Extra bold sans-serif, large step numbers as watermarks (01-04). Vibrant gradient (orange→pink→purple→blue). Social media native, TikTok aesthetic.`,
];

function buildCategoryPrompt(
  category: ImageCategory,
  productData: ProductData,
  style: string,
): string {
  switch (category) {
    case ImageCategory.COVER:
      return `Generate a new COVER image for "${productData.name}". Product Description: ${productData.description}. Style: ${style}. Professional product photography, high quality, commercial grade.`;
    case ImageCategory.INFOGRAPHIC:
      return pickRandom(INFOGRAPHIC_VARIATIONS_API)(productData.features);
    case ImageCategory.CLOSE_UP:
      return `Macro extreme close-up shot of the product. Focus on material texture and high-quality details. Soft bokeh background, professional studio lighting.`;
    case ImageCategory.LIFESTYLE_A:
      return `Lifestyle photography of the product being used by a person inside a cozy home environment. Warm natural light, realistic setting.`;
    case ImageCategory.LIFESTYLE_B:
      return `Lifestyle photography of the product in an outdoor nature setting. Bright sunny day, organic textures, adventurous and fresh feel.`;
    case ImageCategory.LIFESTYLE_C:
      return `Lifestyle photography of the product in a professional urban setting. Modern architecture, clean lines, corporate background.`;
    case ImageCategory.SIZE_CHART:
      return pickRandom(SIZE_CHART_VARIATIONS_API)(productData.name);
    case ImageCategory.SOCIAL_PROOF:
      return pickRandom(SOCIAL_PROOF_VARIATIONS_API)(productData.name);
    case ImageCategory.TUTORIAL:
      return pickRandom(TUTORIAL_VARIATIONS_API)(['Unboxing/Prepare', 'Setup/Install', 'Usage', 'Result']);
    default:
      return `Generate a product image for "${productData.name}". ${productData.description}. Professional quality.`;
  }
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
