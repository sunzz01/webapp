import { GoogleGenAI, Type } from "@google/genai";
import { ImageCategory, ImageGenerationResult, ProductData } from "./types";
import {
  analyzeProduct as apiAnalyzeProduct,
  generateProductImage as apiGenerateProductImage,
  summarizeProductDescription as apiSummarizeProductDescription,
  type ProductAnalysis as ApiProductAnalysis,
} from "./src/apiClient";

// ═══════════════════════════════════════════════════════════════
//  MODE DETECTION — Vertex AI (API) vs Direct Gemini (Dev)
// ═══════════════════════════════════════════════════════════════
/**
 * In production, all AI calls go through serverless API routes.
 * In development, set VITE_USE_VERTEX_AI=true or VITE_API_BASE_URL to test that path.
 * all AI calls go through our serverless API → Vertex AI (secure).
 * When not set, falls back to direct Gemini API key mode (development).
 */
const USE_VERTEX_AI = !!(
  import.meta.env.PROD ||
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_USE_VERTEX_AI === 'true'
);
console.log(`[geminiService] Mode: ${USE_VERTEX_AI ? '🌐 Vertex AI (Serverless API)' : '🔑 Direct Gemini API (Dev)'}`);


// ╔══════════════════════════════════════════════════════════════════╗
// ║  🏗️ MODEL REGISTRY — ศูนย์กลางจัดการโมเดล AI                     ║
// ║  ★ เมื่อ Google เปลี่ยนชื่อโมเดล → แก้ไขที่นี่เพียงจุดเดียว ★       ║
// ╚══════════════════════════════════════════════════════════════════╝

/**
 * Registry กลางสำหรับชื่อโมเดล — แก้ที่นี่ที่เดียวเมื่อ Google เปลี่ยนชื่อ
 * ลำดับ = ลำดับ fallback (ตัวแรก = ลองก่อน)
 */
export const MODEL_REGISTRY = {
  /** โมเดลสำหรับวิเคราะห์ข้อความ / Structured JSON */
  text: [
    'gemini-3-flash-preview',   // ล่าสุด (2026)
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
  ],
  /**
   * โมเดลสำหรับสร้างรูปภาพ (Nano Banana Image Generation)
   * ชื่อจาก Official Docs: https://ai.google.dev/gemini-api/docs/image-generation
   * 
   * gemini-2.5-flash-image        = Nano Banana (Free, ~500 img/day)
   * gemini-3.1-flash-image-preview = Nano Banana 2 (Free, ล่าสุด)
   * gemini-3-pro-image-preview     = Nano Banana Pro (Paid only)
   * imagen-3.0-generate-001        = Imagen 3 Standard (ใช้ generateImages API แยก)
   */
  image: [
    'gemini-3.1-flash-image-preview',
    'gemini-2.5-flash-image',
    'gemini-3-pro-image-preview',
    'imagen-3.0-generate-002',       // Imagen 3 Standard (ใช้ generateImages API — fallback ท้ายสุด)
    'imagen-3.0-fast-generate-001',  // Imagen 3 Fast
  ],
};

/** สร้าง model chain: model ที่เลือก + fallbacks (ไม่ซ้ำ) */
function buildModelChain(selectedModel: string, fallbacks: string[]): string[] {
  const chain = [selectedModel];
  for (const m of fallbacks) {
    if (!chain.includes(m)) chain.push(m);
  }
  return chain;
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║  🎲 PROMPT VARIATION ENGINE — สุ่ม prompt เพื่อความหลากหลาย    ║
// ╚══════════════════════════════════════════════════════════════════╝

/** สุ่มเลือก 1 รายการจาก array */
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

// ─── INFOGRAPHIC Variations (6 สไตล์) ────────────────────────────
const INFOGRAPHIC_VARIATIONS = [
  // 1. Modern Flat — พื้นหลัง gradient สดใส + icon แบน
  (features: string) => `
    A modern flat-design product infographic. Bold gradient background (choose one: deep purple→electric blue, coral→sunrise orange, emerald→lime).
    Product placed center-left (40% of canvas). Right side: ${features.length} feature callout boxes with rounded corners, each with a flat icon and short text.
    Feature highlights: ${features.join(" | ")}.
    Visual style: flat design, no shadows, bold geometric shapes, clean sans-serif typography, vibrant accent colors.
    Add thin decorative lines connecting icons. Bottom-right: small "Quality Guaranteed" badge.
    NO 3D effects. NO realistic photos. Pure vector/flat aesthetic.`,

  // 2. Dark Premium — พื้นดำ + accent สีทอง/นีออน
  (features: string) => `
    A premium dark-themed infographic. Background: deep charcoal (#1a1a2e) with subtle diagonal stripe pattern or mesh gradient.
    Product image hero shot center, slightly angled. Around it: ${features.length} neon-glow accent rings or circles highlighting each feature.
    Features: ${features.join(" | ")}.
    Style: dark luxury, neon accent colors (electric cyan, hot pink, or gold), thin glowing lines connecting elements.
    Typography: clean white text, thin weight for labels, bold for product name. Small spec data in monospace font.
    Add: subtle grid pattern, tech-forward aesthetic. NO busy backgrounds. Sleek and minimal dark UI.`,

  // 3. Magazine/Editorial — สไตล์นิตยสาร
  (features: string) => `
    An editorial magazine-style product infographic. Background: soft cream or off-white textured paper feel.
    Product photo centered with generous white space. Features arranged as elegant pull-quote callouts with thin gold divider lines.
    Features: ${features.join(" | ")}.
    Typography: mix of serif heading (Georgia/Playfair Display) and sans-serif body. Muted color palette: navy, gold, cream.
    Layout: asymmetric editorial grid, generous margins. Include a subtle "★ EDITOR'S PICK" or "★ TOP RATED" stamp.
    Aesthetic: luxury magazine spread, sophisticated, editorial design. NOT a sales flyer.`,

  // 4. Isometric 3D — สไตล์ isometric
  (features: string) => `
    An isometric 3D-style product infographic. Background: soft pastel gradient (mint green, soft pink, or light lavender).
    Product shown in isometric perspective (30° angle). Around it: ${features.length} floating isometric cards/badges for each feature.
    Features: ${features.join(" | ")}.
    Style: isometric illustration, soft drop shadows, rounded elements, playful but professional.
    Use connecting dotted lines or arrows from product to feature cards. Each card has a small icon + text.
    Color palette: soft pastels with one bold accent color. Modern, friendly, approachable. NOT flat, NOT photorealistic.`,

  // 5. Split Color Block — แบ่งซีกสี
  (features: string) => `
    A split-color-block infographic. Canvas divided diagonally or vertically into 2 contrasting color blocks (e.g., deep navy + bright orange, black + electric yellow).
    Product on the bold-color side (large, hero placement). Features on the lighter side, listed vertically with numbered circles.
    Features: ${features.join(" | ")}.
    Typography: extra bold condensed sans-serif for headings, clean regular weight for details.
    Add: geometric accent shapes (triangles, circles, lines) at the split boundary.
    Style: high-contrast, bold, attention-grabbing, modern graphic design. NOT soft, NOT pastel.`,

  // 6. Minimalist Data — ข้อมูลเยอะ สไตล์มินิมอล
  (features: string) => `
    A minimalist data-driven infographic. Background: pure white (#FFFFFF). Product photo top-center, clean with subtle shadow.
    Below: ${features.length} horizontal feature bars, each with a thin colored left border, icon, and one-line description.
    Features: ${features.join(" | ")}.
    Typography: ultra-clean sans-serif (Helvetica Neue / Inter), 2 weights only (regular + bold). Color: single accent (choose: teal, coral, or violet) + black text.
    Add: thin horizontal rules, generous spacing, breathing room. Small "✓ Verified" checkmarks.
    Style: Apple-like minimalism, information hierarchy through spacing not decoration. Maximum white space.`,
];

// ─── SIZE_CHART Variations (6 สไตล์) ─────────────────────────────
const SIZE_CHART_VARIATIONS = [
  // 1. Clean Comparison Grid
  (productName: string) => `
    A clean product size comparison grid. Background: light gray (#F5F5F5).
    Product centered, shown from two angles (front + side). Around it: dimension lines with measurements in cm and inches.
    Include a human hand silhouette or smartphone outline as universal size reference placed next to the product.
    Add a small specs table at bottom: Length | Width | Height | Weight.
    Typography: precise, monospace for numbers. Color: dark gray text, one accent color for dimension lines.
    Style: technical product sheet, clean and precise, white measurement lines on gray background.`,

  // 2. Lifestyle Scale Shot
  (productName: string) => `
    A lifestyle-based size visualization. Product shown in real-life context for scale: held in a person's hand, placed on a desk next to a coffee mug, or worn on a person.
    Background: natural indoor setting (home office, kitchen counter, living room table). Natural lighting.
    Include: subtle dimension annotations overlaid with thin lines and measurement text (e.g., "25cm", "350g").
    Color palette: warm natural tones. Typography: clean sans-serif annotations with semi-transparent white background boxes.
    Style: real-world photo with professional dimension callouts. NOT a technical diagram. Approachable and easy to understand.`,

  // 3. Technical Blueprint
  (productName: string) => `
    A technical blueprint-style size chart. Background: dark navy (#0D1B2A) with blueprint grid lines (light blue #1B4965).
    Product shown as technical line drawing (white outline, no fill). Dimension arrows pointing to key measurements with precise labels.
    Include: top view, side view, and front view as small orthographic projections.
    Measurement data in both metric (cm/kg) and imperial (in/lb). Add a 10cm reference scale bar.
    Typography: monospace engineering font. Color: white lines on dark blue, dimension text in bright cyan.
    Style: engineering blueprint / CAD drawing aesthetic. Technical, precise, professional.`,

  // 4. Fun Comparison Infographic
  (productName: string) => `
    A fun, playful size comparison infographic. Background: vibrant gradient or patterned (polka dots, stripes).
    Product shown next to everyday objects for scale: stacked coins, credit card, AA battery, tennis ball, banana — arranged as a horizontal comparison line.
    Each object has a cute label with its size. Product's size highlighted with a bold callout: "Actual Size: XX cm".
    Typography: rounded playful font, bold colors. Add fun icons, arrows, and "WOW" speech bubbles.
    Color palette: bright and cheerful (orange, pink, teal). Style: casual, friendly, NOT technical. Target: social media friendly.`,

  // 5. Infographic with Size Variants
  (productName: string) => `
    A multi-variant size display. Background: clean white with subtle geometric pattern.
    Show the product in 3 sizes side by side (S, M, L or Small/Medium/Large) at actual proportional scale.
    Below each: dimensions, weight, and recommended use case. A bold arrow or ruler spanning across all three showing the size range.
    Typography: modern sans-serif, clear size labels (S/M/L) in large bold text.
    Color: neutral base with color-coded size badges (green=small, blue=medium, orange=large).
    Style: e-commerce product page layout, professional, easy to compare at a glance.`,

  // 6. Flat Lay with Ruler
  (productName: string) => `
    A flat-lay photograph style size chart. Background: clean white surface or light wood table.
    Product placed flat with a physical ruler/tape measure alongside it. Measurements clearly visible.
    Include: a hand entering the frame for scale (fingers visible), common objects (pen, phone, wallet) arranged nearby.
    Annotations: thin lines with measurement text overlay, semi-transparent background.
    Typography: clean, small caption-style text. Lighting: bright, even, overhead studio lighting.
    Style: Instagram flat-lay aesthetic with informative measurement overlay. Authentic yet informative.`,
];

// ─── SOCIAL_PROOF Default Variations (4 สไตล์ — ใช้เมื่อไม่ได้เลือก style) ─
const SOCIAL_PROOF_DEFAULT_VARIATIONS = [
  (productName: string) => `
    A customer review collage image. Background: soft gradient (warm peach to cream).
    Center: the product with a glowing halo effect. Around it: 3-4 floating review card snippets with star ratings (4.8★, 5★, 4.9★).
    Review quotes: "Amazing quality!", "Fast shipping!", "Exactly as described!", "Will buy again!".
    Bottom: a row of diverse customer avatar thumbnails (small circles) with a counter: "2,847 happy customers".
    Style: warm, trustworthy, social proof focused. Colors: gold stars, warm tones, white cards with subtle shadows.`,

  (productName: string) => `
    A trust badge and certification display. Background: deep navy blue or forest green.
    Center: the product on a pedestal or platform. Surrounding it: floating trust badges in a circular arrangement.
    Badges: "✓ 100% Authentic", "⭐ Top Rated", "🚚 Fast Delivery", "🔄 Easy Returns", "💳 Secure Payment".
    Add: a large "4.9★" rating display with a progress bar showing review distribution (5★: 85%, 4★: 10%, etc.).
    Typography: white text on dark background, gold accent for stars. Style: premium, trust-building, security-focused.`,

  (productName: string) => `
    A before/after or comparison social proof image. Background: split design — left side gray/muted, right side vibrant/colorful.
    Left: "Without [product]" — generic alternatives, empty space, dull colors.
    Right: "With ${productName}" — the product in use, vibrant, happy context, bright colors.
    Center divider: bold arrow or "VS" badge. Bottom: a counter badge "Sold 5,000+ units" with upward trend arrow.
    Typography: bold contrasting text for "VS", clean labels for each side.
    Style: dramatic comparison, high contrast, persuasive marketing visual.`,

  (productName: string) => `
    A social media style testimonial image. Background: Instagram-style gradient (pink → purple → blue).
    Center: the product with a "Most Loved" or "Trending Now" badge.
    Around it: floating social media UI elements — hearts ❤️, comment bubbles, share icons, "Saved 1.2K times".
    Bottom: a mock "4.9 out of 5" rating with filled gold stars, and "Based on 3,000+ reviews".
    Add: small user avatar thumbnails in a horizontal scroll, each with a 1-line review.
    Style: social media native aesthetic, vibrant, engaging, FOMO-inducing. Young and trendy.`,
];

// ─── TUTORIAL Variations (6 สไตล์) ───────────────────────────────
const TUTORIAL_VARIATIONS = [
  // 1. Clean 2×2 Grid (คลาสสิก แต่ปรับปรุง)
  (steps: string[]) => `
    A clean 2×2 grid tutorial image. Each cell shows one step with the product.
    Top-left (Step 1): ${steps[0]}
    Top-right (Step 2): ${steps[1]}
    Bottom-left (Step 3): ${steps[2]}
    Bottom-right (Step 4): ${steps[3]}
    Each panel: numbered circle badge (1-4) in top-left corner, clean white background, natural product photography.
    Style: modern e-commerce tutorial, consistent lighting across panels, thin border separating panels.
    Accent color: choose one (teal, coral, or violet) for number badges and connecting arrow icons between panels.`,

  // 2. Horizontal Timeline — แนวนอน timeline
  (steps: string[]) => `
    A horizontal step-by-step timeline infographic. Background: soft gradient (white to light blue or cream to peach).
    4 steps arranged left to right, connected by a bold dotted timeline line with arrow.
    Step 1: ${steps[0]}
    Step 2: ${steps[1]}
    Step 3: ${steps[2]}
    Step 4: ${steps[3]}
    Each step: circular product photo + number badge + short label below. Alternating positions (above/below timeline) for visual interest.
    Style: modern process infographic, clean icons, bold accent color for timeline (choose: electric blue, coral, or emerald). NOT a boring horizontal strip.`,

  // 3. Magazine Spread — สไตล์นิตยสาร
  (steps: string[]) => `
    A magazine editorial-style how-to guide. Background: textured paper (cream/off-white).
    4 steps in a staggered editorial layout — not a rigid grid. Each step has a product photo with elegant serif caption.
    Step 1: ${steps[0]}
    Step 2: ${steps[1]}
    Step 3: ${steps[2]}
    Step 4: ${steps[3]}
    Typography: mix of serif headings (Playfair Display style) and light sans-serif descriptions. Number labels in decorative serif.
    Layout: asymmetric, magazine spread feel with generous white space. Thin gold divider lines between sections.
    Color: muted earth tones, gold accents. Style: sophisticated, editorial, premium lifestyle magazine.`,

  // 4. Dark Tech Style — สไตล์เทคโนโลยี
  (steps: string[]) => `
    A dark-themed tech-style step guide. Background: dark charcoal (#1E1E2E) with subtle hexagonal grid pattern.
    4 steps arranged in a flowing S-curve or diagonal layout. Each step has a glowing card with product image and step description.
    Step 1: ${steps[0]}
    Step 2: ${steps[1]}
    Step 3: ${steps[2]}
    Step 4: ${steps[3]}
    Accent: neon glow effect (cyan, electric purple, or neon green) on step numbers and connecting lines.
    Typography: modern geometric sans-serif, white text, thin weight for descriptions. Add subtle scan-line or circuit-board texture.
    Style: futuristic, tech-forward, premium dark UI. NOT colorful. NOT bright.`,

  // 5. Hand-drawn / Sketch — สไตล์วาดมือ
  (steps: string[]) => `
    A playful hand-drawn sketch style tutorial. Background: kraft paper texture or lined notebook paper.
    4 steps arranged organically (not rigid grid), connected by hand-drawn arrows and doodle decorations.
    Step 1: ${steps[0]}
    Step 2: ${steps[1]}
    Step 3: ${steps[2]}
    Step 4: ${steps[3]}
    Style elements: sketch borders around each photo, hand-written-style font, doodle stars and circles, pencil/ink illustration feel.
    Colors: pencil gray, one accent (marker red or highlighter yellow). Add tape/sticker effects on photo corners.
    Style: DIY craft aesthetic, warm, approachable, Instagram-worthy handmade feel. NOT corporate, NOT techy.`,

  // 6. Vertical Scroll Story — สไตล์ Story/Reels
  (steps: string[]) => `
    A vertical mobile-story style tutorial (9:16 portrait orientation feel even if square canvas).
    4 steps stacked vertically with bold connecting arrows pointing downward. Each step: large product photo with overlay step number.
    Step 1: ${steps[0]}
    Step 2: ${steps[1]}
    Step 3: ${steps[2]}
    Step 4: ${steps[3]}
    Typography: extra bold modern sans-serif, large step numbers (01, 02, 03, 04) as background watermarks.
    Color: vibrant gradient background transitioning through steps (e.g., orange→pink→purple→blue).
    Add: swipe-up arrow icon at bottom. Style: social media native, TikTok/Instagram Reels aesthetic, bold and eye-catching.`,
];

// ╔══════════════════════════════════════════════════════════════════╗
// ║  🔑 API KEY MANAGER — จัดการหลาย API Keys + Auto-Rotation      ║
// ╚══════════════════════════════════════════════════════════════════╝

const EXHAUSTED_COOLDOWN_MS = 60_000; // 60 วินาที cooldown ก่อน retry key ที่หมดโควต้า
const exhaustedKeyMap = new Map<string, number>();

/** ดึง API keys ทั้งหมดจาก localStorage / env (ใช้จาก UI ได้) */
export function getApiKeys(): string[] {
  // 1. Multi-key format (ใหม่)
  try {
    const raw = localStorage.getItem('gemini_api_keys');
    if (raw) {
      const arr = JSON.parse(raw) as string[];
      const valid = arr.filter((k: string) => k?.trim());
      if (valid.length > 0) return valid;
    }
  } catch { /* ignore parse error */ }

  // 2. Single key (legacy/backward compat)
  const single = localStorage.getItem('gemini_api_key');
  if (single?.trim()) return [single.trim()];

  // 3. Environment variable
  const env = import.meta.env.VITE_GEMINI_API_KEY;
  if (env?.trim()) return [env.trim()];

  return [];
}

/** ดึงเฉพาะ keys ที่ยังมีโควต้า */
function getAvailableKeys(): string[] {
  const now = Date.now();
  for (const [key, ts] of exhaustedKeyMap.entries()) {
    if (now - ts > EXHAUSTED_COOLDOWN_MS) exhaustedKeyMap.delete(key);
  }
  const all = getApiKeys();
  const available = all.filter(k => !exhaustedKeyMap.has(k));
  return available.length > 0 ? available : all;
}

function markKeyExhausted(key: string): void {
  exhaustedKeyMap.set(key, Date.now());
  console.warn(`[ApiKeyManager] Key ...${key.slice(-6)} exhausted (cooldown ${EXHAUSTED_COOLDOWN_MS / 1000}s)`);
}

/** Export สำหรับ UI — ดูสถานะ key แต่ละตัว */
export function getKeyStatuses(): { key: string; exhausted: boolean }[] {
  return getApiKeys().map(k => ({ key: k, exhausted: exhaustedKeyMap.has(k) }));
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║  🔄 SMART RETRY ENGINE — Auto-rotate Keys + Models             ║
// ╚══════════════════════════════════════════════════════════════════╝

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isQuotaError = (m: string) => /429|QUOTA|RESOURCE_EXHAUSTED|credits.*depleted|Too Many Requests|rate.?limit/i.test(m);
const isModelNotFound = (m: string) => /404|not.?found|NOT_FOUND|does not exist|unsupported model|INVALID_ARGUMENT|does not support/i.test(m);
const isRetryable = (m: string) => /503|UNAVAILABLE|high demand|overloaded|INTERNAL|deadline/i.test(m);

/**
 * Smart retry ที่หมุนเวียนทั้ง API Keys และ Models อัตโนมัติ
 *
 * ลำดับการทำงาน:
 * 1. ลอง model ที่เลือก + key ปัจจุบัน
 * 2. ถ้า 429 → mark key exhausted → ลอง key ถัดไป (model เดิม)
 * 3. ถ้า key หมดทุกตัว → ลอง model ถัดไป
 * 4. ถ้า 404 → ข้ามไป model ถัดไปทันที
 * 5. ถ้า 503 → retry ด้วย exponential backoff
 */
async function smartRetry<T>(
  callFn: (model: string, ai: GoogleGenAI) => Promise<T>,
  models: string[],
  maxRetries: number = 2
): Promise<T> {
  const keys = getAvailableKeys();
  if (keys.length === 0) {
    throw new Error('ไม่พบ API Key — กรุณาเพิ่ม Gemini API Key ในการตั้งค่า (⚙️ Settings)');
  }

  let lastError: any;
  const tried: string[] = [];

  for (const model of models) {
    let skipModel = false;
    for (const key of keys) {
      if (skipModel) break;
      const ai = new GoogleGenAI({ apiKey: key });
      const kLabel = `...${key.slice(-6)}`;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[SmartRetry] model="${model}" key=${kLabel} attempt=${attempt + 1}`);
          const result = await callFn(model, ai);
          console.log(`[SmartRetry] ✅ Success: model="${model}" key=${kLabel}`);
          return result;
        } catch (err: any) {
          lastError = err;
          const msg = err?.message || String(err);
          tried.push(`${model}+${kLabel}`);

          if (isQuotaError(msg)) {
            console.warn(`[SmartRetry] ⚠️ Quota: key=${kLabel} model="${model}"`);
            markKeyExhausted(key);
            break; // → next key
          }
          if (isModelNotFound(msg)) {
            console.warn(`[SmartRetry] ❌ Model "${model}" not found, skipping...`);
            skipModel = true;
            break; // → next model
          }
          if (!isRetryable(msg)) throw err;

          console.warn(`[SmartRetry] 🔄 Retry ${attempt + 1}/${maxRetries + 1}`);
          if (attempt < maxRetries) await delay(1000 * (attempt + 1));
        }
      }
    }
  }

  // ทุก combination ล้มเหลว
  const detail = lastError?.message || 'Unknown error';

  // ตรวจสอบว่าเป็น quota error หรือไม่
  const isQuota = isQuotaError(detail);

  throw new Error(
    `ลองแล้ว ${tried.length} ครั้ง ไม่สำเร็จ\n` +
    `Models: ${models.join(', ')}\n` +
    `Keys: ${keys.length} ตัว\n` +
    `Error: ${detail}\n\n` +
    (isQuota
      ? `🚨 โควต้า API KEY หมด!\n\n` +
        `🔑 วิธีแก้:\n` +
        `   1. ไปที่ https://aistudio.google.com/apikey 🔗\n` +
        `   2. สร้าง API Key ใหม่ (ฟรี)\n` +
        `   3. เพิ่ม Key ใหม่ที่ Settings ⚙️\n\n` +
        `⏱️ หรือรอประมาณ 1 นาที แล้วลองใหม่ (cooldown)\n` +
        `📱 โควต้าฟรี Google: ~500 ภาพ/วัน\n`
      : `💡 วิธีแก้:\n` +
        `• เพิ่ม API Key ใหม่ในการตั้งค่า (⚙️)\n` +
        `• ตรวจสอบโควต้าที่ https://ai.google.dev/gemini-api/docs/rate-limits\n` +
        `• รอ 1 นาทีแล้วลองใหม่`)
  );
}

/**
 * 
 * Helper function to generate structured prompts for product photography
 * based on the selected e-commerce style.
 */
const generateStructuredPrompt = (productName: string, style: string): string => {
  const baseStructure = {
    composition: '',
    subject: `${productName}, professional product photography`,
    technical: 'studio lighting, sharp focus, 8K resolution, commercial photography',
    styleElements: '',
    negative: 'blurry, low quality, watermark, cropped, distorted'
  };

  const styleGuides: Record<string, { composition: string; styleElements: string; negative: string }> = {
    'alibaba': {
      composition: 'centered product, rule of thirds for badge placement, 70% product 30% context',
      styleElements: `
        - Background: solid gradient (red to orange or blue to navy)
        - Top-right corner: gold shield badge with "Verified Supplier" text
        - Industrial context: subtle factory/warehouse blur in background
        - Color palette: #FF6B00 (Alibaba orange), #FFFFFF, #FFD700 (gold)
        - Typography: Bold sans-serif, 72pt for badges
        - Add: small "MOQ: 100 units" tag bottom-left
      `,
      negative: 'consumer-facing, playful, pastel colors, handwritten fonts'
    },
    'aliexpress': {
      composition: 'main product center, 4 smaller detail shots arranged in corners, clean grid layout',
      styleElements: `
        - Background: pure white (#FFFFFF), subtle shadow beneath product
        - Top banner: thin red stripe with "Free Shipping" icon (24px)
        - Bottom right: "2 Year Warranty" badge with shield icon
        - Detail shots: macro textures, 360° rotation angles, packaging view
        - Lighting: 3-point studio setup, soft shadows
        - Add: small star rating (4.8★) with review count
      `,
      negative: 'cluttered, busy background, heavy text overlay, cartoon style'
    },
    'etsy': {
      composition: 'offset product (left 2/3), negative space right, diagonal angle view',
      styleElements: `
        - Background: warm oak wood texture or natural linen fabric
        - Lighting: soft window light from 45° angle, golden hour quality
        - Props: artisan tools, raw materials, maker's hands (optional)
        - Color palette: earth tones, cream, sage green, terracotta
        - Include: small "Handmade" wax seal stamp in corner
        - Depth of field: f/2.8, bokeh background
      `,
      negative: 'sterile, corporate, artificial lighting, plastic, factory-made look'
    },
    'minimalist': {
      composition: 'absolute center, symmetrical, 80% white space, product size 20% of frame',
      styleElements: `
        - Background: pure white infinite void or subtle gradient (#FFFFFF to #F5F5F5)
        - Lighting: soft diffused from top, minimal shadow (5% opacity)
        - Product angle: 3/4 view or straight-on
        - NO text, NO badges, NO decorations
        - Color accuracy: precise product colors, no enhancement
        - Typography: if needed, Helvetica Neue Light, 14pt, #333333
      `,
      negative: 'busy, colorful, badges, promotional text, multiple products, props'
    },
    '1688': {
      composition: 'grid layout 3x3 showing color/size variations, or warehouse stack view',
      styleElements: `
        - Background: industrial blue (#0066CC) or warehouse gray
        - Large price overlay: yellow box (#FFCC00), black text, "¥X.XX/件" 
        - Top banner: "厂家直销" (Factory Direct) in red
        - Include: QR code bottom-right (WeChat contact)
        - Show: product specs in table format, MOQ info, bulk discount tiers
        - Add: pallet/carton packaging context
      `,
      negative: 'lifestyle, emotional, soft lighting, single product focus'
    },
    'taobao': {
      composition: 'collage style - center main + 4-6 detail panels around it, infographic layout',
      styleElements: `
        - Background: vibrant gradient (pink-purple or blue-cyan)
        - Main product: 40% of canvas, centered
        - Detail panels: size chart, material close-up, usage scenario, comparison
        - Text overlays: "爆款" "热销" badges in corners
        - Include: KOL avatar with quote bubble
        - Color scheme: high saturation, playful
        - Add: feature icons (waterproof, breathable, etc.)
      `,
      negative: 'minimal, sparse, monochrome, western aesthetic'
    },
    'pinduoduo': {
      composition: 'product 50%, text 50%, split diagonal or Z-pattern layout',
      styleElements: `
        - Background: solid vibrant color (#FF3366 pink or #FFA500 orange)
        - Massive text: "¥XX" crossing out to "¥X" in contrasting color
        - Top: countdown timer "仅剩 2小时"
        - Bottom: "已拼 1.2万件" counter with upward arrow
        - Product: slight 3D pop-out effect with shadow
        - Urgency elements: lightning bolt icon, fire emoji
        - Font: Extra bold, outlined, drop shadow
      `,
      negative: 'calm, professional, muted colors, minimal text'
    },
    'xianyu': {
      composition: 'casual snapshot, rule of thirds, product in natural environment',
      styleElements: `
        - Background: home setting (desk, shelf, floor), authentic room lighting
        - Lighting: natural ambient, may include visible window
        - Show: any scratches, wear marks, or flaws clearly
        - Include: hand holding item for scale (optional)
        - Minimal editing: natural colors, real shadows
        - Optional: measuring tape or size reference object
        - Style: smartphone photo quality, genuine C2C aesthetic
      `,
      negative: 'professional studio, perfect lighting, retouching, commercial polish'
    },
    'shopee': {
      composition: 'product center-left 60%, promotional elements right 40%, energetic asymmetric layout',
      styleElements: `
        - Background: vibrant orange gradient (#EE4D2D to #FF6533) or festive themed
        - Corner bursts: "FLASH SALE" star burst top-left, "FREE SHIPPING" badge top-right
        - Price display: large strikethrough original price, mega sale price in white/yellow
        - Bottom banner: "⚡ Sold 10K+" with progress bar showing stock scarcity
        - Coins/voucher icons: "Shopee Coins +500" badge
        - Add: small influencer/celebrity endorsement sticker (if applicable)
        - Festival elements: if 9.9, 10.10, 11.11, 12.12 - add confetti, balloons
        - Typography: Bold rounded sans-serif, playful, high contrast
        - Discount tag: "-50%" in bright yellow circle, overlapping product
        - Social proof: "⭐ 4.9 (2.5K reviews)" ribbon bottom
      `,
      negative: 'minimal, corporate, muted colors, sparse layout, professional studio look, western aesthetic'
    },
    'lazada': {
      composition: 'centered product with dynamic diagonal/angular frame elements, action-oriented layout',
      styleElements: `
        - Background: electric blue gradient (#0F146D to #1A1F9E) or purple-blue for campaigns
        - Dynamic frame: angular geometric borders in Lazada blue/purple
        - Top banner: "LazMall" or "Overseas" badge for credibility (white pill shape)
        - Price showcase: original price small, sale price MASSIVE in yellow/gold (#FFD700)
        - Lightning deal: "⚡ Only 3 hrs left!" countdown with clock icon
        - Voucher stack: "Get RM50 Voucher" clickable-looking button bottom-right
        - Flash sale indicator: "91% CLAIMED" progress bar in red-orange
        - Shipping info: "FREE Shipping Min RM0" with truck icon
        - Add: "Lowest Price Guarantee" badge if applicable
        - Color palette: #0F146D (Lazada blue), #FFD700 (gold), #FF6000 (orange alerts)
        - Typography: Bold modern sans-serif (Montserrat-like), dynamic angles
        - Trust elements: "100% Authentic" seal, "Easy Return" icon
      `,
      negative: 'calm, minimalist, pastel, subtle, organic, handcrafted, neutral tones'
    },
    'shopee-live': {
      composition: 'product 70% with host/influencer element 30%, broadcast-style framing',
      styleElements: `
        - Background: pink-purple gradient (#FF5C8A to #B042FF) with live streaming effects
        - Top-left: "🔴 LIVE" pulsing red dot with viewer count "12.3K watching"
        - Product: slightly tilted for dynamic feel, motion blur optional
        - Price ticker: animated scrolling "RM99 → RM49" with coin rain effect
        - Chat bubbles: "OMG MUST BUY!" floating comments overlay (semi-transparent)
        - Limited stock bar: "Only 5 left at this price!" in red alert box
        - Add: small circular host avatar in corner with "Add to Cart" button
        - Interactive elements: hearts floating up, flash effects
        - Urgency timer: "Flash Deal ends in 00:05:23"
        - Typography: Bold, outlined text with glow effects
      `,
      negative: 'static, formal, quiet, monochrome, professional photography, studio setup'
    },
    'lazada-flagship': {
      composition: 'premium centered layout, brand logo integration, sophisticated grid structure',
      styleElements: `
        - Background: clean white to light gradient, premium feel
        - Top banner: brand logo + "Official Store" verification checkmark
        - Product: hero shot 50%, lifestyle context 30%, detail shots 20%
        - Trust badges: "Authentic Guarantee", "Official Warranty", "Authorized Dealer"
        - Subtle Lazada branding: small corner watermark, not overwhelming
        - Price: elegant typography, "Member Price" special rate displayed
        - Benefits row: icon grid showing "Free Gift", "1-Year Warranty", "COD Available"
        - Color scheme: brand colors + Lazada blue accents
        - Add: "Exclusive Online" or "New Arrival" sophisticated badge
        - Typography: Premium serif for brand, clean sans-serif for info
        - Layout: more breathing room than standard Lazada, Apple Store influence
      `,
      negative: 'cheap, cluttered, aggressive sales, flash sale aesthetic, busy backgrounds'
    },
    'shopee-mall': {
      composition: 'premium brand-focused layout, trust-building hierarchy, 60-30-10 rule',
      styleElements: `
        - Background: clean white or soft branded color, professional
        - Top: "Shopee Mall" gold badge prominently displayed
        - Product: high-quality studio shot, multiple angles in clean grid
        - Brand logo: top-center or integrated elegantly
        - Price: sophisticated display, "Mall Price" vs "Market Price" comparison
        - Trust elements: "15-Day Return", "Authentic Guarantee", "Mall Warranty"
        - Shipping: "Next Day Delivery" or "Same Day" in premium badge
        - Rating: "Preferred Seller" or "Shopee Mall Rating 4.9★"
        - Add: "Official" verification tick, quality seal
        - Color palette: gold (#D4AF37) for premium, Shopee orange accents
        - Typography: elegant sans-serif, refined spacing
        - Layout: balanced, not aggressive, confidence through quality
      `,
      negative: 'discount-heavy, flash sale style, loud colors, cluttered, cheap-looking'
    },
    'regional-festival': {
      composition: 'festive explosive layout, cultural elements integrated, celebration-focused',
      styleElements: `
        - Background: themed for occasion (red/gold for CNY, green for Raya, colorful for Deepavali)
        - Cultural elements: lanterns, ketupat, kolam patterns (subtle, not stereotypical)
        - Product: center with festive wrapping or gift context
        - Mega sale tags: "Raya Sale 70% OFF", "CNY Deals", "Deepavali Special"
        - Limited time: "Festival Flash Deal 24 Hours Only!"
        - Free shipping: "Delivery Before [Festival]" guarantee badge
        - Gift elements: "Free Gift Wrapping", "Greeting Card Included"
        - Color psychology: auspicious colors per culture
        - Add: festive icons (ang pau, crackers, diyas) tastefully placed
        - Typography: bold festive but respectful, multilingual if needed
        - Voucher stack: "Festival Voucher RM100" in cultural design
      `,
      negative: 'generic, western-only aesthetic, inappropriate cultural mixing, insensitive'
    },
    'budget-friendly': {
      composition: 'value-focused layout, price comparison dominant, savings-first hierarchy',
      styleElements: `
        - Background: bright attention-grabbing solid (yellow #FFEB3B or orange)
        - Massive price: "Only RM9.90" in huge bold numbers, 50% of visual space
        - Comparison: "Was RM29.90" crossed out dramatically
        - Savings badge: "SAVE RM20!" in contrasting color explosion
        - Value props: "100 pieces = RM0.099 each" breakdown for bulk
        - Free shipping: "RM0 Shipping Min RM0" prominently shown
        - COD badge: "Cash on Delivery Available" for trust
        - Product: clear but smaller, emphasizes affordability over premium
        - Add: "Best Price in Market" comparison chart if possible
        - Typography: extra bold, outlined, high contrast
        - Voucher: "Apply RM5 Voucher" clickable element
      `,
      negative: 'premium, luxury, sophisticated, minimal, subtle, expensive-looking'
    },
    'alibaba02': {
      composition: 'Medium shot showing product with factory/warehouse background slightly blurred',
      styleElements: `
        - Gold Supplier/Verified badge (glowing, top-left)
        - Product in industrial context with size reference
        - ISO/CE certification symbols (subtle corner)
        - Contact QR/WhatsApp icon (bottom-right)
        - Color palette: Deep blue (#0052CC) for trust + Red (#FF6B6B) for urgency
        - Unique: MOQ display, container loading visual
      `,
      negative: 'consumer-facing, playful, pastel colors, handwritten fonts'
    },
    'aliexpress02': {
      composition: 'Product floating on pure white with subtle shadow, multiple angles as insets',
      styleElements: `
        - Main product at 45-degree angle (hero shot)
        - Free Shipping Worldwide ribbon
        - 2-Year Warranty shield badge
        - "100K+ Sold" counter with upward trend arrow
        - Context: Risk Reduction, Social Proof focus
      `,
      negative: 'cluttered, busy background, heavy text overlay, cartoon style'
    },
    'etsy02': {
      composition: 'Close-up with shallow depth of field, natural window lighting',
      styleElements: `
        - Product held in artisan's hands (gender-neutral, slightly weathered)
        - Natural materials background (wood grain, linen texture)
        - Handwritten product story/tag
        - Workshop tools in soft focus background
        - Color palette: Warm earth tones (#8B7355, #F5E8D0)
      `,
      negative: 'sterile, corporate, artificial lighting, plastic, factory-made look'
    },
    'minimalist02': {
      composition: 'Centered product with extensive white space, geometric alignment',
      styleElements: `
        - Product floating in negative space (70% empty)
        - Single dramatic light source creating elegant shadow
        - Material texture highlight (matte aluminum, brushed metal)
        - No text, No badges
      `,
      negative: 'busy, colorful, badges, promotional text, multiple products, props'
    },
    '168802': {
      composition: 'Top-down or eye-level grid, warehouse context',
      styleElements: `
        - Product variations in organized grid (3x3)
        - Large red price tag with "出厂价" (factory price)
        - MOQ requirement bold display
        - QR code for WeChat/contact
      `,
      negative: 'lifestyle, emotional, soft lighting, single product focus'
    },
    'taobao02': {
      composition: 'Collage-style but organized, mobile-optimized layout (9:16)',
      styleElements: `
        - Main product (30% space) with lifestyle context
        - 5 feature icons with text around product
        - KOL endorsement quote bubble
        - Promotional countdown timer
      `,
      negative: 'minimal, sparse, monochrome, western aesthetic'
    },
    'pinduoduo02': {
      composition: 'Bold typography dominant, product secondary (40% space)',
      styleElements: `
        - HUGE price drop comparison (原价→拼团价)
        - Countdown timer with red glow
        - Participant counter: "已有XXXX人拼单"
        - Vibrant gradient background (yellow→orange)
      `,
      negative: 'calm, professional, muted colors, minimal text'
    },
    'xianyu02': {
      composition: 'Casual smartphone photo aesthetic, slightly imperfect framing',
      styleElements: `
        - Product in real-life setting (home environment)
        - Flaw close-up inset (circled)
        - Simple honest condition description text
        - Natural ambient light
      `,
      negative: 'professional studio, perfect lighting, retouching, commercial polish'
    }
  };

  const selected = styleGuides[style.toLowerCase()] || styleGuides['minimalist'];

  return `
COMPOSITION:
${selected.composition}

SUBJECT:
${baseStructure.subject}

STYLE & ELEMENTS:
${selected.styleElements}

TECHNICAL SPECS:
${baseStructure.technical}

NEGATIVE PROMPT:
${baseStructure.negative}, ${selected.negative}
  `.trim();
};

/**
 * Gets market-specific variations for Southeast Asian countries
 */
const getSEAMarketVariations = (country: string) => {
  const countryTweaks: Record<string, any> = {
    'MY': {
      currency: 'RM',
      languages: ['Malay', 'English', 'Chinese'],
      festivals: ['Raya', 'CNY', 'Deepavali'],
      shippingTerms: 'Pos Laju, J&T Express',
      paymentHighlight: 'Touch n Go eWallet, GrabPay'
    },
    'TH': {
      currency: '฿',
      languages: ['Thai', 'English'],
      festivals: ['Songkran', 'Loy Krathong'],
      shippingTerms: 'Kerry Express, Flash Express',
      paymentHighlight: 'PromptPay, TrueMoney'
    },
    'PH': {
      currency: '₱',
      languages: ['Filipino', 'English'],
      festivals: ['Pasko', 'Sinulog'],
      shippingTerms: 'LBC, J&T Express',
      paymentHighlight: 'GCash, PayMaya'
    },
    'SG': {
      currency: 'S$',
      languages: ['English', 'Malay', 'Chinese'],
      festivals: ['CNY', 'Hari Raya', 'Deepavali'],
      shippingTerms: 'Ninja Van, Qxpress',
      paymentHighlight: 'PayNow, GrabPay'
    },
    'VN': {
      currency: '₫',
      languages: ['Vietnamese', 'English'],
      festivals: ['Tet', 'Mid-Autumn'],
      shippingTerms: 'Giao Hàng Nhanh, ViettelPost',
      paymentHighlight: 'MoMo, ZaloPay'
    },
    'ID': {
      currency: 'Rp',
      languages: ['Indonesian', 'English'],
      festivals: ['Ramadan', 'Lebaran'],
      shippingTerms: 'JNE, SiCepat',
      paymentHighlight: 'OVO, GoPay, Dana'
    }
  };

  return countryTweaks[country] || countryTweaks['TH']; // Default to TH for this project context
};


// Interface for the product analysis result from Gemini
export interface ProductAnalysis {
  name: string;
  summary: string;
  features: string[];
  visualDescription: string;
}

// Analyze product info and extract key selling points using Gemini
export const analyzeProduct = async (productInfo: string, images?: string[]): Promise<ProductAnalysis> => {
  // ─── Vertex AI Mode: call serverless API ────────────────────
  if (USE_VERTEX_AI) {
    console.log('[analyzeProduct] Using Vertex AI API route');
    return apiAnalyzeProduct(productInfo, images) as Promise<ProductAnalysis>;
  }

  // ─── Direct Gemini API Mode (Development) ───────────────────
  // Prepare content parts
  const parts: any[] = [];

  // Add images if available
  if (images && images.length > 0) {
    images.forEach(img => {
      const base64Data = img.includes('base64,') ? img.split('base64,')[1] : img;
      parts.push({
        inlineData: {
          mimeType: "image/png",
          data: base64Data
        }
      });
    });
  }

  // Add text prompt
  parts.push({
    text: `Analyze this Shopee product based on the provided ${images?.length ? 'images and ' : ''}description. 
    Product Info: ${productInfo || "No text description provided, please analyze the images."}
    Extract 3-5 key selling points (features) and a concise visual description of the product for image generation.
    Return as JSON with keys: "name", "summary", "features" (array of strings), "visualDescription".`
  });

  try {
    return await smartRetry(async (model, ai) => {
      console.log(`[analyzeProduct] Using model: ${model}`);
      const response = await ai.models.generateContent({
        model,
        contents: { parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              summary: { type: Type.STRING },
              features: { type: Type.ARRAY, items: { type: Type.STRING } },
              visualDescription: { type: Type.STRING }
            },
            required: ["name", "summary", "features", "visualDescription"]
          }
        }
      });
      const text = response.text || "{}";
      return JSON.parse(text) as ProductAnalysis;
    }, MODEL_REGISTRY.text);
  } catch (error) {
    console.error("Error during product analysis:", error);
    throw new Error(`Product analysis failed: ${error.message}`);
  }
};

/**
 * ดึงข้อความภาษาไทยที่น่าจะปรากฏในภาพแต่ละประเภท
 * เฉพาะเจาะจงตาม category + platform/style
 */
const extractThaiTexts = (productData: ProductData, category: ImageCategory, style: string): string[] => {
  const name = productData.name || '';
  const s = style.toLowerCase();

  switch (category) {
    case ImageCategory.COVER: {
      const texts = [`ชื่อสินค้า: ${name}`];

      // === Shopee Group ===
      if (['shopee', 'shopee-mall'].includes(s)) {
        texts.push('แบนเนอร์: Flash Sale / ส่งฟรี');
        texts.push('ป้ายราคา: ราคาเดิม (ขีดฆ่า) → ราคาลด');
        texts.push('Shopee Coins: +500');
        texts.push('รีวิว: ⭐ 4.9 (2.5K reviews)');
        texts.push('ยอดขาย: Sold 10K+');
        if (s === 'shopee-mall') texts.push('ป้าย: Shopee Mall ✓ / ของแท้ 100%');
      }
      else if (s === 'shopee-live') {
        texts.push('🔴 LIVE — 12.3K watching');
        texts.push('ราคา: RM99 → RM49');
        texts.push('Flash Deal ends in 00:05:23');
        texts.push('Only 5 left at this price!');
      }
      // === Lazada Group ===
      else if (['lazada', 'lazada-flagship'].includes(s)) {
        texts.push('แบนเนอร์: LazMall / Official Store ✓');
        texts.push('ป้ายราคา: ราคาเดิม → ราคา SALE (ตัวใหญ่)');
        texts.push('⚡ Lightning Deal / Only 3 hrs left!');
        texts.push('Voucher: Get RM50 Voucher');
        texts.push('91% CLAIMED / FREE Shipping');
        if (s === 'lazada-flagship') texts.push('ป้าย: Authentic Guarantee / Official Warranty');
      }
      // === Alibaba Group ===
      else if (['alibaba', 'alibaba02'].includes(s)) {
        texts.push('ป้าย: Verified Supplier / Gold Supplier');
        texts.push('MOQ: 100 units');
        texts.push('ISO/CE Certification');
      }
      // === AliExpress Group ===
      else if (['aliexpress', 'aliexpress02'].includes(s)) {
        texts.push('ป้าย: Free Shipping Worldwide');
        texts.push('2 Year Warranty');
        texts.push('100K+ Sold');
        texts.push('⭐ 4.8 Star Rating');
      }
      // === 1688 Group ===
      else if (['1688', '168802'].includes(s)) {
        texts.push('ป้ายราคา: ¥X.XX/件 (ราคาต่อชิ้น)');
        texts.push('แบนเนอร์: 厂家直销 (Factory Direct)');
        texts.push('MOQ / ราคาขายส่ง / ส่วนลดซื้อมาก');
      }
      // === Taobao Group ===
      else if (['taobao', 'taobao02'].includes(s)) {
        texts.push('ป้าย: 爆款 / 热销 (ขายดี)');
        texts.push('Feature icons: กันน้ำ, ทนทาน, etc.');
        texts.push('KOL quote / รีวิว influencer');
      }
      // === Pinduoduo Group ===
      else if (['pinduoduo', 'pinduoduo02'].includes(s)) {
        texts.push('ราคาเปรียบเทียบ: 原价 ¥XX → 拼團价 ¥X');
        texts.push('Countdown: 仅剩 2ชั่วโมง');
        texts.push('已拼 1.2万ชิ้น (จำนวนคนร่วมซื้อ)');
      }
      // === Etsy Group ===
      else if (['etsy', 'etsy02'].includes(s)) {
        texts.push('ป้าย: Handmade / งานฝีมือ');
        texts.push('วัสดุธรรมชาติ / เรื่องราวผู้ผลิต');
      }
      // === Xianyu Group ===
      else if (['xianyu', 'xianyu02'].includes(s)) {
        texts.push('ข้อมูล: สภาพสินค้า / เหตุผลที่ขาย');
        texts.push('สไตล์: ภาพถ่ายจากมือถือ ไม่แต่งรูป');
      }
      // === Minimalist Group ===
      else if (['minimalist', 'minimalist02'].includes(s)) {
        texts.push('(ภาพ Minimalist — ไม่มีข้อความซ้อน เน้น product เป็นหลัก)');
      }
      // === Others ===
      else if (s === 'regional-festival') {
        texts.push('แบนเนอร์ Festival: Raya Sale 70% OFF / CNY Deals');
        texts.push('ส่วนลด: Festival Voucher / Free Gift Wrapping');
      }
      else if (s === 'budget-friendly') {
        texts.push('ป้ายราคาใหญ่: Only RM9.90');
        texts.push('เปรียบเทียบ: Was RM29.90 (ขีดฆ่า)');
        texts.push('SAVE RM20! / Cash on Delivery');
      }

      return texts;
    }
    case ImageCategory.INFOGRAPHIC: {
      const texts = [`ชื่อสินค้า: ${name}`];
      if (productData.features && productData.features.length > 0) {
        productData.features.forEach((f, i) => {
          texts.push(`จุดเด่น ${i + 1}: ${f}`);
        });
      }
      return texts;
    }
    case ImageCategory.CLOSE_UP:
      return [
        `ชื่อสินค้า: ${name}`,
        '(ภาพ Close-up มักไม่มีข้อความซ้อน — เน้นแสดงวัสดุ/เนื้อผ้า/texture)'
      ];
    case ImageCategory.LIFESTYLE_A:
    case ImageCategory.LIFESTYLE_B:
    case ImageCategory.LIFESTYLE_C:
    case ImageCategory.LIFESTYLE_THAI_STREET_FOOD:
    case ImageCategory.LIFESTYLE_THAI_MARKET:
    case ImageCategory.LIFESTYLE_THAI_KITCHEN:
    case ImageCategory.LIFESTYLE_ISAN_KITCHEN:
    case ImageCategory.LIFESTYLE_THAI_LOCAL_RESTAURANT:
      return [
        `ชื่อสินค้า: ${name}`,
        '(ภาพ Lifestyle มักไม่มีข้อความซ้อน — เน้นบรรยากาศ)'
      ];
    case ImageCategory.SIZE_CHART:
      return [
        `ชื่อสินค้า: ${name}`,
        'ข้อความในภาพ: ขนาด / มิติ / หน่วยวัด เช่น ซม., นิ้ว, กก.'
      ];
    case ImageCategory.SOCIAL_PROOF:
      return [
        `ชื่อสินค้า: ${name}`,
        'ข้อความในภาพ: รีวิวลูกค้า / ยอดขาย / คะแนนรีวิว'
      ];
    case ImageCategory.TUTORIAL:
      return [
        `ชื่อสินค้า: ${name}`,
        'ขั้นตอนที่ 1: แกะกล่อง/เตรียม',
        'ขั้นตอนที่ 2: ติดตั้ง/เตรียมอุปกรณ์',
        'ขั้นตอนที่ 3: เริ่มใช้งาน',
        'ขั้นตอนที่ 4: ผลลัพธ์'
      ];
    default:
      return [`ชื่อสินค้า: ${name}`];
  }
};

// Generate product images using selected Gemini Image model
export const generateProductImage = async (
  category: ImageCategory,
  productData: ProductData,
  style: string,
  customPrompt?: string,  // เพิ่มพารามิเตอร์สำหรับ custom prompt
  imageModel: string = 'gemini-2.5-flash-image',  // รองรับการเลือกโมเดล (Nano Banana default)
  aspectRatio: string = '1:1',  // อัตราส่วนภาพ default 1:1
  styleIndex?: number  // สไตล์เจาะจง (0=random, 1-6=specific variation)
): Promise<ImageGenerationResult> => {
  // ─── Vertex AI Mode: call serverless API ────────────────────
  if (USE_VERTEX_AI) {
    console.log('[generateProductImage] Using Vertex AI API route');
    return apiGenerateProductImage(category, productData, style, customPrompt, imageModel, aspectRatio, styleIndex);
  }

  // ─── Direct Gemini API Mode (Development) ───────────────────
  // สร้าง model chain: model ที่ user เลือก → fallbacks จาก registry
  const imageModelChain = buildModelChain(imageModel, [...MODEL_REGISTRY.image]);

  let promptSuffix = "";
  switch (category) {
    case ImageCategory.COVER:
      const basePrompt = generateStructuredPrompt(productData.name, style);
      // Determine if this is an SEA platform and apply localization
      const seaPlatforms = ['shopee', 'lazada', 'shopee-live', 'lazada-flagship', 'shopee-mall', 'regional-festival', 'budget-friendly'];
      if (seaPlatforms.includes(style.toLowerCase())) {
        const marketData = getSEAMarketVariations('TH'); // Defaulting to TH for now
        promptSuffix = `
${basePrompt}

LOCALIZATION (TH):
- Currency: Display prices in ${marketData.currency}
- Payment trust: Show ${marketData.paymentHighlight} icons
- Shipping: Feature ${marketData.shippingTerms}
- Language: Primary ${marketData.languages[0]}, secondary ${marketData.languages[1]}
        `.trim();
      } else {
        promptSuffix = basePrompt;
      }
      break;
    case ImageCategory.INFOGRAPHIC:
      promptSuffix = pickStyle(INFOGRAPHIC_VARIATIONS, styleIndex)(productData.features);
      break;
    case ImageCategory.CLOSE_UP:
      promptSuffix = `Macro extreme close-up shot of the exact product shown in the reference image. Focus strictly on material texture and high-quality details WITHOUT altering the physical structure, shape, or placement of components (like screws, details, text). The product's anatomy and mechanical parts must remain 100% identical to the reference. Soft bokeh background, professional studio lighting.`;
      break;
    case ImageCategory.LIFESTYLE_A:
      promptSuffix = `Lifestyle photography of the product being used by a person inside a cozy home environment. Warm natural light coming through a window, realistic living room or kitchen setting.`;
      break;
    case ImageCategory.LIFESTYLE_B:
      promptSuffix = `Lifestyle photography of the product in an outdoor nature setting (park, garden, or beach). Bright sunny day, organic textures, adventurous and fresh feel.`;
      break;
    case ImageCategory.LIFESTYLE_C:
      promptSuffix = `Lifestyle photography of the product in a professional urban setting. Modern architecture, clean lines, corporate or city background, sophisticated lighting. realistic, candid, unstaged, real usage, no studio setup, no luxury kitchen, no showroom, no stock photo look`;
      break;
    case ImageCategory.LIFESTYLE_THAI_STREET_FOOD:
      promptSuffix = `Lifestyle photography of the product in a Thai street food setting. Street food stall, stainless steel cart, colorful ingredients, Thai signage, casual atmosphere, real usage scenario, natural daylight, vibrant yet authentic Thai street style. realistic, candid, unstaged, real usage, no studio setup, no luxury kitchen, no showroom, no stock photo look`;
      break;
    case ImageCategory.LIFESTYLE_THAI_MARKET:
      promptSuffix = `Lifestyle photography of the product in a traditional Thai market. Fresh produce, local vendors, busy market atmosphere, plastic baskets, wet market environment, authentic Thai daily life, natural lighting, documentary-style realism. realistic, candid, unstaged, real usage, no studio setup, no luxury kitchen, no showroom, no stock photo look`;
      break;
    case ImageCategory.LIFESTYLE_THAI_KITCHEN:
      promptSuffix = `Lifestyle photography of the product in a Thai kitchen. Cooking Thai food, herbs and spices, fish sauce bottles, chili, garlic, mortar and pestle, warm lighting, real home or restaurant kitchen environment. realistic, candid, unstaged, real usage, no studio setup, no luxury kitchen, no showroom, no stock photo look`;
      break;
    case ImageCategory.LIFESTYLE_ISAN_KITCHEN:
      promptSuffix = `Lifestyle photography of the product in an Isan kitchen setting. Som tam preparation, papaya shredder, mortar and pestle, sticky rice baskets, local Thai-Isan atmosphere, rustic kitchen, real usage, natural ambient lighting. realistic, candid, unstaged, real usage, no studio setup, no luxury kitchen, no showroom, no stock photo look`;
      break;
    case ImageCategory.LIFESTYLE_THAI_LOCAL_RESTAURANT:
      promptSuffix = `Lifestyle photography of the product in a local Thai restaurant. Small family-owned restaurant, simple interior, tables with Thai food dishes, daily business atmosphere, authentic local dining environment, warm realistic lighting. realistic, candid, unstaged, real usage, no studio setup, no luxury kitchen, no showroom, no stock photo look`;
      break;
    case ImageCategory.SIZE_CHART:
      promptSuffix = pickStyle(SIZE_CHART_VARIATIONS, styleIndex)(productData.name);
      break;
    case ImageCategory.SOCIAL_PROOF:
      // แบ่งเป็น 4 sub-categories สำหรับ A/B testing
      switch (style) {
        case 'unboxing-moment':
          promptSuffix = `
            First-person POV unboxing scene shot from above at 45° angle. 
            Customer's hands carefully opening a premium branded box on a clean wooden table surface. 
            Product still partially wrapped in tissue paper (white or branded color), 
            with protective foam inserts visible. Natural afternoon window lighting from left side 
            creating soft shadows. Include authentic details: partially visible shipping label, 
            branded thank-you card peeking out, scissors or box cutter in frame corner. 
            Warm color grading (2700K-3500K), slight film grain for authenticity. 
            Background: blurred home environment (couch edge, coffee cup). 
            Composition: product occupies 60% center, hands 25%, context 15%.
            Camera: smartphone photography aesthetic, natural depth of field (f/2.8).
          `;
          break;

        case 'just-arrived':
          promptSuffix = `
            Overhead flat-lay of product freshly delivered in opened shipping box/bubble mailer. 
            Shot on natural surface (marble counter, wood floor, kitchen table). 
            Product centered but slightly offset, still nestled in packaging materials 
            (crumpled brown paper, air pillows, biodegradable peanuts). 
            Include realistic shipping elements: address label partially visible (text blurred for privacy), 
            packing slip corner showing, branded tissue wrap half-opened. 
            Natural indirect daylight, soft shadows indicating morning/afternoon. 
            One hand entering frame from side, reaching for product with anticipation gesture. 
            Color palette: natural browns, whites, product color as pop. 
            Composition: golden ratio spiral leading eye to product. 
            Texture details: cardboard fiber, bubble wrap reflection, product material contrast.
            Style: authentic customer photo, not professional photography.
          `;
          break;

        case 'happy-customer':
          promptSuffix = `
            Medium shot of genuine customer holding product with natural smile in real home environment. 
            Shot at eye level, product held at chest height showing front clearly. 
            Background: authentic living space (slightly blurred bookshelf, plants, home decor) 
            NOT a studio. Natural window light creating soft Rembrandt lighting on face. 
            Customer: diverse everyday person (not model), casual home clothing (sweater, t-shirt), 
            genuine expression of satisfaction (slight smile, eyes on product or camera). 
            Product: held naturally (not posed), slightly angled toward camera. 
            Include subtle verification elements: product tag/seal visible, original packaging 
            partially in frame on table/couch beside them. Composition: 40% person upper body, 
            40% product detail, 20% environment context. Color grading: warm, inviting (Instagram-style). 
            Capture authentic moment, not staged photoshoot.
          `;
          break;

        case 'in-use-lifestyle':
          promptSuffix = `
            Candid lifestyle shot showing product being used in real-world context. 
            Shot from observer angle (not posed for camera), capturing natural moment. 
            Environment: authentic setting relevant to product (kitchen for cookware, 
            desk for tech, bedroom for skincare, etc.). Natural available light, 
            slight motion blur suggesting active use. Person partially visible 
            (hands using product, back of head, side profile) - focus on product interaction, 
            not person's face. Include contextual clues: coffee mug nearby, phone on table, 
            other daily items in soft focus background. Product shown mid-action 
            (being applied, operated, worn). Composition: environmental portrait style, 
            product and action occupy 70% frame, context 30%. Color: natural, 
            not overly saturated. Atmosphere: comfortable, relatable, "this could be me" feeling. 
            Shot style: smartphone or documentary photography, authentic not staged.
          `;
          break;

        default:
          // สุ่มเลือกจาก 4 สไตล์ เพื่อความหลากหลาย
          promptSuffix = pickRandom(SOCIAL_PROOF_DEFAULT_VARIATIONS)(productData.name);
          break;
      }
      break;
    case ImageCategory.TUTORIAL:
      // สำหรับ TUTORIAL: parse custom step prompts จาก JSON หากมี
      let tutorialSteps = [
        "Step 1: Unboxing/Prepare",
        "Step 2: Setup/Install",
        "Step 3: Usage",
        "Step 4: Result"
      ];
      if (customPrompt) {
        try {
          tutorialSteps = JSON.parse(customPrompt) as string[];
        } catch (e) {
          console.warn("Failed to parse tutorial prompts, using defaults");
        }
      }
      promptSuffix = pickStyle(TUTORIAL_VARIATIONS, styleIndex)(tutorialSteps);
      break;
  }

  // แปลง aspect ratio เป็นคำอธิบายที่ชัดเจนสำหรับ AI
  const ratioDescriptions: Record<string, string> = {
    '1:1': 'square format (1:1 aspect ratio, equal width and height)',
    '4:5': 'portrait format (4:5 aspect ratio, slightly taller than wide)',
    '9:16': 'vertical portrait format (9:16 aspect ratio, tall mobile/story format)',
    '16:9': 'landscape widescreen format (16:9 aspect ratio, wide horizontal)',
    '3:4': 'portrait format (3:4 aspect ratio, classic portrait orientation)',
  };
  const ratioDesc = ratioDescriptions[aspectRatio] || ratioDescriptions['1:1'];

  // ใช้ custom prompt หากมีการส่งมา (สำหรับ non-TUTORIAL categories)
  // สำหรับ TUTORIAL ให้ใช้ promptSuffix ที่ถูกสร้างขึ้นจาก tutorialSteps
  const prompt = (customPrompt && category !== ImageCategory.TUTORIAL)
    ? `${customPrompt}\n\nIMPORTANT: Generate this image in ${ratioDesc}.`
    : `Generate a new ${category} image for "${productData.name}".

IMPORTANT: Generate this image in ${ratioDesc}. The canvas must be ${aspectRatio} ratio.
    
${category === ImageCategory.COVER ? promptSuffix : `Product Description: ${productData.description}. Style requirements: ${promptSuffix}.`}

Use the provided source images to ensure the product looks accurate and consistent.`;

  // Filter and format images for multimodal input (Ensuring we only send base64 data)
  // ให้ภาพที่อัปโหลดจากผู้ใช้ (local images) มีลำดับความสำคัญสูงสุด
  const imageParts = productData.images
    .filter(img => img && img.includes('base64'))
    .map(img => {
      const parts = img.split(',');
      const mimePart = parts[0];
      const dataPart = parts[1];
      const mimeType = mimePart.match(/:(.*?);/)?.[1] || 'image/png';
      return {
        inlineData: {
          data: dataPart,
          mimeType: mimeType
        }
      };
    })
    // จำกัดเฉพาะ 3 ภาพแรกที่มีความสำคัญสูงสุด
    .slice(0, 3); // Limit to 3 images to manage payload size

  // Smart retry: หมุนเวียน API keys + models อัตโนมัติ
  try {
    return await smartRetry(async (modelName, ai) => {
      console.log(`[generateProductImage] Using model: ${modelName}`);
      let imageUrl = '';
      let geminiTextResponse = '';

      if (modelName.startsWith('imagen-')) {
        // ─── Imagen 3 API (Direct Mode) ───────────────────────────────────
        const response = await ai.models.generateImages({
          model: modelName,
          prompt: prompt,
          config: {
            numberOfImages: 1,
            aspectRatio: aspectRatio as any,
          },
        });

        if (response.generatedImages && response.generatedImages.length > 0) {
          const img = response.generatedImages[0].image;
          if (img?.imageBytes) {
            imageUrl = `data:image/png;base64,${img.imageBytes}`;
          }
        }
      } else {
        // ─── Gemini Multimodal Content Gen (Direct Mode) ───────────────────
        const response = await ai.models.generateContent({
          model: modelName,
          contents: {
            parts: [
              ...imageParts,
              { text: prompt }
            ],
          },
          config: {
            responseModalities: ['Text', 'Image'],
            generationConfig: {
              responseModalities: ['Text', 'Image'],
            } as any,
          } as any,
        });

        if (response.candidates && response.candidates[0]?.content?.parts) {
          for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
              imageUrl = `data:image/png;base64,${part.inlineData.data}`;
            }
            if (part.text) {
              geminiTextResponse = part.text;
            }
          }
        }
      }

      if (!imageUrl) {
        throw new Error("Failed to generate image - no image data returned");
      }

      // ดึงข้อความภาษาไทยเฉพาะ category
      const thaiTexts = extractThaiTexts(productData, category, style);

      // เพิ่มข้อความที่ Gemini ตอบกลับเข้าไปในรายการ (ถ้ามี)
      if (geminiTextResponse) {
        thaiTexts.push(`AI อธิบาย: ${geminiTextResponse.substring(0, 300)}`);
      }

      return {
        imageUrl,
        promptUsed: prompt,
        thaiTexts
      };
    }, imageModelChain);
  } catch (error) {
    console.error("Error generating product image:", error);
    throw new Error(`Image generation failed: ${error.message}`);
  }
};

// Summarize product description for compelling marketing copy
export const summarizeProductDescription = async (
  currentDesc: string,
  images?: string[],
  summaryLength: 'short' | 'medium' | 'long' = 'medium'
): Promise<string> => {
  // ─── Vertex AI Mode: call serverless API ────────────────────
  if (USE_VERTEX_AI) {
    console.log('[summarizeProduct] Using Vertex AI API route');
    return apiSummarizeProductDescription(currentDesc, images, summaryLength);
  }

  // ─── Direct Gemini API Mode (Development) ───────────────────
  const parts: any[] = [];

  // Add images if available to help with summary
  if (images && images.length > 0) {
    images.forEach(img => {
      const base64Data = img.includes('base64,') ? img.split('base64,')[1] : img;
      parts.push({
        inlineData: {
          mimeType: "image/png",
          data: base64Data
        }
      });
    });
  }

  // กำหนดรูปแบบตามความยาวที่เลือก
  const lengthInstructions: Record<string, string> = {
    short: `Format (สั้นกระชับ):
    - **จุดเด่นสินค้า**: (2-3 bullet points สั้นๆ)
    - **คำขาย (Hook)**: (Catchy one-liner)
    - ไม่ต้องมีรายละเอียดยาว ให้สั้นกระชับ เน้นจุดขายหลัก`,
    medium: `Format (ปานกลาง):
    - **จุดเด่นสินค้า**: (3-5 bullet points)
    - **รายละเอียด**: (Short paragraph 2-3 ประโยค)
    - **คำขาย (Hook)**: (Catchy one-liner)`,
    long: `Format (ละเอียด):
    - **จุดเด่นสินค้า**: (5-7 bullet points ละเอียด)
    - **รายละเอียด**: (Detailed paragraph อธิบายครบถ้วน 4-6 ประโยค)
    - **วิธีใช้งาน**: (ถ้ามี 2-3 ขั้นตอน)
    - **คำขาย (Hook)**: (Catchy one-liner)`
  };

  parts.push({
    text: `You are a professional e-commerce copywriter. Analyze the provided product description and/or images.
    Input Description: "${currentDesc}"
    
    Task: Write a compelling, concise, and attractive product summary in Thai (ภาษาไทย).
    ${lengthInstructions[summaryLength]}
    - Use emojis to make it engaging.
    - Keep it ready for use in Shopee/Lazada product description.
    
    Output strictly the summary text.`
  });

  try {
    return await smartRetry(async (model, ai) => {
      console.log(`[summarizeProduct] Trying model: ${model}`);
      const response = await ai.models.generateContent({
        model,
        contents: { parts }
      });
      return response.text || "";
    }, MODEL_REGISTRY.text);
  } catch (error) {
    console.error("Error summarizing product:", error);
    throw new Error(`Summary failed: ${error.message}`);
  }
};
