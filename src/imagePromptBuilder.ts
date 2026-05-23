/**
 * Shared image prompt builder — used by apiClient (Vercel) and geminiService (dev).
 */
import { ImageCategory, ProductData } from '../types';
export const SEA_MARKETPLACE_STYLES = new Set([
  'shopee', 'lazada', 'shopee-live', 'lazada-flagship', 'shopee-mall',
  'regional-festival', 'budget-friendly', 'pinduoduo', 'pinduoduo02', 'taobao', 'taobao02',
]);

export function isMarketingPlatformStyle(style?: string) {
  if (!style) return true;
  const normalized = style.toLowerCase();
  return !['minimalist', 'minimalist02'].includes(normalized);
}

export function generateStructuredPrompt(productName: string, style: string): string {
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
export function getSEAMarketVariations(country: string) {
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
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickStyle<T>(arr: T[], styleIndex?: number): T {
  if (styleIndex && styleIndex >= 1 && styleIndex <= arr.length) {
    return arr[styleIndex - 1];
  }
  return pickRandom(arr);
}

const INFOGRAPHIC_VARIATIONS = [
  (features: string[]) => `A modern flat-design product infographic. Bold gradient background. Product center-left (40%). Right: feature callout boxes with flat icons. Features: ${features.join(' | ')}. Vibrant marketplace aesthetic.`,
  (features: string[]) => `A premium dark-themed infographic. Deep charcoal background. Product hero center with neon-glow feature rings. Features: ${features.join(' | ')}.`,
  (features: string[]) => `An editorial magazine-style infographic. Soft cream paper background. Features as elegant pull-quotes. Features: ${features.join(' | ')}.`,
  (features: string[]) => `An isometric 3D-style infographic. Soft pastel gradient. Product in isometric perspective with floating feature cards. Features: ${features.join(' | ')}.`,
  (features: string[]) => `A split-color-block infographic. Diagonal contrasting blocks. Numbered feature circles. Features: ${features.join(' | ')}.`,
  (features: string[]) => `A minimalist data-driven infographic. White background. Horizontal feature bars with icons. Features: ${features.join(' | ')}.`,
];

const SIZE_CHART_VARIATIONS = [
  (name: string) => `Clean product size comparison grid for "${name}". Dimension lines, scale reference, specs table.`,
  (name: string) => `Lifestyle size visualization for "${name}" with real-world scale objects.`,
  (name: string) => `Technical blueprint size chart for "${name}" on dark navy grid.`,
  (name: string) => `Playful size comparison for "${name}" with everyday scale objects.`,
  (name: string) => `Multi-variant S/M/L size display for "${name}".`,
  (name: string) => `Flat-lay size chart for "${name}" with ruler and props.`,
];

const SOCIAL_PROOF_VARIATIONS = [
  (name: string) => `Customer review collage for "${name}" with star ratings and review cards.`,
  (name: string) => `Trust badge display for "${name}" with authenticity and shipping badges.`,
  (name: string) => `Before/after comparison marketing visual for "${name}".`,
  (name: string) => `Social media testimonial collage for "${name}" with hearts and comments.`,
];

const TUTORIAL_VARIATIONS = [
  (steps: string[]) => `2×2 grid tutorial. Steps: ${steps.join(' | ')}.`,
  (steps: string[]) => `Horizontal timeline tutorial. Steps: ${steps.join(' | ')}.`,
  (steps: string[]) => `Magazine editorial how-to. Steps: ${steps.join(' | ')}.`,
  (steps: string[]) => `Dark tech-style tutorial. Steps: ${steps.join(' | ')}.`,
  (steps: string[]) => `Hand-drawn sketch tutorial. Steps: ${steps.join(' | ')}.`,
  (steps: string[]) => `Vertical story-style tutorial (TikTok/Reels). Steps: ${steps.join(' | ')}.`,
];

function buildCategoryTaskPrompt(
  category: ImageCategory,
  productData: ProductData,
  style: string,
  styleIndex?: number,
): string {
  switch (category) {
    case ImageCategory.COVER: {
      let prompt = generateStructuredPrompt(productData.name, style);
      if (SEA_MARKETPLACE_STYLES.has(style.toLowerCase())) {
        const market = getSEAMarketVariations('TH');
        prompt += `\n\nLOCALIZATION (TH):\n- Currency: ${market.currency}\n- Payment: ${market.paymentHighlight}\n- Shipping: ${market.shippingTerms}\n- Languages: ${market.languages.join(', ')}`;
      }
      return prompt;
    }
    case ImageCategory.INFOGRAPHIC:
      return `${pickStyle(INFOGRAPHIC_VARIATIONS, styleIndex)(productData.features)}\n\nApply ${style} marketplace color palette, typography, and promotional energy to the infographic layout.`;
    case ImageCategory.CLOSE_UP:
      return `Macro close-up of the exact product. Material texture focus. Apply ${style} color grading to background/bokeh while keeping product accurate.`;
    case ImageCategory.LIFESTYLE_A:
      return `Lifestyle photo: product used in cozy home. Apply ${style} campaign look to environment and color grade.`;
    case ImageCategory.LIFESTYLE_B:
      return `Lifestyle photo: product in outdoor nature. Apply ${style} campaign look.`;
    case ImageCategory.LIFESTYLE_C:
      return `Lifestyle photo: product in urban professional setting. Apply ${style} campaign look.`;
    case ImageCategory.LIFESTYLE_THAI_STREET_FOOD:
      return `Lifestyle: Thai street food stall setting with product in use. Authentic, candid.`;
    case ImageCategory.LIFESTYLE_THAI_MARKET:
      return `Lifestyle: traditional Thai market with product in use. Documentary realism.`;
    case ImageCategory.LIFESTYLE_THAI_KITCHEN:
      return `Lifestyle: Thai kitchen with product while cooking. Warm ambient light.`;
    case ImageCategory.LIFESTYLE_ISAN_KITCHEN:
      return `Lifestyle: Isan kitchen, som tam context, rustic authentic setting.`;
    case ImageCategory.LIFESTYLE_THAI_LOCAL_RESTAURANT:
      return `Lifestyle: local Thai restaurant with product on table.`;
    case ImageCategory.SIZE_CHART:
      return `${pickStyle(SIZE_CHART_VARIATIONS, styleIndex)(productData.name)}\n\nUse ${style} marketplace graphic styling for labels and layout.`;
    case ImageCategory.SOCIAL_PROOF:
      return `${pickRandom(SOCIAL_PROOF_VARIATIONS)(productData.name)}\n\nStyle overlays and badges must match ${style} marketplace aesthetic.`;
    case ImageCategory.TUTORIAL:
      return `${pickStyle(TUTORIAL_VARIATIONS, styleIndex)(['Unboxing', 'Setup', 'Usage', 'Result'])}\n\nApply ${style} graphic design language to step badges and layout.`;
    default:
      return `Marketing image for "${productData.name}" in ${style} ecommerce style. ${productData.description || ''}`;
  }
}

function getCategoryCreativeRequirements(category: ImageCategory) {
  switch (category) {
    case ImageCategory.COVER:
      return 'IMAGE TYPE: Main listing cover — full marketplace promotional layout with background, badges, price zones, and hero product.';
    case ImageCategory.INFOGRAPHIC:
      return 'IMAGE TYPE: Feature infographic — icons, callouts, structured selling points, not a plain product photo.';
    case ImageCategory.SOCIAL_PROOF:
      return 'IMAGE TYPE: Social proof / reviews — stars, quotes, trust elements, campaign graphics.';
    case ImageCategory.SIZE_CHART:
      return 'IMAGE TYPE: Size/spec chart — measurements, comparison layout, readable labels.';
    case ImageCategory.TUTORIAL:
      return 'IMAGE TYPE: Step-by-step tutorial — numbered panels or timeline, instructional layout.';
    case ImageCategory.CLOSE_UP:
      return 'IMAGE TYPE: Detail/macro shot — texture and material quality focus.';
    default:
      return 'IMAGE TYPE: Lifestyle/marketing scene — product in contextual use, not a catalog cutout on white.';
  }
}

/** Full prompt sent to /api/generate (production) — matches geminiService dev intent. */
export function buildImageGenerationPrompt(
  category: ImageCategory,
  productData: ProductData,
  style: string,
  customPrompt?: string,
  styleIndex?: number,
): string {
  const features = productData.features?.filter(Boolean).slice(0, 8) || [];
  const taskPrompt = (customPrompt && category !== ImageCategory.TUTORIAL)
    ? customPrompt
    : buildCategoryTaskPrompt(category, productData, style, styleIndex);

  const platformGuide = category === ImageCategory.COVER
    ? taskPrompt
    : `PLATFORM STYLE (${style}) — apply these visual rules to background, graphics, typography, colors, and layout:\n${generateStructuredPrompt(productData.name, style)}`;

  const marketing = isMarketingPlatformStyle(style);

  return [
    `Create a brand-new ${category} ecommerce MARKETING image (not a near-copy of the reference photo).`,
    getCategoryCreativeRequirements(category),
    platformGuide,
    `CATEGORY TASK:\n${taskPrompt}`,
    `Product name: ${productData.name || 'Unknown product'}`,
    productData.description ? `Description: ${productData.description}` : '',
    features.length ? `Key features: ${features.join(' | ')}` : '',
    marketing
      ? 'Keep the SAME product from reference images (shape, logo, color, labels) but CREATE a new scene, background, promotional layout, and marketplace-style graphics as specified. Do NOT return an almost unchanged photo.'
      : 'Preserve product identity from references. Minimalist composition — no promotional clutter.',
    marketing
      ? 'Include platform-appropriate sale badges, gradients, typography, and layout energy when the style requires it.'
      : 'No promotional badges or sale text.',
  ].filter(Boolean).join('\n\n');
}

export function getOrchestratorInstructions(args: {
  category?: string;
  style?: string;
  aspectRatio: string;
  ratioDesc: string;
  productContext: string;
  legacyPrompt: string;
}) {
  const marketing = isMarketingPlatformStyle(args.style);

  if (marketing) {
    return `
You are the Prompt Orchestrator for PLATFORM-SPECIFIC ecommerce marketing images (${args.style}).

Goal:
- Read the legacy creative direction carefully — it contains detailed marketplace layout rules (Shopee, Lazada, Pinduoduo, etc.).
- Output a DETAILED image-generation prompt that produces a NEW marketing image, NOT a barely edited product photo.
- Keep the same product from reference images but CHANGE scene, background, composition, promotional graphics, badges, gradients, and typography per the platform style.
- Honor the image category purpose: ${args.category || 'unknown'} (cover, infographic, lifestyle, etc.).
- Include Thai marketing text suggestions when appropriate for the platform.
- Aspect ratio: ${args.aspectRatio} (${args.ratioDesc}).

${args.productContext}

STYLE / PLATFORM: ${args.style || 'default'}
CATEGORY: ${args.category || 'unknown'}

LEGACY CREATIVE DIRECTION (follow closely — do not simplify away badges, layouts, or sale elements):
${args.legacyPrompt}

Return valid JSON only:
{
  "prompt": "detailed final image prompt",
  "negativePrompt": "plain white catalog photo, unchanged background, no marketing graphics, blurry text",
  "productSummary": "short product identity summary",
  "thaiTextPlan": ["short Thai text for overlays if useful"]
}
`.trim();
  }

  return `
You are the Prompt Orchestrator for ecommerce product images.

Goal:
- Analyze product reference images.
- Use legacy prompt as creative direction.
- Produce a concise prompt that keeps product identity but improves scene and presentation.
- Aspect ratio: ${args.aspectRatio} (${args.ratioDesc}).

${args.productContext}
CATEGORY: ${args.category || 'unknown'}
STYLE: ${args.style || 'default'}

LEGACY CREATIVE DIRECTION:
${args.legacyPrompt}

Return valid JSON only:
{
  "prompt": "final image prompt",
  "negativePrompt": "things to avoid",
  "productSummary": "short product identity summary",
  "thaiTextPlan": ["short Thai text ideas if useful"]
}
`.trim();
}

