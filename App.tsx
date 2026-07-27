import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Download,
  Sparkles,
  Image as ImageIcon,
  Layers,
  Globe,
  ChevronRight,
  Loader2,
  CheckCircle2,
  Upload,
  X,
  AlertCircle,
  LayoutGrid,
  FileArchive,
  Search,
  Eye,
  EyeOff,
  Settings,
  LogOut,
  User,
  Lock,
  Mail,
  Info,
  ArrowRightCircle,
  ShoppingBag,
  Zap,
  Target,
  Moon,
  Sun, // เพิ่มไอคอนสำหรับธีม
  RotateCcw,
  Scissors,
  AlignLeft,
  Wand2, // เพิ่ม icon สำหรับปุ่มสรุปข้อมูล
  ChevronUp,
  ChevronDown,
  Edit2,
  ZoomIn,
  ZoomOut,
  Move,
  Ruler
} from 'lucide-react';
import JSZip from 'jszip';
import { ImageCategory, IMAGE_CATEGORIES_METADATA, ProductData, GeneratedImage, ProductPrice, ProductVariantGroup } from './types';
import { analyzeProduct, generateProductImage, summarizeProductDescription, getApiKeys } from './geminiService';
import { useTheme } from './src/contexts/ThemeContext'; // นำเข้า hook สำหรับจัดการธีม
import { useNotification } from './src/contexts/NotificationContext';
import NotificationSystem from './src/components/NotificationSystem';
import { useAuth } from './src/contexts/AuthContext';
import { saveToDB, loadFromDB, clearDB } from './src/utils/storage'; // Persistence
import { ImageEditorModal } from './src/components/ImageEditorModal';
import LoginPage from './src/components/LoginPage';
import { ShopeeAdsStudio, createThaiAdsSession, type ThaiAdsSession } from './src/components/ShopeeAdsStudio';
import { MarketingSite } from './src/components/MarketingSite';
import { PricingCheckoutModal } from './src/components/PricingCheckoutModal';
import { KineticBackground } from './src/components/KineticBackground';
import type { PlanId } from './pricing';

const APP_RELEASE = '1.0.0';
const APP_BUILD = import.meta.env.VITE_APP_BUILD || 'local';

type ResultsDensity = 'overview' | 'standard' | 'focus';
type ScaleReferenceId = 'iphone-15' | 'iphone-15-pro' | 'hand' | 'custom';

type ManualScaleDraft = {
  variantId: string;
  variantLabel: string;
  widthCm: string;
  lengthCm: string;
  depthCm: string;
  meshCellMm: string;
  referenceId: ScaleReferenceId;
  customReferenceLabel: string;
  customReferenceWidthMm: string;
  customReferenceHeightMm: string;
};

const RESULTS_DENSITIES: { id: ResultsDensity; label: string; description: string; gridClass: string }[] = [
  { id: 'overview', label: 'ภาพรวม', description: '4–5 ภาพต่อแถว', gridClass: 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5' },
  { id: 'standard', label: 'ปกติ', description: '3 ภาพต่อแถว', gridClass: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10' },
  { id: 'focus', label: 'ใหญ่', description: '1–2 ภาพต่อแถว', gridClass: 'grid-cols-1 md:grid-cols-2 gap-10' },
];

const SCALE_REFERENCE_PRESETS: { id: ScaleReferenceId; label: string; widthMm: number; heightMm: number; isApproximate?: boolean }[] = [
  { id: 'iphone-15', label: 'iPhone 15 (71.6 × 147.6 มม.)', widthMm: 71.6, heightMm: 147.6 },
  { id: 'iphone-15-pro', label: 'iPhone 15 Pro (70.6 × 146.6 มม.)', widthMm: 70.6, heightMm: 146.6 },
  { id: 'hand', label: 'มือผู้ใหญ่โดยประมาณ (85 × 175 มม.)', widthMm: 85, heightMm: 175, isApproximate: true },
  { id: 'custom', label: 'วัตถุอ้างอิงกำหนดเอง', widthMm: 71.6, heightMm: 147.6 },
];

const createManualScaleDraft = (): ManualScaleDraft => ({
  variantId: '',
  variantLabel: '',
  widthCm: '',
  lengthCm: '',
  depthCm: '',
  meshCellMm: '',
  referenceId: 'iphone-15',
  customReferenceLabel: 'วัตถุอ้างอิง',
  customReferenceWidthMm: '71.6',
  customReferenceHeightMm: '147.6',
});

const STYLES = [
  {
    id: 'shopee',
    name: 'Shopee Style',
    emoji: '🧡',
    color: 'text-orange-500', // Shopee Orange
    desc: 'Energetic Southeast Asian marketplace, flash sale bursts, vibrant orange, high contrast',
    promptTemplate: 'Shopee style: vibrant orange gradient, flash sale badges, price drops, sold counts, energetic.'
  },
  {
    id: 'alibaba',
    name: 'Alibaba Style',
    emoji: '🏭',
    color: 'text-yellow-600 dark:text-yellow-500', // Gold/Industrial
    desc: 'B2B focus, bold design, verified supplier badges, industrial trust',
    promptTemplate: 'Alibaba B2B style: bold badges (Verified Supplier), urgent colors, professional/industrial context, trust-focused.'
  },
  {
    id: 'aliexpress',
    name: 'AliExpress Style',
    emoji: '🛒',
    color: 'text-red-500', // AliExpress Red
    desc: 'Global marketplace, clean premium look, high-res angles, free shipping icons',
    promptTemplate: 'AliExpress global style: white background, 360° views, texture close-ups, clean premium aesthetic.'
  },
  {
    id: 'etsy',
    name: 'Etsy Style',
    emoji: '🌸',
    color: 'text-orange-600 dark:text-orange-500', // Etsy Orange
    desc: 'Artisanal & rustic, natural textures, handmade quality, emotional connection',
    promptTemplate: 'Etsy artisan style: warm natural textures, handmade aesthetic, storytelling, emotional connection.'
  },
  {
    id: 'minimalist',
    name: 'Minimalist',
    emoji: '⚪',
    color: 'text-slate-800 dark:text-gray-100', // Apple Black/White
    desc: 'Apple-like aesthetic, extensive white space, focus on form and design',
    promptTemplate: 'Minimalist premium style: maximum white space, geometric composition, product as hero, no clutter.'
  },
  {
    id: '1688',
    name: '1688 Style',
    emoji: '📦',
    color: 'text-orange-700 dark:text-orange-600', // 1688 Orange/Red
    desc: 'Wholesale bulk imagery, factory-direct look, price tags and MOQ focus',
    promptTemplate: '1688 wholesale style: shows bulk quantity, large price tags, factory-direct, info-dense B2B focus.'
  },
  {
    id: 'taobao',
    name: 'Taobao Style',
    emoji: '🛍️',
    color: 'text-orange-500', // Taobao Orange
    desc: 'Comprehensive info-graphics, colorful backgrounds, multiple angles in one',
    promptTemplate: 'Taobao comprehensive style: colorful, multiple angles in one image, detailed specs graphics, lively.'
  },
  {
    id: 'pinduoduo',
    name: 'Pinduoduo Style',
    emoji: '🔥',
    color: 'text-red-600', // Pinduoduo Red
    desc: 'Urgent group-buy design, vibrant colors, dramatic price labels, countdowns',
    promptTemplate: 'Pinduoduo group-buy style: vibrant colors, huge discount text, countdown timer, urgency-focused.'
  },
  {
    id: 'xianyu',
    name: 'Xianyu Style',
    emoji: '♻️',
    color: 'text-yellow-500', // Xianyu Yellow
    desc: 'Second-hand/C2C raw photography, honest real-life settings, ambient light',
    promptTemplate: 'Xianyu second-hand style: raw unedited photo, shows flaws, simple home background, authentic C2C.'
  },

  {
    id: 'brand-ambassador',
    name: 'Brand Ambassador (สุ่ม)',
    emoji: '✨',
    color: 'text-rose-500',
    desc: 'พรีเซนเตอร์ไทย + สินค้าเด่น + Hook ใหญ่',
    promptTemplate: 'Thai marketplace brand ambassador cover: a warm credible Thai or Asian presenter naturally holding, using, or introducing the exact product. Product is large, sharp, and unobstructed in the foreground; one bold short Thai headline plus one smaller verified supporting line only. No long text, fake discounts, badges, frames, or side panels. Regenerate with a new pose, camera angle, composition, headline placement, and relevant props while preserving the same product identity and presenter-led campaign character.'
  },
  {
    id: 'brand-ambassador-female',
    name: 'Brand Ambassador ผู้หญิง',
    emoji: '✨',
    color: 'text-rose-500',
    desc: 'พรีเซนเตอร์ผู้หญิง + สินค้าเด่น + Hook ใหญ่',
    promptTemplate: 'Thai marketplace brand ambassador cover: exactly one warm credible adult Thai or Asian woman naturally holding, using, or introducing the exact product. Product is large, sharp, and unobstructed in the foreground; one bold short Thai headline plus one smaller verified supporting line only. No long text, fake discounts, badges, frames, or side panels. Regenerate with a new pose, camera angle, composition, headline placement, and relevant props while preserving the same product identity and female presenter-led campaign character.'
  },
  {
    id: 'brand-ambassador-male',
    name: 'Brand Ambassador ผู้ชาย',
    emoji: '✨',
    color: 'text-sky-500',
    desc: 'พรีเซนเตอร์ผู้ชาย + สินค้าเด่น + Hook ใหญ่',
    promptTemplate: 'Thai marketplace brand ambassador cover: exactly one warm credible adult Thai or Asian man naturally holding, using, or introducing the exact product. Product is large, sharp, and unobstructed in the foreground; one bold short Thai headline plus one smaller verified supporting line only. No long text, fake discounts, badges, frames, or side panels. Regenerate with a new pose, camera angle, composition, headline placement, and relevant props while preserving the same product identity and male presenter-led campaign character.'
  },
  {
    id: 'lazada',
    name: 'Lazada Style',
    emoji: '💜',
    color: 'text-indigo-600 dark:text-indigo-400', // Lazada Blue/Purple
    desc: 'Dynamic action-oriented layout, electric blue/purple, LazMall credibility, massive price labels',
    promptTemplate: 'Lazada style: blue/purple gradient, dynamic angular frames, authentic seals, massive sale prices.'
  },
  {
    id: 'shopee-live',
    name: 'Shopee Live',
    emoji: '🔴',
    color: 'text-orange-500',
    desc: 'Live streaming aesthetic, broadcast framing, floating chat, real-time urgency',
    promptTemplate: 'Shopee Live style: live pulse icon, viewer count, pink-purple gradient, floating comments.'
  },
  {
    id: 'lazada-flagship',
    name: 'Lazada Flagship',
    emoji: '👑',
    color: 'text-indigo-700 dark:text-indigo-400',
    desc: 'Premium official store layout, clean branding, sophisticated grid, high trust',
    promptTemplate: 'Lazada Flagship style: official store badge, hero shots, premium clean aesthetic, brand registry focus.'
  },
  {
    id: 'shopee-mall',
    name: 'Shopee Mall',
    emoji: '🛡️',
    color: 'text-red-600', // Shopee Mall Red
    desc: 'Brand-focused premium layout, gold Mall badges, authentic guarantee, refined spacing',
    promptTemplate: 'Shopee Mall style: gold badges, refined layout, brand-first hierarchy, high trust indicators.'
  },
  {
    id: 'regional-festival',
    name: 'Regional Festival',
    emoji: '🎆',
    color: 'text-rose-500',
    desc: 'Festive explosive layout, cultural elements (CNY, Raya, Songkran), celebration-focused',
    promptTemplate: 'Regional Festival style: cultural festive themes, explosive sale tags, occasion-specific colors.'
  },
  {
    id: 'budget-friendly',
    name: 'Budget Friendly',
    emoji: '💸',
    color: 'text-green-600 dark:text-green-500',
    desc: 'Value-focused, price comparison dominant, savings-first hierarchy, bold highlights',
    promptTemplate: 'Budget style: yellow highlights, massive price text, savings-first, worth-it focus.'
  },
  {
    id: 'alibaba02',
    name: 'Alibaba B2B Industrial',
    emoji: '🏗️',
    color: 'text-yellow-600 dark:text-yellow-500',
    desc: 'B2B focus, gold badges, industrial context, factory settings',
    promptTemplate: 'Alibaba V.2: Gold Supplier badge, factory context, industrial aesthetic, authority trust.'
  },
  {
    id: 'aliexpress02',
    name: 'AliExpress Global (V.2)',
    emoji: '🌎',
    color: 'text-red-500',
    desc: 'Global marketplace, hero shots, social proof, risk-free focus',
    promptTemplate: 'AliExpress V.2: Hero shot, free shipping ribbon, warranty badges, social proof counter.'
  },
  {
    id: 'etsy02',
    name: 'Etsy Artisanal (V.2)',
    emoji: '🧶',
    color: 'text-orange-600 dark:text-orange-500',
    desc: 'Warm artisanal vibe, handmade connection, natural textures',
    promptTemplate: 'Etsy V.2: Artisan hands holding product, warm natural lighting, workshop tools in focus.'
  },
  {
    id: 'minimalist02',
    name: 'Minimalist Apple (V.2)',
    emoji: '💻',
    color: 'text-slate-800 dark:text-gray-100',
    desc: 'High-end minimalist aesthetic, negative space, premium lighting',
    promptTemplate: 'Minimalist V.2: Apple-inspired, 70% negative space, directional lighting, premium material highlights.'
  },
  {
    id: '168802',
    name: '1688 Wholesale (V.2)',
    emoji: '🏭',
    color: 'text-orange-700 dark:text-orange-600',
    desc: 'Wholesale efficiency, price focused, grid variations, industrial trust',
    promptTemplate: '1688 V.2: 3x3 grid variations, red price tags, MOQ bold, warehouse context.'
  },
  {
    id: 'taobao02',
    name: 'Taobao Showcase (V.2)',
    emoji: '📱',
    color: 'text-orange-500',
    desc: 'Information-rich collage, KOL endorsement, mobile optimized',
    promptTemplate: 'Taobao V.2: Collage layout, feature icons, KOL quote, energetic mobile style.'
  },
  {
    id: 'pinduoduo02',
    name: 'Pinduoduo Urgency (V.2)',
    emoji: '🔥',
    color: 'text-red-600',
    desc: 'Gamified urgency, flash sale style, massive price alerts',
    promptTemplate: 'Pinduoduo V.2: Huge price drop text, countdown timers, social validation pulses.'
  },
  {
    id: 'xianyu02',
    name: 'Xianyu C2C (V.2)',
    emoji: '♻️',
    color: 'text-yellow-500',
    desc: 'Authentic second-hand style, honest wear marks, real home setting',
    promptTemplate: 'Xianyu V.2: Natural home setting, honest flaw callouts, smartphone photo aesthetic.'
  },
];

// โมเดล Gemini ที่ใช้สำหรับสร้างภาพ
const GEMINI_IMAGE_MODELS = [
  {
    id: 'gemini-3.1-flash-image',
    name: 'Gemini 3.1 Flash Image',
    badge: 'Recommended',
    badgeColor: 'bg-gradient-to-r from-emerald-600 to-teal-500',
    desc: 'Nano Banana 2 (GA) — โมเดลหลัก สร้างและจำลองฉากจากรูปสินค้าอ้างอิงโดยตรง ป้องกันสินค้าเพี้ยน',
    borderColor: 'border-emerald-500',
    glowColor: 'shadow-emerald-500/40',
    textColor: 'text-emerald-400',
    iconBg: 'from-emerald-500 to-teal-400',
  },
  {
    id: 'gemini-3-pro-image-preview',
    name: 'Gemini 3 Pro Image',
    badge: 'Nano Banana Pro',
    badgeColor: 'bg-gradient-to-r from-purple-600 to-violet-500',
    desc: 'โมเดลระดับพรีเมียม คุณภาพภาพสูง Studio Realistic สำหรับงาน E-Commerce ระดับมืออาชีพ',
    borderColor: 'border-purple-500',
    glowColor: 'shadow-purple-500/40',
    textColor: 'text-purple-400',
    iconBg: 'from-purple-600 to-violet-500',
  },
  {
    id: 'product-recontext-v1',
    name: 'Product Recontext (Imagen)',
    badge: 'Product Lock',
    badgeColor: 'bg-gradient-to-r from-orange-500 to-rose-500',
    desc: 'โมเดลวิเคราะห์ตัดขอบสินค้าและจำลองฉากใหม่โดยคงรูปร่างสินค้า 100%',
    borderColor: 'border-orange-500',
    glowColor: 'shadow-orange-500/40',
    textColor: 'text-orange-400',
    iconBg: 'from-orange-500 to-rose-400',
  },
  {
    id: 'gemini-2.5-flash-image',
    name: 'Gemini 2.5 Flash Image',
    badge: 'Standard',
    badgeColor: 'bg-slate-600',
    desc: 'รุ่นมาตรฐานเดิม เหมาะกับการใช้งานสร้างภาพทั่วไป',
    borderColor: 'border-blue-500',
    glowColor: 'shadow-blue-500/40',
    textColor: 'text-blue-400',
    iconBg: 'from-blue-500 to-cyan-400',
  },
];

// Migrates sessions saved before the Gemini 3.1 Flash Image preview retirement.
const normalizeImageModelSelection = (model?: string) =>
  model === 'gemini-3.1-flash-image-preview' ? 'gemini-3.1-flash-image' : model;

// Aspect Ratio options
const ASPECT_RATIOS = [
  { id: '1:1', label: '1:1', name: 'Square', icon: '⬛', desc: 'Shopee/Lazada Product' },
  { id: '4:5', label: '4:5', name: 'Portrait', icon: '📱', desc: 'Instagram Feed' },
  { id: '9:16', label: '9:16', name: 'Story', icon: '📲', desc: 'TikTok / Shopee Live' },
  { id: '16:9', label: '16:9', name: 'Landscape', icon: '🖥️', desc: 'Banner / YouTube' },
  { id: '3:4', label: '3:4', name: 'Classic', icon: '🖼️', desc: 'Pinterest / Poster' },
];

const App: React.FC = () => {
  const { addNotification, notifications, removeNotification } = useNotification();
  const { user, login, register, loginWithSocial, logout, deductCredit, addCredits, refreshBilling, isLoading: authLoading } = useAuth();

  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [apiKeys, setApiKeys] = useState<string[]>(() => {
    const keys = getApiKeys();
    return keys.length > 0 ? keys : [''];
  });
  const [keyVisibility, setKeyVisibility] = useState<boolean[]>(() => {
    const keys = getApiKeys();
    return keys.length > 0 ? new Array(keys.length).fill(false) : [false];
  });
  const [removeBgKey, setRemoveBgKey] = useState<string>(() => {
    return localStorage.getItem('remove_bg_api_key') || '';
  });
  const [showRemoveBgKey, setShowRemoveBgKey] = useState<boolean>(false);

  // States สำหรับ Authentication UI
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authName, setAuthName] = useState<string>('');
  const [isSubmittingAuth, setIsSubmittingAuth] = useState<boolean>(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState<boolean>(false);
  const [publicScreen, setPublicScreen] = useState<'landing' | 'login'>('landing');
  const [showPublicLanding, setShowPublicLanding] = useState(false);
  const [pendingPlanId, setPendingPlanId] = useState<PlanId | undefined>();
  const [showPricingCheckout, setShowPricingCheckout] = useState(false);
  const [studioMode, setStudioMode] = useState(false);
  const [thaiAdsSession, setThaiAdsSession] = useState<ThaiAdsSession>(createThaiAdsSession);

  const [productUrl, setProductUrl] = useState<string>('');
  const [productName, setProductName] = useState<string>('');
  const [productDesc, setProductDesc] = useState<string>('');
  const [productPrice, setProductPrice] = useState<ProductPrice>({ currency: 'THB' });
  const [variantGroups, setVariantGroups] = useState<ProductVariantGroup[]>([]);
  const [selectedVariantOptionIds, setSelectedVariantOptionIds] = useState<string[]>([]);
  // Commerce data is useful, but must be consciously opted into because
  // incomplete marketplace data can make an image prompt less reliable.
  const [usePriceInGeneration, setUsePriceInGeneration] = useState(false);
  const [useVariantsInGeneration, setUseVariantsInGeneration] = useState(false);
  const [cardVisualStyles, setCardVisualStyles] = useState<Record<string, string>>({});
  const [summaryLength, setSummaryLength] = useState<'short' | 'medium' | 'long'>('medium');
  const [isSavingToFolder, setIsSavingToFolder] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<string>('shopee');
  const [selectedImageModel, setSelectedImageModel] = useState<string>('gemini-3.1-flash-image'); // โมเดลสำหรับสร้างภาพ
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isScrapingOnly, setIsScrapingOnly] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const activeGenerationRef = useRef<AbortController | null>(null);
  const [scrapedImages, setScrapedImages] = useState<string[]>([]);
  const [originalScrapedImages, setOriginalScrapedImages] = useState<string[]>([]); // Backup for undo
  const [localImages, setLocalImages] = useState<string[]>([]);
  const [originalLocalImages, setOriginalLocalImages] = useState<string[]>([]); // Backup for undo
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [regenerationAttempts, setRegenerationAttempts] = useState<{ [key: string]: number }>({});
  const [step, setStep] = useState<number>(1);
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState<boolean>(true); // Persistent state loading flag

  useEffect(() => {
    if (user && pendingPlanId) setShowPricingCheckout(true);
  }, [user, pendingPlanId]);

  // State สำหรับเปิดปิด Modal Canva-like
  const [editingImageParams, setEditingImageParams] = useState<{ isScraped: boolean; index: number; url: string } | null>(null);

  // เพิ่ม state สำหรับจัดการการแก้ไข prompt
  const [editingPrompt, setEditingPrompt] = useState<{ [key: string]: boolean }>({});
  const [promptInputs, setPromptInputs] = useState<{ [key: string]: string }>({});

  // เพิ่ม state สำหรับเลือก Lifestyle สำหรับ Regenerate
  const [selectedLifestyle, setSelectedLifestyle] = useState<{ [key: string]: ImageCategory }>({});

  // เพิ่ม state สำหรับเลือก Social Proof Variant สำหรับ Regenerate
  const [selectedSocialProof, setSelectedSocialProof] = useState<{ [key: string]: string }>({});

  // Style override states สำหรับ INFOGRAPHIC, SIZE_CHART, TUTORIAL
  const [selectedInfographicStyle, setSelectedInfographicStyle] = useState<{ [key: string]: string }>({});
  const [selectedSizeChartStyle, setSelectedSizeChartStyle] = useState<{ [key: string]: string }>({});
  const [selectedTutorialStyle, setSelectedTutorialStyle] = useState<{ [key: string]: string }>({});

  // เพิ่ม state สำหรับเลือกหมวดหมู่ที่ต้องการ generate
  const [selectedCategories, setSelectedCategories] = useState<Set<ImageCategory>>(new Set(Object.keys(IMAGE_CATEGORIES_METADATA) as ImageCategory[]));
  const [isSummarizing, setIsSummarizing] = useState(false); // New state for summarization loading
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string>('1:1'); // Global aspect ratio
  const [imageAspectRatios, setImageAspectRatios] = useState<{ [key: string]: string }>({}); // Per-image ratio override

  // เพิ่ม state สำหรับ Tutorial Step Prompts (4 ช่อง)
  const DEFAULT_TUTORIAL_STEPS = [
    "ขั้นตอนที่ 1: แกะกล่อง/เปิดใช้งาน (Unboxing/Prepare)",
    "ขั้นตอนที่ 2: เตรียมอุปกรณ์/ติดตั้ง (Setup/Install)",
    "ขั้นตอนที่ 3: เริ่มใช้งานจริง (Usage)",
    "ขั้นตอนที่ 4: ผลลัพธ์สำเร็จ (Result)"
  ];
  const [tutorialStepPrompts, setTutorialStepPrompts] = useState<string[]>(DEFAULT_TUTORIAL_STEPS);
  const [showTutorialConfig, setShowTutorialConfig] = useState<boolean>(false);

  // เพิ่ม state สำหรับ Preview Image
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [previewOffset, setPreviewOffset] = useState({ x: 0, y: 0 });
  const [isPreviewDragging, setIsPreviewDragging] = useState(false);
  const previewDragStart = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null);
  const [resultsDensity, setResultsDensity] = useState<ResultsDensity>('standard');
  const [isManualScaleOpen, setIsManualScaleOpen] = useState(false);
  const [manualScaleDraft, setManualScaleDraft] = useState<ManualScaleDraft>(createManualScaleDraft);

  const resetPreviewView = () => {
    previewDragStart.current = null;
    setIsPreviewDragging(false);
    setPreviewScale(1);
    setPreviewOffset({ x: 0, y: 0 });
  };

  const openPreview = (url: string) => {
    resetPreviewView();
    setPreviewImage(url);
  };

  const closePreview = () => {
    setPreviewImage(null);
    resetPreviewView();
  };

  useEffect(() => {
    if (!previewImage) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePreview();
      if (event.key === '+' || event.key === '=') setPreviewScale(value => Math.min(4, value + 0.25));
      if (event.key === '-') setPreviewScale(value => Math.max(0.5, value - 0.25));
      if (event.key === '0') resetPreviewView();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewImage]);

  // เพิ่ม state สำหรับเลือก Style เฉพาะของ Cover Image
  const [selectedCoverStyle, setSelectedCoverStyle] = useState<string | null>(null);

  // Lifestyle options สำหรับ dropdown
  const LIFESTYLE_OPTIONS = [
    { id: ImageCategory.LIFESTYLE_A, name: 'Home (ในบ้าน)', desc: 'Indoor / Cozy setting' },
    { id: ImageCategory.LIFESTYLE_B, name: 'Outdoor (กลางแจ้ง)', desc: 'Nature / Outside setting' },
    { id: ImageCategory.LIFESTYLE_C, name: 'Professional (ออฟฟิศ)', desc: 'Office / Urban setting' },
    { id: ImageCategory.LIFESTYLE_THAI_STREET_FOOD, name: 'Thai Street Food', desc: 'สตรีทฟู้ดไทย / รถเข็น' },
    { id: ImageCategory.LIFESTYLE_THAI_MARKET, name: 'Thai Market', desc: 'ตลาดสดไทย / ตลาดนัด' },
    { id: ImageCategory.LIFESTYLE_THAI_KITCHEN, name: 'Thai Kitchen', desc: 'ครัวไทย / ทำอาหารไทย' },
    { id: ImageCategory.LIFESTYLE_ISAN_KITCHEN, name: 'Isan Kitchen', desc: 'ครัวอีสาน / ส้มตำ' },
    { id: ImageCategory.LIFESTYLE_THAI_LOCAL_RESTAURANT, name: 'Thai Local Restaurant', desc: 'ร้านอาหารท้องถิ่นไทย' },
  ];

  // Social Proof options สำหรับ dropdown
  const SOCIAL_PROOF_OPTIONS = [
    { id: 'unboxing-moment', name: 'Unboxing Moment', desc: 'แกะกล่องโชว์สินค้า' },
    { id: 'just-arrived', name: 'Just Arrived', desc: 'สินค้าเพิ่งส่งถึงบ้าน' },
    { id: 'happy-customer', name: 'Happy Customer', desc: 'ลูกค้าถือสินค้าด้วยความสุข' },
    { id: 'in-use-lifestyle', name: 'In-use Lifestyle', desc: 'การใช้งานจริงในชีวิตประจำวัน' },
  ];

  // ─── Style Options สำหรับหมวดที่สุ่ม prompt ──────────────────────
  const INFOGRAPHIC_STYLE_OPTIONS = [
    { id: '0', name: '🎲 สุ่มอัตโนมัติ', desc: 'ระบบจะสุ่มสไตล์ให้' },
    { id: '1', name: 'Modern Flat', desc: 'พื้นหลัง gradient + icon แบน' },
    { id: '2', name: 'Dark Premium', desc: 'พื้นดำ + accent สีทอง/นีออน' },
    { id: '3', name: 'Magazine/Editorial', desc: 'สไตล์นิตยสารหรู' },
    { id: '4', name: 'Isometric 3D', desc: 'สไตล์ isometric มุมสูง' },
    { id: '5', name: 'Split Color Block', desc: 'แบ่งซีกสี 2 สี' },
    { id: '6', name: 'Minimalist Data', desc: 'มินิมอล เน้นข้อมูล' },
  ];

  const SIZE_CHART_STYLE_OPTIONS = [
    { id: '0', name: '🎲 สุ่มอัตโนมัติ', desc: 'ระบบจะสุ่มสไตล์ให้' },
    { id: '1', name: 'Clean Comparison Grid', desc: 'ตารางเทียบขนาดสะอาดตา' },
    { id: '2', name: 'Lifestyle Scale Shot', desc: 'ถ่ายเทียบขนาดในชีวิตจริง' },
    { id: '3', name: 'Technical Blueprint', desc: 'สเก็ตช์เทคนิคสไตล์พิมพ์เขียว' },
    { id: '4', name: 'Fun Comparison', desc: 'เทียบขนาดสนุกๆ กับของรอบข้าง' },
    { id: '5', name: 'Size Variants', desc: 'แสดงหลายขนาด S/M/L' },
    { id: '6', name: 'Flat Lay with Ruler', desc: 'ถ่ายมุมบนพร้อมไม้บรรทัด' },
  ];

  const TUTORIAL_STYLE_OPTIONS = [
    { id: '0', name: '🎲 สุ่มอัตโนมัติ', desc: 'ระบบจะสุ่มสไตล์ให้' },
    { id: '1', name: '2×2 Grid', desc: 'ตาราง 2x2 คลาสสิก' },
    { id: '2', name: 'Horizontal Timeline', desc: 'Timeline แนวนอน' },
    { id: '3', name: 'Magazine Spread', desc: 'สไตล์นิตยสาร' },
    { id: '4', name: 'Dark Tech', desc: 'สไตล์เทคโนโลยีมืด' },
    { id: '5', name: 'Hand-drawn / Sketch', desc: 'สไตล์วาดมือ/สเก็ตช์' },
    { id: '6', name: 'Vertical Scroll Story', desc: 'สไตล์ Story/Reels แนวตั้ง' },
  ];

  const { theme, toggleTheme } = useTheme(); // ใช้ hook สำหรับจัดการธีม

  const fileInputRef = useRef<HTMLInputElement>(null);

  // สื่อสารกับ Extension
  useEffect(() => {
    const handleExtensionData = (event: any) => {
      console.log("=== PICSELLER: Received data from extension ===");
      console.log("Full event.detail:", event.detail);
      console.log("productUrl:", event.detail?.productUrl);
      console.log("productName:", event.detail?.productName);
      console.log("productDesc:", event.detail?.productDesc);
      console.log("images:", event.detail?.images);
      console.log("images length:", event.detail?.images?.length);

       const { productUrl, productName, productDesc, images, price, variantGroups: incomingVariantGroups } = event.detail || {};

      // ล้างข้อมูลเก่าทั้งหมดก่อนรับข้อมูลใหม่
      setLocalImages([]);
      setOriginalLocalImages([]);
      setScrapedImages([]);
      setOriginalScrapedImages([]);
      setGeneratedImages([]);
       setProductUrl('');
       setProductName('');
       setProductDesc('');
       setProductPrice({ currency: 'THB' });
       setVariantGroups([]);
       setSelectedVariantOptionIds([]);
       setUsePriceInGeneration(false);
       setUseVariantsInGeneration(false);

      // ตั้งค่าข้อมูลใหม่
      if (productUrl) {
        console.log("Setting productUrl:", productUrl);
        setProductUrl(productUrl);
      }
      if (productName) {
        console.log("Setting productName:", productName);
        setProductName(productName);
      }
       if (productDesc) {
        console.log("Setting productDesc:", productDesc);
         setProductDesc(productDesc);
       }
       if (price && typeof price === 'object') {
         setProductPrice({ currency: 'THB', ...price });
       }
       if (Array.isArray(incomingVariantGroups)) {
         setVariantGroups(incomingVariantGroups);
       }
      if (images && Array.isArray(images) && images.length > 0) {
        console.log("Setting scrapedImages:", images.length, "images");
        setScrapedImages(images);
        setOriginalScrapedImages(images);
      } else {
        console.warn("No images received or images array is empty");
      }

      setStep(1);
       const variantCount = Array.isArray(incomingVariantGroups) ? incomingVariantGroups.reduce((total, group) => total + (group.options?.length || 0), 0) : 0;
       alert(`รับข้อมูลจาก Gimi Shopee X เรียบร้อยแล้ว!\n\nชื่อสินค้า: ${productName || 'ไม่มี'}\nราคา: ${price?.display || 'ไม่มี'}\nตัวเลือก: ${variantCount} รายการ\nรูป: ${images?.length || 0} รูป`);
    };

    // SECURITY: Listen for generic event name from extension (replaces old 'SHOPEE_X_DATA_TRANSFER')
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === '__xfer_msg') {
        handleExtensionData({ detail: event.data.detail });
      }
    };
    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // Load state from IndexedDB on startup
  useEffect(() => {
    const restoreState = async () => {
      try {
        const savedState = await loadFromDB<any>('appState');
        if (savedState) {
           if (savedState.productUrl) setProductUrl(savedState.productUrl);
           if (savedState.productName) setProductName(savedState.productName);
           if (savedState.productDesc) setProductDesc(savedState.productDesc);
           if (savedState.productPrice) setProductPrice({ currency: 'THB', ...savedState.productPrice });
           if (Array.isArray(savedState.variantGroups)) setVariantGroups(savedState.variantGroups);
           if (Array.isArray(savedState.selectedVariantOptionIds)) setSelectedVariantOptionIds(savedState.selectedVariantOptionIds);
           if (typeof savedState.usePriceInGeneration === 'boolean') setUsePriceInGeneration(savedState.usePriceInGeneration);
           if (typeof savedState.useVariantsInGeneration === 'boolean') setUseVariantsInGeneration(savedState.useVariantsInGeneration);
           if (savedState.cardVisualStyles) setCardVisualStyles(savedState.cardVisualStyles);
           if (savedState.resultsDensity === 'overview' || savedState.resultsDensity === 'standard' || savedState.resultsDensity === 'focus') setResultsDensity(savedState.resultsDensity);
           if (savedState.manualScaleDraft && typeof savedState.manualScaleDraft === 'object') setManualScaleDraft(previous => ({ ...previous, ...savedState.manualScaleDraft }));
          if (savedState.scrapedImages) {
            setScrapedImages(savedState.scrapedImages);
            setOriginalScrapedImages(savedState.scrapedImages);
          }
          if (savedState.localImages) {
            setLocalImages(savedState.localImages);
            setOriginalLocalImages(savedState.localImages);
          }
          if (savedState.generatedImages) setGeneratedImages(savedState.generatedImages);
          if (savedState.selectedStyle) setSelectedStyle(savedState.selectedStyle);
          if (savedState.selectedImageModel) setSelectedImageModel(normalizeImageModelSelection(savedState.selectedImageModel));
          if (savedState.step) setStep(savedState.step);
          if (savedState.selectedCategories) setSelectedCategories(new Set(savedState.selectedCategories));
          if (savedState.thaiAdsSession) {
            const restoredThaiAds = savedState.thaiAdsSession as ThaiAdsSession;
            setThaiAdsSession({
              ...createThaiAdsSession(),
              ...restoredThaiAds,
              isGenerating: false,
              cards: (restoredThaiAds.cards || []).map(card => card.status === 'generating'
                ? { ...card, status: 'error', error: 'งานหยุดเนื่องจากมีการรีเฟรชหน้า กรุณาสร้างภาพนี้ใหม่' }
                : card),
            });
          }
        }
      } catch (err) {
        console.error('Failed to restore state from DB:', err);
      } finally {
        setIsRestoring(false);
      }
    };
    restoreState();
  }, []);

  // Save state to IndexedDB on change (debounce naturally by reactivity)
  useEffect(() => {
    if (isRestoring) return; // Don't save while we are still loading

    const stateToSave = {
       productUrl,
       productName,
       productDesc,
       productPrice,
       variantGroups,
       selectedVariantOptionIds,
       usePriceInGeneration,
       useVariantsInGeneration,
       cardVisualStyles,
       resultsDensity,
       manualScaleDraft,
      scrapedImages,
      localImages,
      generatedImages,
      selectedStyle,
      selectedImageModel,
      step,
      selectedCategories: Array.from(selectedCategories),
      thaiAdsSession,
    };
    
    saveToDB('appState', stateToSave).catch(err => console.error('Failed to save state to DB:', err));
  }, [
    isRestoring,
    productUrl,
    productName,
    productDesc,
    productPrice,
    variantGroups,
    selectedVariantOptionIds,
    usePriceInGeneration,
    useVariantsInGeneration,
    cardVisualStyles,
    resultsDensity,
    manualScaleDraft,
    scrapedImages,
    localImages,
    generatedImages,
    selectedStyle,
    selectedImageModel,
    step,
    selectedCategories,
    thaiAdsSession
  ]);

  // ==========================================
  // CLEAR DB HANDLER
  // ==========================================
  const handleClearDB = async () => {
    if (window.confirm('คุณแน่ใจหรือไม่ที่จะลบข้อมูลทั้งหมดที่เก็บไว้ในเบราว์เซอร์? ข้อมูลที่ถูกลบจะไม่สามารถกู้คืนได้')) {
      try {
        await clearDB();
        addNotification('success', 'ลบข้อมูลสำเร็จ', 'ข้อมูลทั้งหมดถูกลบแล้ว');
        // Reload the page to clear any in-memory state
        window.location.reload();
      } catch (error) {
        console.error('Error clearing DB:', error);
        addNotification('error', 'ลบข้อมูลล้มเหลว', 'ไม่สามารถลบข้อมูลได้');
      }
    }
  };

  // ==========================================
  // AUTHENTICATION HANDLERS
  // ==========================================
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword) {
      addNotification('error', 'ข้อมูลไม่ครบถ้วน', 'กรุณากรอกอีเมลและรหัสผ่าน');
      return;
    }
    if (authTab === 'register' && !authName) {
      addNotification('error', 'ข้อมูลไม่ครบถ้วน', 'กรุณากรอกชื่อผู้ใช้งาน');
      return;
    }

    setIsSubmittingAuth(true);
    try {
      if (authTab === 'login') {
        const result = await login(authEmail, authPassword);
        if (result.success) {
          addNotification('success', 'เข้าสู่ระบบสำเร็จ', result.message);
        } else {
          addNotification('error', 'เข้าสู่ระบบล้มเหลว', result.message);
        }
      } else {
        const result = await register(authEmail, authPassword, authName);
        if (result.success) {
          addNotification('success', 'ลงทะเบียนสำเร็จ', result.message);
          setAuthTab('login');
        } else {
          addNotification('error', 'ลงทะเบียนล้มเหลว', result.message);
        }
      }
    } catch (err: any) {
      addNotification('error', 'เกิดข้อผิดพลาด', err.message || 'ระบบเกิดข้อผิดพลาดในการตรวจสอบสิทธิ์');
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'facebook' | 'apple') => {
    setIsSubmittingAuth(true);
    try {
      const result = await loginWithSocial(provider);
      if (result.success) {
        addNotification('success', 'เชื่อมต่อสำเร็จ', result.message);
      } else {
        addNotification('error', 'เชื่อมต่อล้มเหลว', result.message);
      }
    } catch (err: any) {
      addNotification('error', 'เชื่อมต่อล้มเหลว', `ไม่สามารถเข้าสู่ระบบผ่าน ${provider} ได้`);
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  // ==========================================
  // SETTINGS HANDLERS
  // ==========================================
  const handleSaveSettings = () => {
    const validKeys = apiKeys.filter(k => k.trim());
    localStorage.setItem('gemini_api_keys', JSON.stringify(validKeys));
    localStorage.setItem('remove_bg_api_key', removeBgKey);
    addNotification('success', 'บันทึกการตั้งค่าแล้ว', 'อัปเดต API Keys สำหรับการประมวลผลเรียบร้อย');
    setShowSettings(false);
  };

  const handleAddApiKey = () => {
    setApiKeys(prev => [...prev, '']);
    setKeyVisibility(prev => [...prev, false]);
  };

  const handleRemoveApiKey = (index: number) => {
    if (apiKeys.length <= 1) {
      setApiKeys(['']);
      setKeyVisibility([false]);
      return;
    }
    setApiKeys(prev => prev.filter((_, i) => i !== index));
    setKeyVisibility(prev => prev.filter((_, i) => i !== index));
  };

  const handleApiKeyChange = (index: number, value: string) => {
    const updated = [...apiKeys];
    updated[index] = value;
    setApiKeys(updated);
  };

  const toggleKeyVisibility = (index: number) => {
    const updated = [...keyVisibility];
    updated[index] = !updated[index];
    setKeyVisibility(updated);
  };

  // Helper to convert URL to Base64 (using proxy to avoid CORS)
  const imageUrlToBase64 = async (url: string): Promise<string> => {
    try {
      // Return data URL directly if it's already one
      if (url.startsWith('data:')) return url;

      let blob: Blob;

      // Handle local blob URLs directly without proxy
      if (url.startsWith('blob:')) {
        const response = await fetch(url);
        blob = await response.blob();
      } else {
        // Use proxy for remote URLs
        const imgRes = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url as string)}`);
        blob = await imgRes.blob();
      }

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.error("Failed to convert image:", url, e);
      return "";
    }
  };

  const getPriceDisplay = (price: ProductPrice = productPrice) => {
    if (price.display) return price.display;
    const min = price.min ?? price.current;
    const max = price.max ?? price.current;
    if (min === undefined) return '';
    const format = (value: number) => `฿${value.toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;
    return min === max || max === undefined ? format(min) : `${format(min)} - ${format(max)}`;
  };

  const updateProductPrice = (field: 'min' | 'max' | 'current' | 'original', value: string) => {
    const numeric = value.trim() === '' ? undefined : Number(value.replace(/,/g, ''));
    setProductPrice(previous => {
      const next = { ...previous, currency: previous.currency || 'THB', [field]: Number.isFinite(numeric) ? numeric : undefined };
      return { ...next, display: getPriceDisplay({ ...next, display: '' }) };
    });
  };

  const buildCurrentProductData = (images: string[], variantLabel?: string): ProductData => {
    const optionFacts = useVariantsInGeneration
      ? variantGroups.flatMap(group => group.options.slice(0, 12).map(option => `${group.name}: ${option.label}${usePriceInGeneration && option.price?.display ? ` (${option.price.display})` : ''}`))
      : [];
    const confirmedPrice = usePriceInGeneration ? getPriceDisplay() : '';
    const description = [
      productDesc || 'ไม่มีรายละเอียด',
      confirmedPrice ? `ราคาที่ยืนยันแล้ว: ${confirmedPrice}` : '',
      variantLabel ? `ตัวเลือกที่ต้องสร้างภาพนี้: ${variantLabel}` : '',
    ].filter(Boolean).join('\n');
    return {
      name: variantLabel ? `${productName || 'สินค้าใหม่'} — ${variantLabel}` : productName || 'สินค้าใหม่',
      description,
      images,
      features: [...productDesc.split('\n').map(line => line.replace(/^[-*•\s]+/, '').trim()).filter(line => line.length > 2).slice(0, 8), ...optionFacts].slice(0, 12),
      price: usePriceInGeneration ? productPrice : undefined,
      variantGroups: useVariantsInGeneration ? variantGroups : [],
    };
  };

  const toggleVariantOption = (optionId: string) => {
    setSelectedVariantOptionIds(previous => previous.includes(optionId)
      ? previous.filter(id => id !== optionId)
      : [...previous, optionId]);
  };

  const updateVariantOption = (groupId: string, optionId: string, patch: Record<string, unknown>) => {
    setVariantGroups(previous => previous.map(group => group.id !== groupId ? group : {
      ...group,
      options: group.options.map(option => option.id === optionId ? { ...option, ...patch } : option),
    }));
  };

  const addVariantOption = (groupId: string) => {
    setVariantGroups(previous => previous.map(group => group.id !== groupId ? group : {
      ...group,
      options: [...group.options, { id: `${group.id}-${Date.now()}`, label: 'ตัวเลือกใหม่' }],
    }));
  };

  const addVariantGroup = () => {
    const id = `manual-group-${Date.now()}`;
    setVariantGroups(previous => [...previous, {
      id,
      name: 'ตัวเลือกสินค้า',
      options: [{ id: `${id}-option-1`, label: 'ตัวเลือกใหม่' }],
    }]);
  };

  const openManualScaleCorrection = () => {
    const firstOption = variantGroups.flatMap(group => group.options.map(option => ({
      id: option.id,
      label: `${group.name}: ${option.label}`,
    })))[0];
    setManualScaleDraft(previous => ({
      ...previous,
      variantId: previous.variantId || firstOption?.id || '',
      variantLabel: previous.variantLabel || firstOption?.label || productName || 'สินค้า',
    }));
    setIsManualScaleOpen(true);
  };

  const restoreOriginalSizeChart = () => {
    setGeneratedImages(previous => previous.map(image => (
      image.category === ImageCategory.SIZE_CHART && !image.variantLabel && image.isManualScale && image.originalUrl
        ? { ...image, url: image.originalUrl, originalUrl: undefined, isManualScale: false, modelUsed: 'AI Size Chart (restored)' }
        : image
    )));
    addNotification('success', 'กลับสู่ภาพ AI แล้ว', 'คืนภาพ Size Chart ก่อนแก้สเกลเรียบร้อย');
  };

  const createManualScaleChart = () => {
    const toNumber = (value: string) => Number(value.replace(/,/g, '').trim());
    const widthCm = toNumber(manualScaleDraft.widthCm);
    const lengthCm = toNumber(manualScaleDraft.lengthCm);
    const depthCm = manualScaleDraft.depthCm.trim() ? toNumber(manualScaleDraft.depthCm) : undefined;
    const meshCellMm = manualScaleDraft.meshCellMm.trim() ? toNumber(manualScaleDraft.meshCellMm) : undefined;
    const preset = SCALE_REFERENCE_PRESETS.find(reference => reference.id === manualScaleDraft.referenceId) || SCALE_REFERENCE_PRESETS[0];
    const referenceWidthMm = preset.id === 'custom' ? toNumber(manualScaleDraft.customReferenceWidthMm) : preset.widthMm;
    const referenceHeightMm = preset.id === 'custom' ? toNumber(manualScaleDraft.customReferenceHeightMm) : preset.heightMm;

    if (!Number.isFinite(widthCm) || widthCm <= 0 || !Number.isFinite(lengthCm) || lengthCm <= 0) {
      addNotification('error', 'กรอกขนาดจริงก่อน', 'ระบุกว้างและยาวของสินค้าหน่วยเซนติเมตรเพื่อคำนวณสเกล');
      return;
    }
    if (!Number.isFinite(referenceWidthMm) || referenceWidthMm <= 0 || !Number.isFinite(referenceHeightMm) || referenceHeightMm <= 0) {
      addNotification('error', 'ขนาดวัตถุอ้างอิงไม่ถูกต้อง', 'กรอกกว้างและสูงของวัตถุอ้างอิงเป็นมิลลิเมตร');
      return;
    }
    if (meshCellMm !== undefined && (!Number.isFinite(meshCellMm) || meshCellMm <= 0)) {
      addNotification('error', 'ขนาดช่องตะแกรงไม่ถูกต้อง', 'กรอกขนาดช่องตะแกรงเป็นมิลลิเมตร หรือเว้นว่างไว้');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1600;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const roundedRect = (x: number, y: number, width: number, height: number, radius: number) => {
      const r = Math.min(radius, width / 2, height / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + width, y, x + width, y + height, r);
      ctx.arcTo(x + width, y + height, x, y + height, r);
      ctx.arcTo(x, y + height, x, y, r);
      ctx.arcTo(x, y, x + width, y, r);
      ctx.closePath();
    };
    const drawArrow = (x1: number, y1: number, x2: number, y2: number, label: string, labelX: number, labelY: number) => {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const arrow = 12;
      ctx.strokeStyle = '#ea580c';
      ctx.fillStyle = '#9a3412';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      [[x1, y1, angle + Math.PI], [x2, y2, angle]].forEach(([x, y, direction]) => {
        ctx.beginPath();
        ctx.moveTo(x as number, y as number);
        ctx.lineTo((x as number) - arrow * Math.cos((direction as number) - .45), (y as number) - arrow * Math.sin((direction as number) - .45));
        ctx.lineTo((x as number) - arrow * Math.cos((direction as number) + .45), (y as number) - arrow * Math.sin((direction as number) + .45));
        ctx.closePath();
        ctx.fill();
      });
      ctx.font = '700 29px "Noto Sans Thai", Tahoma, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, labelX, labelY);
    };
    const format = (value: number) => value.toLocaleString('th-TH', { maximumFractionDigits: 2 });

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(148, 163, 184, .14)';
    ctx.lineWidth = 1;
    for (let position = 0; position <= 1600; position += 50) {
      ctx.beginPath(); ctx.moveTo(position, 0); ctx.lineTo(position, 1600); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, position); ctx.lineTo(1600, position); ctx.stroke();
    }

    const productWidthMm = widthCm * 10;
    const productLengthMm = lengthCm * 10;
    const visualHeight = 760;
    const visualWidth = 1250;
    const gapMm = 65;
    const pixelsPerMm = Math.min(visualHeight / Math.max(productLengthMm, referenceHeightMm), visualWidth / (productWidthMm + referenceWidthMm + gapMm));
    const productWidthPx = productWidthMm * pixelsPerMm;
    const productLengthPx = productLengthMm * pixelsPerMm;
    const referenceWidthPx = referenceWidthMm * pixelsPerMm;
    const referenceHeightPx = referenceHeightMm * pixelsPerMm;
    const allWidthPx = productWidthPx + referenceWidthPx + gapMm * pixelsPerMm;
    const productX = (canvas.width - allWidthPx) / 2;
    const productY = 270 + (visualHeight - productLengthPx) / 2;
    const referenceX = productX + productWidthPx + gapMm * pixelsPerMm;
    const referenceY = 270 + (visualHeight - referenceHeightPx) / 2;
    const productLabel = manualScaleDraft.variantLabel.trim() || productName || 'สินค้า';
    const referenceLabel = preset.id === 'custom'
      ? manualScaleDraft.customReferenceLabel.trim() || 'วัตถุอ้างอิง'
      : preset.label.split(' (')[0];

    ctx.fillStyle = '#0f172a';
    ctx.font = '800 52px "Noto Sans Thai", Tahoma, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('เทียบสเกลตามขนาดจริง', 110, 105);
    ctx.fillStyle = '#64748b';
    ctx.font = '600 27px "Noto Sans Thai", Tahoma, sans-serif';
    ctx.fillText(`${productLabel}  •  สเกลคำนวณจากข้อมูลที่กรอก ไม่ใช่การเดาของ AI`, 110, 150);

    roundedRect(productX, productY, productWidthPx, productLengthPx, 18);
    ctx.fillStyle = '#fdba74';
    ctx.fill();
    ctx.strokeStyle = '#c2410c';
    ctx.lineWidth = 6;
    ctx.stroke();
    if (meshCellMm !== undefined) {
      const cellPx = meshCellMm * pixelsPerMm;
      const columnCount = Math.floor(productWidthPx / cellPx);
      const rowCount = Math.floor(productLengthPx / cellPx);
      const skip = Math.max(1, Math.ceil(Math.max(columnCount, rowCount) / 65));
      ctx.strokeStyle = 'rgba(124, 45, 18, .6)';
      ctx.lineWidth = Math.max(1, Math.min(3, cellPx * .09));
      for (let column = 1; column <= columnCount; column += skip) {
        const x = productX + column * cellPx;
        ctx.beginPath(); ctx.moveTo(x, productY); ctx.lineTo(x, productY + productLengthPx); ctx.stroke();
      }
      for (let row = 1; row <= rowCount; row += skip) {
        const y = productY + row * cellPx;
        ctx.beginPath(); ctx.moveTo(productX, y); ctx.lineTo(productX + productWidthPx, y); ctx.stroke();
      }
    }

    if (preset.id === 'hand') {
      ctx.fillStyle = '#d9a77c';
      roundedRect(referenceX + referenceWidthPx * .14, referenceY + referenceHeightPx * .28, referenceWidthPx * .72, referenceHeightPx * .58, referenceWidthPx * .22);
      ctx.fill();
      const fingerWidth = referenceWidthPx * .13;
      for (let finger = 0; finger < 4; finger++) {
        roundedRect(referenceX + referenceWidthPx * (.16 + finger * .18), referenceY, fingerWidth, referenceHeightPx * (.36 - (finger === 0 || finger === 3 ? .05 : 0)), fingerWidth / 2);
        ctx.fill();
      }
      roundedRect(referenceX, referenceY + referenceHeightPx * .4, referenceWidthPx * .28, referenceHeightPx * .22, fingerWidth / 2);
      ctx.fill();
    } else {
      roundedRect(referenceX, referenceY, referenceWidthPx, referenceHeightPx, referenceWidthPx * .16);
      ctx.fillStyle = '#111827';
      ctx.fill();
      roundedRect(referenceX + referenceWidthPx * .055, referenceY + referenceHeightPx * .055, referenceWidthPx * .89, referenceHeightPx * .89, referenceWidthPx * .12);
      ctx.fillStyle = '#dbeafe';
      ctx.fill();
      ctx.fillStyle = '#111827';
      roundedRect(referenceX + referenceWidthPx * .38, referenceY + referenceHeightPx * .07, referenceWidthPx * .24, referenceHeightPx * .024, referenceWidthPx * .02);
      ctx.fill();
    }

    ctx.fillStyle = '#0f172a';
    ctx.font = '800 27px "Noto Sans Thai", Tahoma, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(productLabel, productX + productWidthPx / 2, productY - 28);
    ctx.fillText(referenceLabel, referenceX + referenceWidthPx / 2, referenceY - 28);
    drawArrow(productX, productY + productLengthPx + 58, productX + productWidthPx, productY + productLengthPx + 58, `กว้าง ${format(widthCm)} ซม.`, productX + productWidthPx / 2, productY + productLengthPx + 105);
    drawArrow(productX - 56, productY, productX - 56, productY + productLengthPx, `ยาว ${format(lengthCm)} ซม.`, productX - 120, productY + productLengthPx / 2);

    const scaleBarMm = productWidthMm >= 500 ? 100 : productWidthMm >= 200 ? 50 : 10;
    const scaleBarPx = scaleBarMm * pixelsPerMm;
    const scaleBarX = 110;
    const scaleBarY = 1360;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(scaleBarX, scaleBarY); ctx.lineTo(scaleBarX + scaleBarPx, scaleBarY); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(scaleBarX, scaleBarY - 16); ctx.lineTo(scaleBarX, scaleBarY + 16); ctx.moveTo(scaleBarX + scaleBarPx, scaleBarY - 16); ctx.lineTo(scaleBarX + scaleBarPx, scaleBarY + 16); ctx.stroke();
    ctx.font = '700 24px "Noto Sans Thai", Tahoma, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#334155';
    ctx.fillText(`${scaleBarMm} มม.`, scaleBarX, scaleBarY + 48);
    const dimensionsText = [`${format(widthCm)} × ${format(lengthCm)} ซม.`, depthCm !== undefined && Number.isFinite(depthCm) ? `ลึก ${format(depthCm)} ซม.` : '', meshCellMm !== undefined ? `ช่องตะแกรง ${format(meshCellMm)} มม.` : ''].filter(Boolean).join('  •  ');
    ctx.font = '800 34px "Noto Sans Thai", Tahoma, sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(dimensionsText, 110, 1470);
    ctx.font = '600 22px "Noto Sans Thai", Tahoma, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText(preset.isApproximate ? 'หมายเหตุ: มือผู้ใหญ่ใช้เพื่อให้เห็นภาพโดยประมาณเท่านั้น' : `Reference: ${referenceLabel} ${format(referenceWidthMm)} × ${format(referenceHeightMm)} มม.`, 110, 1520);

    const imageUrl = canvas.toDataURL('image/png');
    const manualPrompt = `Manual Scale Canvas — ${productLabel}; exact footprint ${format(widthCm)} × ${format(lengthCm)} cm; reference ${referenceLabel} ${format(referenceWidthMm)} × ${format(referenceHeightMm)} mm.`;
    const thaiTexts = [productLabel, `ขนาดจริง ${format(widthCm)} × ${format(lengthCm)} ซม.`, depthCm !== undefined && Number.isFinite(depthCm) ? `ลึก ${format(depthCm)} ซม.` : '', meshCellMm !== undefined ? `ช่องตะแกรง ${format(meshCellMm)} มม.` : ''].filter(Boolean);
    setGeneratedImages(previous => {
      const current = previous.find(image => image.category === ImageCategory.SIZE_CHART && !image.variantLabel);
      if (!current) return [...previous, {
        id: `manual-size-${Date.now()}`,
        category: ImageCategory.SIZE_CHART,
        url: imageUrl,
        prompt: manualPrompt,
        status: 'completed',
        thaiTexts,
        promptUsed: manualPrompt,
        modelUsed: 'Manual Scale Canvas (exact ratio)',
        isManualScale: true,
      }];
      return previous.map(image => image.id === current.id ? {
        ...image,
        url: imageUrl,
        status: 'completed',
        thaiTexts,
        promptUsed: manualPrompt,
        modelUsed: 'Manual Scale Canvas (exact ratio)',
        originalUrl: image.isManualScale ? image.originalUrl : image.url,
        isManualScale: true,
        error: undefined,
      } : image);
    });
    setIsManualScaleOpen(false);
    setStep(3);
    openPreview(imageUrl);
    addNotification('success', 'สร้าง Size Chart ตามสเกลจริงแล้ว', 'คำนวณอัตราส่วนจากมิติที่กรอกและวัตถุอ้างอิง โดยไม่ใช้ AI เดาขนาด');
  };

  const sendToThaiAds = async () => {
    const sourceImages = [...localImages, ...scrapedImages];
    if (!sourceImages.length) {
      addNotification('warning', 'ต้องมีรูปสินค้าก่อน', 'กรุณาอัปโหลดรูป หรือส่งข้อมูลสินค้าจาก Gimi Shopee X ก่อนเปิด Thai Ads');
      return;
    }

    addNotification('info', 'กำลังส่งข้อมูลไป Thai Ads', 'กำลังเตรียมรูปสินค้าและรายละเอียดจากหน้า Analyze…');
    const converted = await Promise.all(sourceImages.slice(0, 6).map(imageUrlToBase64));
    const images = converted.filter(Boolean);
    if (!images.length) {
      addNotification('error', 'เตรียมรูปไม่สำเร็จ', 'ไม่สามารถอ่านรูปสินค้าสำหรับ Thai Ads ได้ กรุณาลองอัปโหลดรูปโดยตรง');
      return;
    }

    // Analyze may contain Markdown, literal escaped newlines, or <br> tags
    // from the extension. Normalize all of them before extracting facts so
    // headings/blank lines do not consume the feature limit.
    const normalizedDescription = productDesc
      .replace(/\\n/g, '\n')
      .replace(/<br\s*\/?\s*>/gi, '\n');
    const facts = normalizedDescription
      .split(/\r?\n/)
      .map(line => line.replace(/^[>*•\-\s]+/, '').replace(/\*\*/g, '').trim())
      .filter(line => line.length > 2)
      .filter(line => !/^(จุดเด่นสินค้า|รายละเอียด|วิธีใช้งาน|คำขาย|hook)\s*:?$/i.test(line))
      .slice(0, 24);
    setThaiAdsSession({
      ...createThaiAdsSession(),
      assets: { product: images, package: [], logo: [] },
      name: productName || 'สินค้าใหม่',
      details: normalizedDescription,
      // Keep scraped commerce data in dedicated fields. ThaiAds exposes it
      // through opt-in toggles so incomplete variants/prices cannot destabilise
      // the default generation prompt.
      factsText: facts.join('\n'),
      price: productPrice,
      variantGroups,
      usePrice: usePriceInGeneration,
      useVariants: useVariantsInGeneration,
      notice: `รับข้อมูลสินค้าจาก Analyze แล้ว — ราคาและตัวเลือกปิดไว้เป็นค่าเริ่มต้น (${images.length} รูป)`,
    });
    setStudioMode(true);
    addNotification('success', 'ส่งไป Thai Ads แล้ว', `พร้อมสร้างภาพจากรูปอ้างอิง ${images.length} รูป`);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const totalReferenceImages = localImages.length + scrapedImages.length + files.length;
    if (totalReferenceImages > 4) {
      addNotification(
        'info',
        'AI จะวิเคราะห์รูปอ้างอิง 4 รูปแรก',
        'อัปโหลดรูปเพิ่มได้ แต่การวิเคราะห์ใช้สูงสุด 4 รูป; การสร้างภาพและสรุปใช้สูงสุด 3 รูป',
      );
    }

    (Array.from(files) as File[]).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setLocalImages(prev => [...prev, result]);
        setOriginalLocalImages(prev => [...prev, result]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeLocalImage = (index: number) => {
    setLocalImages(prev => prev.filter((_, i) => i !== index));
    setOriginalLocalImages(prev => prev.filter((_, i) => i !== index));
  };

  const removeScrapedImage = (index: number) => {
    setScrapedImages(prev => prev.filter((_, i) => i !== index));
    setOriginalScrapedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handlePreviewScrape = async () => {
    if (!productUrl) {
      addNotification('error', 'ลิงก์สินค้าว่างเปล่า', 'กรุณาใส่ Shopee Product URL ก่อนกดเรียกดู');
      return;
    }
    setIsScrapingOnly(true);
    setScrapeError(null);
    try {
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(productUrl as string)}`;
      const response = await fetch(proxyUrl);
      const rawBody = await response.text();
      let data: any;
      try {
        data = JSON.parse(rawBody);
      } catch {
        throw new Error('Shopee proxy ส่งข้อมูลกลับมาไม่ใช่ JSON กรุณาลองอัปโหลดรูปสินค้าเองแทนการดึงจากลิงก์');
      }
      const html = data.contents;
      const foundImages: string[] = [];
      const imgRegex = /https:\/\/cf\.shopee\.co\.th\/file\/[a-z0-9]+/gi;
      const matches = html.match(imgRegex);
      if (matches) {
        foundImages.push(...Array.from(new Set(matches as string[])).slice(0, 5));
      }
      if (foundImages.length === 0) {
        const placeholders = [
          'https://picsum.photos/400/400?random=101',
          'https://picsum.photos/400/400?random=102',
          'https://picsum.photos/400/400?random=103',
        ];
        setScrapedImages(placeholders);
        setOriginalScrapedImages(placeholders);
        addNotification('info', 'ใช้รูปภาพตัวอย่าง', 'ไม่พบรูปภาพในลิงก์สินค้า ระบบใช้รูปภาพสุ่มแทนชั่วคราว');
      } else {
        setScrapedImages(foundImages);
        setOriginalScrapedImages(foundImages);
        addNotification('success', 'ดึงข้อมูลสำเร็จ', `ดึงข้อมูลภาพสินค้า Shopee ได้ทั้งหมด ${foundImages.length} ภาพ`);
      }
    } catch (e) {
      setScrapeError("ไม่สามารถดึงภาพจริงได้เนื่องจากระบบป้องกันของ Shopee");
      addNotification('warning', 'สแกนรูปภาพไม่สำเร็จ', 'ไม่สามารถเข้าถึงหน้าสินค้าได้ ระบบใช้ภาพสุ่มทดแทน');
    } finally {
      setIsScrapingOnly(false);
    }
  };

  const handleScrape = async () => {
    if (!productUrl && !productName && localImages.length === 0) {
      addNotification('error', 'ข้อมูลไม่ครบถ้วน', 'กรุณาระบุข้อมูลสินค้าหรืออัปโหลดรูปภาพอย่างน้อย 1 อย่าง');
      return;
    }

    if (user) {
      if (!user.unlimitedCredits && user.credits < 1) {
        addNotification('error', 'เครดิตไม่เพียงพอ', 'กรุณาอัปเกรดแพ็กเกจหรือเติมเครดิตเพื่อวิเคราะห์สินค้า (ใช้ 1 เครดิต)');
        return;
      }
    }

    setIsAnalyzing(true);
    try {
      const imagesToAnalyze = await Promise.all(
        [...localImages, ...scrapedImages].map(url => imageUrlToBase64(url))
      );
      const validImages = imagesToAnalyze.filter(img => img && img !== "");

      const analysis = await analyzeProduct(`${productUrl} ${productName} ${productDesc}`, validImages);
      setProductName(prev => prev || analysis.name);
      setProductDesc(prev => prev || analysis.visualDescription);
      if (productUrl && scrapedImages.length === 0) await handlePreviewScrape();
      
      if (user) {
        const success = deductCredit(1);
        if (success) {
          addNotification('success', 'วิเคราะห์สินค้าสำเร็จ', user.unlimitedCredits ? 'บัญชีทดลอง Unlimited ไม่ถูกหักเครดิต' : 'หักเครดิตสำหรับการประมวลผล 1 เครดิต');
        }
      } else {
        addNotification('success', 'วิเคราะห์สินค้าสำเร็จ', 'AI วิเคราะห์ข้อมูลสินค้าเสร็จเรียบร้อยแล้ว');
      }
      setStep(2);
    } catch (error) {
      console.error("Analysis Error:", error);
      addNotification('error', 'วิเคราะห์สินค้าล้มเหลว', 'เกิดข้อผิดพลาดในการวิเคราะห์ข้อมูลด้วย AI');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const stopResultsGeneration = () => {
    const controller = activeGenerationRef.current;
    if (!controller || !isGenerating) return;
    const confirmed = window.confirm('หยุดการสร้างภาพตอนนี้หรือไม่?\n\nคำขอถูกส่งให้ AI แล้ว เครดิตอาจถูกใช้ไปแล้วและไม่สามารถคืนอัตโนมัติได้ คุณยืนยันที่จะหยุดใช่หรือไม่?');
    if (!confirmed) return;

    controller.abort();
    activeGenerationRef.current = null;
    setIsGenerating(false);
    setGeneratedImages(previous => previous.map(image => image.status === 'generating'
      ? { ...image, status: 'idle', url: '', error: undefined }
      : image));
    addNotification('warning', 'หยุดการสร้างแล้ว', 'เครดิตของคำขอที่ส่งถึง AI ไปแล้วอาจถูกใช้ไปแล้ว คุณสามารถกดสร้างใหม่ได้ทันที');
  };

  const startGeneration = async () => {
    if (selectedCategories.size === 0) {
      addNotification('warning', 'เลือกหมวดหมู่ก่อน', 'กรุณาเลือกอย่างน้อย 1 หมวดหมู่ที่ต้องการสร้างภาพ');
      return;
    }

    const sortedCategories = Object.keys(IMAGE_CATEGORIES_METADATA).sort(
      (a, b) => IMAGE_CATEGORIES_METADATA[a as ImageCategory].order - IMAGE_CATEGORIES_METADATA[b as ImageCategory].order
    ) as ImageCategory[];

    const categoriesToGenerate = sortedCategories.filter(cat => selectedCategories.has(cat));
    const requiredCredits = categoriesToGenerate.length;
    const allImages = [...localImages, ...scrapedImages];

    if (allImages.length === 0) {
      addNotification('warning', 'ต้องมีรูปสินค้าก่อน', 'Pipeline Product Recontext ต้องใช้รูปสินค้าต้นฉบับอย่างน้อย 1 รูป กรุณาอัปโหลดรูปหรือดึงข้อมูลสินค้าก่อนสร้างภาพ');
      return;
    }

    if (user) {
      if (!user.unlimitedCredits && user.credits < requiredCredits) {
        addNotification('error', 'เครดิตไม่เพียงพอ', `ต้องการ ${requiredCredits} เครดิตสำหรับสร้างภาพ ${requiredCredits} หมวดหมู่ (คุณมีอยู่ ${user.credits} เครดิต)`);
        return;
      }
    }

    const generationController = new AbortController();
    activeGenerationRef.current = generationController;
    setIsGenerating(true);
    const initialGenerated: GeneratedImage[] = categoriesToGenerate.map(cat => ({
      id: Math.random().toString(36).substr(2, 9),
      category: cat,
      url: '',
      prompt: '',
      status: 'idle'
    }));

    setGeneratedImages(initialGenerated);
    setStep(3);
    addNotification('info', 'กำลังประมวลผลรูปภาพ', `เตรียมความพร้อมและปรับภาพเป็น Base64 สำหรับส่งให้ AI Gemini...`);

    console.log("Processing images for AI...");
    const processedImages = await Promise.all(
      allImages.map(url => imageUrlToBase64(url))
    );
    const validImages = processedImages.filter(img => img && img !== "");

    if (validImages.length === 0) {
      addNotification('error', 'อ่านรูปสินค้าไม่ได้', 'ระบบไม่สามารถแปลงรูปสินค้าเป็นไฟล์สำหรับส่งให้ AI ได้ กรุณาอัปโหลดรูปใหม่หรือใช้รูปที่มีขนาดเล็กลง');
      setGeneratedImages([]);
      setThaiAdsSession(createThaiAdsSession());
      if (activeGenerationRef.current === generationController) activeGenerationRef.current = null;
      setIsGenerating(false);
      setStep(2);
      return;
    }

    if (generationController.signal.aborted) return;
    const productData = buildCurrentProductData(validImages);

    addNotification('info', 'เริ่มระบบสร้างภาพ AI', `กำลังติดต่อโมเดล ${selectedImageModel} เพื่อสร้างภาพตามหมวดหมู่...`);

    let successCount = 0;
    for (const cat of categoriesToGenerate) {
      if (generationController.signal.aborted) break;
      setGeneratedImages(prev => prev.map(p => p.category === cat && !p.variantLabel ? { ...p, status: 'generating' } : p));
      try {
        const customPromptForTutorial = cat === ImageCategory.TUTORIAL
          ? JSON.stringify(tutorialStepPrompts)
          : undefined;
        // คำนวณ styleIndex สำหรับหมวดที่รองรับการเลือกสไตล์
        let styleIdx: number | undefined;
        if (cat === ImageCategory.INFOGRAPHIC) {
          const val = selectedInfographicStyle[cat] || '0';
          styleIdx = parseInt(val) || undefined;
        } else if (cat === ImageCategory.SIZE_CHART) {
          const val = selectedSizeChartStyle[cat] || '0';
          styleIdx = parseInt(val) || undefined;
        } else if (cat === ImageCategory.TUTORIAL) {
          const val = selectedTutorialStyle[cat] || '0';
          styleIdx = parseInt(val) || undefined;
        }
        const styleForCard = cardVisualStyles[cat] || (cat === ImageCategory.COVER ? selectedCoverStyle || selectedStyle : selectedStyle);
        const result = await generateProductImage(cat, productData, styleForCard, customPromptForTutorial, selectedImageModel, imageAspectRatios[cat] || selectedAspectRatio, styleIdx, generationController.signal);
        setGeneratedImages(prev => prev.map(p => p.category === cat && !p.variantLabel ? { ...p, url: result.imageUrl, status: 'completed', thaiTexts: result.thaiTexts, promptUsed: result.promptUsed, modelUsed: result.modelUsed, visualStyle: styleForCard } : p));
        successCount++;
      } catch (err) {
        if (generationController.signal.aborted) break;
        setGeneratedImages(prev => prev.map(p => p.category === cat && !p.variantLabel ? { ...p, status: 'error', error: err instanceof Error ? err.message : 'Unknown error' } : p));
        const errMsg = err instanceof Error ? err.message : '';
        const isQuota = errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('QUOTA') || errMsg.includes('RESOURCE_EXHAUSTED');
        const userMsg = isQuota
          ? `🚨 โควต้า API Key หมด! กรุณาสร้าง Key ใหม่ที่ https://aistudio.google.com/apikey หรือรอ 1 นาที`
          : errMsg || `เกิดข้อผิดพลาดในการสร้างภาพหมวดหมู่: ${IMAGE_CATEGORIES_METADATA[cat]?.title || cat}`;
        addNotification('error', 'สร้างภาพล้มเหลว', userMsg);
      }
    }

    if (generationController.signal.aborted) {
      return;
    }

    if (user && successCount > 0) {
      deductCredit(successCount);
      addNotification('success', 'สร้างภาพเสร็จสิ้น', user.unlimitedCredits ? `บัญชีทดลอง Unlimited สร้างสำเร็จ ${successCount} ภาพ โดยไม่ถูกหักเครดิต` : `ระบบหัก ${successCount} เครดิตสำหรับการสร้างภาพสำเร็จ ${successCount} ภาพ`);
    } else if (successCount > 0) {
      addNotification('success', 'สร้างภาพเสร็จสิ้น', `สร้างภาพเสร็จเรียบร้อยทั้งหมด ${successCount} ภาพ`);
    }
    if (activeGenerationRef.current === generationController) activeGenerationRef.current = null;
    setIsGenerating(false);
  };

  // ฟังก์ชัน Regenerate สำหรับภาพเดี่ยว
  const regenerateImage = async (category: ImageCategory, customPrompt?: string, styleOverride?: string, styleIndex?: number) => {
    const generationController = new AbortController();
    activeGenerationRef.current = generationController;
    setIsGenerating(true);
    // อัปเดตจำนวนครั้งที่พยายามสร้างใหม่
    setRegenerationAttempts(prev => ({
      ...prev,
      [category]: (prev[category] || 0) + 1
    }));

    // อัปเดตสถานะเป็นกำลังสร้างใหม่ (หรือสร้างภาพครั้งแรกสำหรับ Slot ว่าง)
    setGeneratedImages(prev => {
      const exists = prev.some(img => img.category === category && !img.variantLabel);
      if (exists) {
        return prev.map(img =>
          img.category === category && !img.variantLabel ? {
            ...img,
            status: 'generating',
            error: undefined
          } : img
        );
      } else {
        // กรณีคลิกจาก Slot ว่าง ให้เพิ่ม State ใหม่เข้าไป
        return [...prev, {
          id: Math.random().toString(36).substr(2, 9),
          category: category,
          url: '',
          prompt: '',
          status: 'generating'
        }];
      }
    });

    try {
      // แปลงรูปภาพที่เกี่ยวข้องให้เป็น Base64 เพื่อใช้กับ Gemini
      const imagesToProcess = [...localImages, ...scrapedImages];
      const processedImages = await Promise.all(
        imagesToProcess.map(url => imageUrlToBase64(url))
      );
      const validImages = processedImages.filter(img => img !== "");

      const productData = buildCurrentProductData(validImages);

      // สร้างภาพใหม่เฉพาะหมวดที่เลือก โดยใช้จำนวนครั้งที่พยายามสร้างใหม่เพื่อปรับ prompt
      const attemptCount = regenerationAttempts[category] || 1;
      const styleToUse = styleOverride || cardVisualStyles[category] || (category === ImageCategory.COVER ? selectedCoverStyle || selectedStyle : selectedStyle);
      const ratio = imageAspectRatios[category] || selectedAspectRatio;
      const coverVariationIndex = category === ImageCategory.COVER && styleToUse.startsWith('brand-ambassador')
        ? attemptCount
        : styleIndex;
      const result = await generateProductImage(category, productData, styleToUse, customPrompt, selectedImageModel, ratio, coverVariationIndex, generationController.signal);

      // อัปเดตเฉพาะภาพที่เลือก
      setGeneratedImages(prev => prev.map(img =>
        img.category === category && !img.variantLabel ? {
          ...img,
          url: result.imageUrl,
          status: 'completed',
          thaiTexts: result.thaiTexts,
          promptUsed: result.promptUsed,
          modelUsed: result.modelUsed,
          visualStyle: styleToUse,
        } : img
      ));
    } catch (err) {
      if (generationController.signal.aborted) return;
      // ถ้ามีข้อผิดพลาด ให้ตั้งสถานะเป็น error และบันทึกข้อความแสดงข้อผิดพลาด
      const errorMessage = err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการสร้างภาพ";

      setGeneratedImages(prev => prev.map(img =>
        img.category === category && !img.variantLabel ? {
          ...img,
          status: 'error',
          error: errorMessage
        } : img
      ));
    } finally {
      if (activeGenerationRef.current === generationController) activeGenerationRef.current = null;
      setIsGenerating(false);
    }
  };

  const generateSelectedVariantImages = async () => {
    const targets = variantGroups.flatMap(group => group.options
      .filter(option => selectedVariantOptionIds.includes(option.id))
      .map(option => ({ group, option, label: `${group.name}: ${option.label}${option.price?.display ? ` · ${option.price.display}` : ''}` })));
    if (!targets.length) {
      addNotification('warning', 'ยังไม่ได้เลือกตัวเลือกสินค้า', 'เลือกสี ขนาด หรือรุ่นอย่างน้อย 1 รายการก่อนสร้างภาพแยกตัวเลือก');
      return;
    }
    const sourceImages = [...localImages, ...scrapedImages];
    const converted = await Promise.all(sourceImages.slice(0, 3).map(imageUrlToBase64));
    const images = converted.filter(Boolean);
    if (!images.length) {
      addNotification('error', 'อ่านรูปสินค้าไม่ได้', 'ต้องมีรูปสินค้าอ้างอิงก่อนสร้างภาพแยกตัวเลือก');
      return;
    }

    const generationController = new AbortController();
    activeGenerationRef.current = generationController;
    setIsGenerating(true);
    setStep(3);
    for (const target of targets) {
      if (generationController.signal.aborted) break;
      const id = `variant-${target.option.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setGeneratedImages(previous => [...previous, { id, category: ImageCategory.COVER, url: '', prompt: '', status: 'generating', variantLabel: target.label, visualStyle: cardVisualStyles.COVER || selectedStyle }]);
      try {
        const result = await generateProductImage(
          ImageCategory.COVER,
          buildCurrentProductData(images, target.label),
          cardVisualStyles.COVER || selectedStyle,
          `Create a dedicated, exact-variant product cover for "${target.label}". Clearly distinguish only this confirmed purchasable option from other variants. Leave a clean editable Thai overlay zone for the exact variant name${usePriceInGeneration ? ' and confirmed price' : ''}.`,
          selectedImageModel,
          selectedAspectRatio,
          undefined,
          generationController.signal,
        );
        setGeneratedImages(previous => previous.map(image => image.id === id ? { ...image, url: result.imageUrl, status: 'completed', thaiTexts: [`${target.label}`, ...result.thaiTexts], promptUsed: result.promptUsed, modelUsed: result.modelUsed } : image));
      } catch (error) {
        if (generationController.signal.aborted) break;
        setGeneratedImages(previous => previous.map(image => image.id === id ? { ...image, status: 'error', error: error instanceof Error ? error.message : 'สร้างภาพตัวเลือกไม่สำเร็จ' } : image));
      }
    }
    if (activeGenerationRef.current === generationController) activeGenerationRef.current = null;
    setIsGenerating(false);
  };

  // ลบอักขระที่ทำให้เกิด subfolder ใน ZIP หรือ OS
  const sanitizeFileName = (name: string) =>
    name.replace(/[\/\\:*?"<>|]/g, '_').replace(/_+/g, '_').trim();

  const downloadSingleImage = (url: string, categoryName: string) => {
    // ใช้ชื่อหมวดหมู่ภาษาไทยจาก metadata สำหรับชื่อไฟล์
    const categoryMeta = IMAGE_CATEGORIES_METADATA[categoryName as ImageCategory];
    const thaiTitle = categoryMeta?.title || categoryName;
    const order = categoryMeta?.order || 0;
    const link = document.createElement('a');
    link.href = url;
    link.download = sanitizeFileName(`${order}__${thaiTitle}${productName || 'product'}`) + '.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAll = async () => {
    setIsZipping(true);
    const zip = new JSZip();

    // สร้างเนื้อหาไฟล์ข้อมูลอ้างอิงข้อความภาษาไทย
    let thaiTextContent = `═══════════════════════════════════════════════════════\n`;
    thaiTextContent += `  ข้อมูลอ้างอิงข้อความภาษาไทย (Thai Text Reference)\n`;
    thaiTextContent += `  สำหรับแก้ไขข้อความที่เพี้ยนในภาพ AI ด้วย Photoshop\n`;
    thaiTextContent += `═══════════════════════════════════════════════════════\n\n`;
    // ลบ markdown formatting จากรายละเอียดเพื่อให้อ่านง่ายใน text file
    const cleanDesc = (productDesc || 'ไม่ระบุ')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/#+\s/g, '')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join(' | ');
    const shortDesc = cleanDesc.length > 200 ? cleanDesc.substring(0, 200) + '...' : cleanDesc;

    // หาชื่อแพลตฟอร์มที่เลือกจาก STYLES array
    const selectedStyleInfo = STYLES.find(st => st.id === selectedStyle);
    const platformName = selectedStyleInfo?.name || selectedStyle;

    thaiTextContent += `📦 ชื่อสินค้า: ${productName || 'ไม่ระบุ'}\n`;
    thaiTextContent += `🎨 แพลตฟอร์ม/สไตล์: ${platformName}\n`;
    thaiTextContent += `📝 รายละเอียด (ย่อ): ${shortDesc}\n\n`;
    thaiTextContent += `───────────────────────────────────────────────────────\n`;
    thaiTextContent += `  ข้อความที่ควรปรากฏในแต่ละภาพ\n`;
    thaiTextContent += `───────────────────────────────────────────────────────\n\n`;

    // Add completed images to zip
    for (const img of generatedImages) {
      if (img.status === 'completed' && img.url) {
        // ใช้ชื่อหมวดหมู่ภาษาไทยจาก metadata สำหรับชื่อไฟล์
        const categoryMeta = IMAGE_CATEGORIES_METADATA[img.category];
        const thaiTitle = categoryMeta?.title || img.category;
        const order = categoryMeta?.order || 0;

        // Remove data:image/png;base64, prefix
        const base64Data = img.url.replace(/^data:image\/\w+;base64,/, "");
        const fileName = sanitizeFileName(`${order}__${thaiTitle}${productName || 'product'}`) + '.png';
        zip.file(fileName, base64Data, { base64: true });

        // เพิ่มข้อมูลข้อความภาษาไทยของแต่ละภาพ
        thaiTextContent += `🖼️ [${thaiTitle}] — ไฟล์: ${fileName}\n`;
        if (img.thaiTexts && img.thaiTexts.length > 0) {
          img.thaiTexts.forEach(text => {
            thaiTextContent += `   • ${text}\n`;
          });
        } else {
          thaiTextContent += `   • ชื่อสินค้า: ${productName || 'ไม่ระบุ'}\n`;
        }
        thaiTextContent += `\n`;
      }
    }

    thaiTextContent += `───────────────────────────────────────────────────────\n`;
    thaiTextContent += `💡 วิธีใช้: เปิดไฟล์นี้ + เปิดภาพใน Photoshop\n`;
    thaiTextContent += `   Copy ข้อความจากไฟล์นี้ไปวางแทนที่ข้อความที่เพี้ยนในภาพ\n`;
    thaiTextContent += `═══════════════════════════════════════════════════════\n`;

    // เพิ่มไฟล์ข้อมูลอ้างอิงข้อความภาษาไทยลงใน ZIP
    zip.file('_ข้อความภาษาไทย.txt', thaiTextContent);

    // Generate zip
    try {
      const content = await zip.generateAsync({ type: "blob" });
      const url = window.URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `PicSeller-${productName || 'images'}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Zip error:", err);
      alert("เกิดข้อผิดพลาดในการสร้างไฟล์ ZIP");
    } finally {
      setIsZipping(false);
    }
  };

  // ฟังก์ชันบันทึกไฟล์ลงโฟลเดอร์โดยตรง (ไม่ต้องแตก ZIP)
  const handleDownloadToFolder = async () => {
    // ตรวจว่า browser รองรับ File System Access API
    if (!('showDirectoryPicker' in window)) {
      alert('เบราว์เซอร์ไม่รองรับฟีเจอร์นี้ กรุณาใช้ Chrome หรือ Edge');
      return;
    }

    try {
      // เปิดหน้าต่างเลือกโฟลเดอร์
      const dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      setIsSavingToFolder(true);

      // สร้างเนื้อหาไฟล์ข้อมูลอ้างอิงข้อความภาษาไทย
      const selectedStyleInfo = STYLES.find(st => st.id === selectedStyle);
      const platformName = selectedStyleInfo?.name || selectedStyle;
      const cleanDesc = (productDesc || 'ไม่ระบุ')
        .replace(/\*\*/g, '').replace(/\*/g, '').replace(/#+\s/g, '')
        .split('\n').map(l => l.trim()).filter(l => l.length > 0).join(' | ');
      const shortDesc = cleanDesc.length > 200 ? cleanDesc.substring(0, 200) + '...' : cleanDesc;

      let thaiTextContent = `═══════════════════════════════════════════════════════\n`;
      thaiTextContent += `  ข้อมูลอ้างอิงข้อความภาษาไทย (Thai Text Reference)\n`;
      thaiTextContent += `  สำหรับแก้ไขข้อความที่เพี้ยนในภาพ AI ด้วย Photoshop\n`;
      thaiTextContent += `═══════════════════════════════════════════════════════\n\n`;
      thaiTextContent += `📦 ชื่อสินค้า: ${productName || 'ไม่ระบุ'}\n`;
      thaiTextContent += `🎨 แพลตฟอร์ม/สไตล์: ${platformName}\n`;
      thaiTextContent += `📝 รายละเอียด (ย่อ): ${shortDesc}\n\n`;
      thaiTextContent += `───────────────────────────────────────────────────────\n`;
      thaiTextContent += `  ข้อความที่ควรปรากฏในแต่ละภาพ\n`;
      thaiTextContent += `───────────────────────────────────────────────────────\n\n`;

      // บันทึกแต่ละภาพลงโฟลเดอร์
      for (const img of generatedImages) {
        if (img.status === 'completed' && img.url) {
          const categoryMeta = IMAGE_CATEGORIES_METADATA[img.category];
          const thaiTitle = categoryMeta?.title || img.category;
          const order = categoryMeta?.order || 0;
          const fileName = sanitizeFileName(`${order}__${thaiTitle}${productName || 'product'}`) + '.png';

          // แปลง base64 เป็น blob แล้วเขียนไฟล์
          const base64Data = img.url.replace(/^data:image\/\w+;base64,/, '');
          const binaryStr = atob(base64Data);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

          const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(bytes);
          await writable.close();

          // เพิ่มข้อมูล text reference
          thaiTextContent += `🖼️ [${thaiTitle}] — ไฟล์: ${fileName}\n`;
          if (img.thaiTexts && img.thaiTexts.length > 0) {
            img.thaiTexts.forEach(text => { thaiTextContent += `   • ${text}\n`; });
          } else {
            thaiTextContent += `   • ชื่อสินค้า: ${productName || 'ไม่ระบุ'}\n`;
          }
          thaiTextContent += `\n`;
        }
      }

      thaiTextContent += `───────────────────────────────────────────────────────\n`;
      thaiTextContent += `💡 วิธีใช้: เปิดไฟล์นี้ + เปิดภาพใน Photoshop\n`;
      thaiTextContent += `   Copy ข้อความจากไฟล์นี้ไปวางแทนที่ข้อความที่เพี้ยนในภาพ\n`;
      thaiTextContent += `═══════════════════════════════════════════════════════\n`;

      // บันทึกไฟล์ text reference ลงโฟลเดอร์
      const txtHandle = await dirHandle.getFileHandle('_ข้อความภาษาไทย.txt', { create: true });
      const txtWritable = await txtHandle.createWritable();
      await txtWritable.write(new TextEncoder().encode(thaiTextContent));
      await txtWritable.close();

      alert(`บันทึกไฟล์ลงโฟลเดอร์เรียบร้อย! \ud83c\udf89 (${generatedImages.filter(i => i.status === 'completed').length} ภาพ + 1 ไฟล์ text)`);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Folder save error:', err);
        alert('เกิดข้อผิดพลาดในการบันทึกไฟล์');
      }
    } finally {
      setIsSavingToFolder(false);
    }
  };

  // ฟังก์ชันสรุปรายละเอียดสินค้า
  const handleSummarize = async () => {
    if (!productDesc && localImages.length === 0 && scrapedImages.length === 0) {
      alert("กรุณากรอกรายละเอียดหรืออัปโหลดรูปภาพก่อนทำการสรุป");
      return;
    }

    setIsSummarizing(true);
    try {
      // รวมรูปภาพทั้งหมดเพื่อส่งไปวิเคราะห์
      const allImages = [...localImages, ...scrapedImages];
      const processedImages = await Promise.all(
        allImages.slice(0, 3).map(url => imageUrlToBase64(url)) // ส่งแค่ 3 รูปแรก
      );
      const validImages = processedImages.filter(img => img && img !== "");

      const summary = await summarizeProductDescription(productDesc, validImages, summaryLength);
      setProductDesc(summary);
    } catch (err) {
      console.error("Summarize error:", err);
      alert("เกิดข้อผิดพลาดในการสรุปสินค้า");
    } finally {
      setIsSummarizing(false);
    }
  };

  const completedCount = generatedImages.filter(i => i.status === 'completed').length;
  const progressPercent = (completedCount / 9) * 100;
  const totalImages = localImages.length + scrapedImages.length;

  const getStrategyLabel = (order: number) => {
    if (order === 1) return { text: 'Hook', color: 'bg-red-500', icon: <Target className="w-3 h-3" /> };
    if (order >= 2 && order <= 3) return { text: 'Logic', color: 'bg-blue-500', icon: <Zap className="w-3 h-3" /> };
    if (order >= 4 && order <= 6) return { text: 'Emotion', color: 'bg-pink-500', icon: <Sparkles className="w-3 h-3" /> };
    return { text: 'Trust', color: 'bg-green-500', icon: <CheckCircle2 className="w-3 h-3" /> };
  };

  // ฟังก์ชันจัดการการแก้ไข prompt
  const startEditingPrompt = (category: string) => {
    setEditingPrompt(prev => ({ ...prev, [category]: true }));
  };

  const cancelEditingPrompt = (category: string) => {
    setEditingPrompt(prev => ({ ...prev, [category]: false }));
  };

  const saveEditedPrompt = (category: ImageCategory) => {
    const customPrompt = promptInputs[category];
    setEditingPrompt(prev => ({ ...prev, [category]: false }));
    regenerateImage(category, customPrompt);
  };

  const handlePromptInputChange = (category: string, value: string) => {
    setPromptInputs(prev => ({ ...prev, [category]: value }));
  };

  // ฟังก์ชันสำหรับเลือก/ยกเลิกเลือกหมวดหมู่
  const toggleCategory = (category: ImageCategory) => {
    setSelectedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  // ฟังก์ชันสำหรับเลือกทั้งหมด/ยกเลิกทั้งหมด
  const toggleSelectAll = () => {
    const allCategories = Object.keys(IMAGE_CATEGORIES_METADATA) as ImageCategory[];
    if (selectedCategories.size === allCategories.length) {
      setSelectedCategories(new Set());
    } else {
      setSelectedCategories(new Set(allCategories));
    }
  };

  // เพิ่ม state สำหรับแสดงรายละเอียดสไตล์
  const [showStyleDetails, setShowStyleDetails] = useState<string | null>(null);

  // เพิ่ม state สำหรับภาพหลัก
  const [mainImageIndex, setMainImageIndex] = useState<number | null>(null);

  // ฟังก์ชัน Remove Background โดยใช้ remove.bg API
  const removeBackground = async (imageSrc: string, index: number, isScraped: boolean) => {
    try {
      const apiKey = removeBgKey.trim();
      if (!apiKey) {
        throw new Error("กรุณาใส่ Remove.bg API Key ในหน้าตั้งค่าก่อนใช้งาน");
      }

      // แปลง data URL เป็น Blob
      const response = await fetch(imageSrc);
      const blob = await response.blob();

      // สร้าง FormData สำหรับส่งภาพไปยัง remove.bg API
      const formData = new FormData();
      formData.append('image_file', blob, 'image.png');

      // เรียกใช้ remove.bg API
      const apiResponse = await fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey
        },
        body: formData
      });

      if (!apiResponse.ok) {
        throw new Error(`Remove.bg API error: ${apiResponse.status}`);
      }

      // แปลงผลลัพธ์เป็น blob แล้วอ่านเป็น base64
      const resultBlob = await apiResponse.blob();
      // Use FileReader to convert Blob to Base64 safely
      const reader = new FileReader();
      const resultUrl = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(resultBlob);
      });

      // อัปเดตรายการภาพตามแหล่งที่มา
      if (isScraped) {
        const updatedScrapedImages = [...scrapedImages];
        updatedScrapedImages[index] = resultUrl;
        setScrapedImages(updatedScrapedImages);
      } else {
        const updatedLocalImages = [...localImages];
        updatedLocalImages[index] = resultUrl;
        setLocalImages(updatedLocalImages);
      }

      return resultUrl;
    } catch (error) {
      console.error("Error removing background:", error);
      alert("ไม่สามารถลบพื้นหลังได้: " + (error instanceof Error ? error.message : "Unknown error"));
      return null;
    }
  };

  // Extract inner removeBg logic into a pure function for Modal to use without state bindings
  const callRemoveBgApi = async (dataUrl: string): Promise<string | null> => {
    try {
      const apiKey = removeBgKey.trim();
      if (!apiKey) {
        throw new Error("กรุณาใส่ Remove.bg API Key ในหน้าตั้งค่าก่อนใช้งาน");
      }

      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const formData = new FormData();
      formData.append('image_file', blob, 'image.png');
      const apiResponse = await fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey
        },
        body: formData
      });
      if (!apiResponse.ok) throw new Error(`Remove.bg API error: ${apiResponse.status}`);
      const resultBlob = await apiResponse.blob();
      const reader = new FileReader();
      return await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(resultBlob);
      });
    } catch (err) {
      console.error(err);
      return null;
    }
  };

  const handleSaveEditedImage = (editedBase64: string) => {
    if (!editingImageParams) return;
    const { isScraped, index } = editingImageParams;
    
    if (isScraped) {
      setScrapedImages(prev => {
        const updated = [...prev];
        updated[index] = editedBase64;
        return updated;
      });
    } else {
      setLocalImages(prev => {
        const updated = [...prev];
        updated[index] = editedBase64;
        return updated;
      });
    }
  };

  // ฟังก์ชันกู้คืนภาพต้นฉบับ
  const restoreBackground = (index: number, isScraped: boolean) => {
    if (isScraped) {
      if (originalScrapedImages[index]) {
        setScrapedImages(prev => {
          const updated = [...prev];
          updated[index] = originalScrapedImages[index];
          return updated;
        });
      }
    } else {
      if (originalLocalImages[index]) {
        setLocalImages(prev => {
          const updated = [...prev];
          updated[index] = originalLocalImages[index];
          return updated;
        });
      }
    }
  };



  const selectedStyleName = STYLES.find(s => s.id === selectedStyle)?.name || 'Available Style';
  const pricingCheckoutModal = showPricingCheckout ? (
    <PricingCheckoutModal
      initialPlanId={pendingPlanId}
      onClose={() => { setShowPricingCheckout(false); setPendingPlanId(undefined); }}
      onPaymentConfirmed={async () => {
        await refreshBilling();
        addNotification('success', 'ชำระเงินสำเร็จ', 'ระบบอัปเดตเครดิตและสิทธิ์แพ็กเกจของคุณแล้ว');
      }}
    />
  ) : null;

  // ==========================================
  // LOGIN SCREEN — Show when user is not authenticated
  // ==========================================
  if (!user) {
    return (
      <>
        {publicScreen === 'landing' ? (
          <MarketingSite onOpenAuth={(planId) => { setPendingPlanId(planId); setPublicScreen('login'); }} />
        ) : (
          <div className="relative">
            <button
              onClick={() => setPublicScreen('landing')}
              className="absolute left-4 top-4 z-20 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-xs font-black text-slate-600 shadow-sm backdrop-blur hover:bg-white dark:border-white/10 dark:bg-slate-900/90 dark:text-slate-200"
            >
              ← กลับหน้าราคา
            </button>
            <LoginPage
              onLogin={login}
              onRegister={register}
              onGoogleLogin={() => loginWithSocial('google')}
              isLoading={authLoading}
            />
          </div>
        )}
        <NotificationSystem notifications={notifications} onRemove={removeNotification} />
      </>
    );
  }

  if (showPublicLanding) {
    return (
      <>
        <MarketingSite
          onOpenAuth={() => setShowPublicLanding(false)}
          onGoToStudio={() => setShowPublicLanding(false)}
          onSelectPlan={(planId) => {
            setPendingPlanId(planId);
            setShowPublicLanding(false);
            setShowPricingCheckout(true);
          }}
        />
        {pricingCheckoutModal}
        <NotificationSystem notifications={notifications} onRemove={removeNotification} />
      </>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col relative z-0 ${theme === 'dark' ? 'bg-gray-900/90 text-white' : 'bg-[#F8FAFC]/90 text-slate-900'}`}>
      <KineticBackground />
      <header className={`${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'} sticky top-0 z-50 px-6 py-4 flex items-center justify-between shadow-sm`}>
        <div className="flex items-center gap-2">
          <div className={`${theme === 'dark' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-orange-500 hover:bg-orange-600'} p-2 rounded-xl cursor-pointer transition-all shadow-orange-100 shadow-lg`} onClick={() => setShowPublicLanding(true)}>
            <Sparkles className="text-white w-6 h-6" />
          </div>
          <div className="cursor-pointer group" onClick={() => setShowPublicLanding(true)}>
            <div className="flex items-center gap-2">
              <h1 className="font-black text-xl tracking-tight group-hover:text-orange-500 transition-colors uppercase">PICSELLER</h1>
              <span className="rounded-full border border-slate-400/30 px-1.5 py-0.5 text-[9px] font-black tracking-wide text-slate-400" title={`Build ${APP_BUILD}`}>
                v{APP_RELEASE} · {APP_BUILD}
              </span>
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${theme === 'dark' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'} tracking-wider`} title="Last updated: 2026-03-11 — Security Hardening">
                PLUS
              </span>
            </div>
            <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-slate-400'} text-[10px] font-bold uppercase tracking-[0.2em]`}>Visual Commerce Suite</p>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-1 bg-slate-100 p-1.5 rounded-2xl dark:bg-gray-700">
          <button
            onClick={() => setShowPublicLanding(true)}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${theme === 'dark' ? 'text-gray-300 hover:bg-gray-600 hover:text-orange-400' : 'text-slate-500 hover:bg-white hover:text-orange-600'}`}
          >
            <Sparkles className="w-4 h-4" /> หน้าแรก
          </button>
          {[1, 2, 3].map((s) => (
            <button
              key={s}
              onClick={() => { setStudioMode(false); setStep(s); }}
              className={`px-5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${step === s ? (theme === 'dark' ? 'bg-gray-600 text-orange-400' : 'bg-white text-orange-600') : (theme === 'dark' ? 'text-gray-300 hover:text-gray-100' : 'text-slate-400 hover:text-slate-600')}`}
            >
              <span className={`w-5 h-5 flex items-center justify-center rounded-lg text-[10px] ${step === s ? (theme === 'dark' ? 'bg-orange-500 text-white' : 'bg-orange-500 text-white') : (theme === 'dark' ? 'bg-gray-600 text-gray-300' : 'bg-slate-200 text-slate-500')}`}>{s}</span>
              {s === 1 ? 'ANALYZE' : s === 2 ? 'CONFIGURE' : 'RESULTS'}
            </button>
          ))}
          <button
            onClick={() => setStudioMode(true)}
            className={`px-5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${studioMode ? (theme === 'dark' ? 'bg-gray-600 text-orange-400' : 'bg-white text-orange-600') : (theme === 'dark' ? 'text-gray-300 hover:text-gray-100' : 'text-slate-400 hover:text-slate-600')}`}
          >
            <Sparkles className="w-4 h-4" /> THAI ADS
          </button>
        </nav>

        {/* ส่วน User Profile + Theme Toggle + Logout */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setShowProfileDropdown(false); setShowPricingCheckout(true); }}
            className={`hidden lg:flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition-colors ${theme === 'dark' ? 'bg-orange-500/15 text-orange-300 hover:bg-orange-500/25' : 'bg-orange-50 text-orange-600 hover:bg-orange-100'}`}
          >
            <Zap className="w-4 h-4" />
            แพ็กเกจ / เครดิต
          </button>
          <button
            onClick={() => setStudioMode(true)}
            className={`md:hidden p-2 rounded-xl transition-colors ${studioMode ? 'bg-orange-500 text-white' : (theme === 'dark' ? 'bg-gray-700 text-orange-400' : 'bg-orange-50 text-orange-600')}`}
            aria-label="เปิด Shopee Thai Ads Generator"
          >
            <Sparkles className="w-5 h-5" />
          </button>
          {/* ปุ่มสลับธีม */}
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-xl ${theme === 'dark' ? 'bg-gray-700 text-yellow-300 hover:bg-gray-600' : 'bg-slate-100 text-gray-700 hover:bg-slate-200'} transition-colors`}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {/* ปุ่มล้างข้อมูลเซสชัน */}
          <button
            onClick={handleClearDB}
            className={`p-2 rounded-xl ${theme === 'dark' ? 'bg-gray-700 text-red-400 hover:bg-gray-600' : 'bg-slate-100 text-red-500 hover:bg-slate-200'} transition-colors flex items-center gap-2`}
            aria-label="ล้างข้อมูลเซสชัน"
          >
            <Trash2 className="w-5 h-5" />
            <span className="hidden sm:inline text-xs font-black">ล้างข้อมูล</span>
          </button>

          {/* User Avatar + Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowProfileDropdown(!showProfileDropdown)}
              className={`flex items-center gap-3 p-2 pr-4 rounded-2xl transition-all ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-slate-100 hover:bg-slate-200'} ${showProfileDropdown ? (theme === 'dark' ? 'bg-gray-600' : 'bg-slate-200') : ''}`}
            >
              <div className="w-9 h-9 rounded-xl overflow-hidden bg-orange-500 flex items-center justify-center text-white font-black text-sm shadow-lg shadow-orange-500/20">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  user.name.charAt(0).toUpperCase()
                )}
              </div>
              <div className="hidden md:block text-left">
                <p className={`text-xs font-black leading-tight ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>{user.name}</p>
                <p className={`text-[9px] font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-slate-400'}`}>
                  {user.unlimitedCredits ? 'Trial Unlimited' : user.tier === 'free' ? 'Free' : user.tier === 'starter' ? 'Starter' : user.tier === 'pro' ? 'Pro' : 'Enterprise'} • {user.unlimitedCredits ? 'Unlimited credits' : `${user.credits} credits`}
                </p>
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform ${showProfileDropdown ? 'rotate-180' : ''} ${theme === 'dark' ? 'text-gray-400' : 'text-slate-400'}`} />
            </button>

            {/* Dropdown Menu */}
            {showProfileDropdown && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowProfileDropdown(false)}
                />
                {/* Menu */}
                <div className={`absolute right-0 top-full mt-2 w-64 z-50 rounded-2xl shadow-2xl border overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-100'}`}>
                  {/* User Info Header */}
                  <div className={`px-5 py-4 border-b ${theme === 'dark' ? 'border-gray-700' : 'border-slate-100'}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-orange-500 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-orange-500/20">
                        {user.avatar ? (
                          <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                        ) : (
                          user.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-black truncate ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{user.name}</p>
                        <p className={`text-xs font-bold truncate ${theme === 'dark' ? 'text-gray-400' : 'text-slate-400'}`}>{user.email}</p>
                      </div>
                    </div>
                    <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-xl ${theme === 'dark' ? 'bg-gray-700' : 'bg-slate-50'}`}>
                      <Zap className="w-4 h-4 text-orange-500" />
                      <span className={`text-xs font-black ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>{user.unlimitedCredits ? 'Unlimited credits' : `${user.credits} credits`}</span>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ml-auto ${theme === 'dark' ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-50 text-orange-600'}`}>
                        {user.unlimitedCredits ? 'TRIAL' : user.tier.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* Menu Items */}
                  <div className="py-2">
                    <button
                      onClick={() => { setShowProfileDropdown(false); }}
                      className={`w-full flex items-center gap-3 px-5 py-3 text-sm font-bold transition-colors ${theme === 'dark' ? 'text-gray-300 hover:bg-gray-700 hover:text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                    >
                      <User className="w-4 h-4" />
                      โปรไฟล์ของฉัน
                    </button>
                    <button
                      onClick={() => { setShowProfileDropdown(false); setShowSettings(true); }}
                      className={`w-full flex items-center gap-3 px-5 py-3 text-sm font-bold transition-colors ${theme === 'dark' ? 'text-gray-300 hover:bg-gray-700 hover:text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                    >
                      <Settings className="w-4 h-4" />
                      ตั้งค่า
                    </button>
                  </div>

                  {/* Logout Button */}
                  <div className={`px-3 pb-3`}>
                    <button
                      onClick={() => { setShowProfileDropdown(false); logout(); }}
                      className={`w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-black transition-all ${
                        theme === 'dark'
                          ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                          : 'bg-red-50 text-red-500 hover:bg-red-100 border border-red-100'
                      }`}
                    >
                      <LogOut className="w-4 h-4" />
                      ออกจากระบบ
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className={`flex-1 w-full px-6 py-10 ${theme === 'dark' ? 'bg-[#0b1523]' : 'bg-[#f8fafc]'}`}>
        {studioMode ? <ShopeeAdsStudio dark={theme === 'dark'} imageModel={selectedImageModel} session={thaiAdsSession} setSession={setThaiAdsSession} /> : <>
        {step === 1 && (
          <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-8 lg:grid-cols-[1.1fr_0.9fr] animate-in fade-in slide-in-from-bottom-3 duration-300">
            {/* Left Section: Product Form */}
            <section className="space-y-6">
              {/* Title Header */}
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800/80">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-orange-500 animate-pulse" />
                    <h2 className={`text-2xl font-black tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>เพิ่มข้อมูลสินค้า</h2>
                    <span className="rounded-full bg-orange-500/10 border border-orange-500/20 px-2.5 py-0.5 text-[10px] font-black uppercase text-orange-500">Step 1</span>
                  </div>
                  <p className={`mt-1 text-xs font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>เพิ่มรายละเอียดสินค้าและอัปโหลดรูปภาพ เพื่อเริ่มการปรับแต่งด้วย AI</p>
                </div>
                <button onClick={sendToThaiAds} disabled={!localImages.length && !scrapedImages.length} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white text-xs font-bold px-4 py-2.5 transition-all shadow-md shadow-orange-500/20 disabled:opacity-40 active:scale-95">
                  <Sparkles className="h-3.5 w-3.5" /> ส่งไป Thai Ads
                </button>
              </div>

              {/* Shopee URL Input */}
              <div className="space-y-2">
                <label className={`flex items-center justify-between text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                  <span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5 text-orange-500" /> Shopee Product Link</span>
                  <span className="text-[11px] font-normal text-slate-400">วาง URL สแครปข้อมูลอัตโนมัติ</span>
                </label>
                <div className={`relative flex items-center rounded-2xl border p-1.5 transition-all shadow-sm ${theme === 'dark' ? 'border-slate-800 bg-slate-900/60 focus-within:border-orange-500/80 focus-within:ring-4 focus-within:ring-orange-500/10' : 'border-slate-200 bg-white focus-within:border-orange-400 focus-within:ring-4 focus-within:ring-orange-400/10'}`}>
                  <input
                    type="text"
                    placeholder="https://shopee.co.th/product/..."
                    className={`w-full bg-transparent px-3 text-xs font-bold outline-none ${theme === 'dark' ? 'text-white placeholder:text-slate-500' : 'text-slate-800 placeholder:text-slate-400'}`}
                    value={productUrl}
                    onChange={(e) => setProductUrl(e.target.value)}
                  />
                  <button
                    onClick={handlePreviewScrape}
                    disabled={isScrapingOnly || !productUrl}
                    className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold shrink-0 transition-all active:scale-95 ${theme === 'dark' ? 'bg-slate-100 text-slate-900 hover:bg-white disabled:bg-slate-800 disabled:text-slate-600' : 'bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400'}`}
                    aria-label="Preview product link"
                  >
                    {isScrapingOnly ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
                    <span>ดึงข้อมูล</span>
                  </button>
                </div>
              </div>

              {/* Product Name Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <label className={theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}>ชื่อสินค้า</label>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${theme === 'dark' ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>{productName.length} / 120</span>
                </div>
                <input
                  type="text"
                  maxLength={120}
                  placeholder="กรอกชื่อสินค้าของคุณ"
                  className={`w-full rounded-2xl border px-4 py-3 text-xs font-bold outline-none transition-all shadow-sm ${theme === 'dark' ? 'border-slate-800 bg-slate-900/60 text-white placeholder:text-slate-500 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10' : 'border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-400/10'}`}
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                />
              </div>

              {/* Price & Variant Control Card */}
              <div className={`rounded-3xl border p-5 shadow-xl backdrop-blur-xl space-y-4 ${theme === 'dark' ? 'border-slate-800 bg-slate-900/50 shadow-black/20' : 'border-slate-200/80 bg-white shadow-slate-200/50'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className={`text-sm font-black flex items-center gap-2 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>⚙️ ราคาและตัวเลือกสินค้า</h3>
                    <p className={`text-[11px] mt-0.5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>เปิด-ปิด ข้อมูลราคาและตัวเลือกที่จะส่งให้ AI วิเคราะห์</p>
                  </div>
                  <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs font-black text-emerald-600 dark:text-emerald-400">{getPriceDisplay() || 'ยังไม่ได้ระบุราคา'}</span>
                </div>

                {/* Sleek Toggles */}
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <label className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-3 transition-all ${usePriceInGeneration ? 'border-orange-500/40 bg-orange-500/5' : theme === 'dark' ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50'}`}>
                    <div>
                      <span className={`block text-xs font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>ราคายืนยันในการสร้างภาพ</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">{usePriceInGeneration ? 'เปิดใช้งานอยู่' : 'ปิดอยู่: AI จะไม่เห็นราคา'}</span>
                    </div>
                    <input type="checkbox" checked={usePriceInGeneration} onChange={e => setUsePriceInGeneration(e.target.checked)} className="h-4 w-4 rounded accent-orange-500 cursor-pointer" aria-label="ใช้ราคายืนยันในการสร้างภาพ" />
                  </label>
                  <label className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-3 transition-all ${useVariantsInGeneration ? 'border-orange-500/40 bg-orange-500/5' : theme === 'dark' ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50'}`}>
                    <div>
                      <span className={`block text-xs font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>รุ่น / ตัวเลือกสินค้า</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">{useVariantsInGeneration ? 'เปิดใช้งานอยู่' : 'ปิดอยู่: AI จะไม่เห็นตัวเลือก'}</span>
                    </div>
                    <input type="checkbox" checked={useVariantsInGeneration} onChange={e => setUseVariantsInGeneration(e.target.checked)} className="h-4 w-4 rounded accent-orange-500 cursor-pointer" aria-label="ใช้รุ่นและตัวเลือกในการสร้างภาพ" />
                  </label>
                </div>

                {/* Price 3-Column Inputs */}
                <div className="grid gap-3 sm:grid-cols-3 pt-1">
                  <label className="space-y-1">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">ราคาแสดง</span>
                    <input value={productPrice.display || ''} onChange={e => setProductPrice(prev => ({ ...prev, currency: 'THB', display: e.target.value }))} placeholder="เช่น ฿199 - ฿299" className={`w-full rounded-xl border px-3 py-2 text-xs font-bold outline-none focus:border-orange-500 ${theme === 'dark' ? 'border-slate-800 bg-slate-950/60 text-white' : 'border-slate-200 bg-slate-50 text-slate-800'}`} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">ราคาต่ำสุด</span>
                    <input type="number" min="0" value={productPrice.min ?? productPrice.current ?? ''} onChange={e => updateProductPrice('min', e.target.value)} placeholder="199" className={`w-full rounded-xl border px-3 py-2 text-xs font-bold outline-none focus:border-orange-500 ${theme === 'dark' ? 'border-slate-800 bg-slate-950/60 text-white' : 'border-slate-200 bg-slate-50 text-slate-800'}`} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">ราคาสูงสุด</span>
                    <input type="number" min="0" value={productPrice.max ?? ''} onChange={e => updateProductPrice('max', e.target.value)} placeholder="299" className={`w-full rounded-xl border px-3 py-2 text-xs font-bold outline-none focus:border-orange-500 ${theme === 'dark' ? 'border-slate-800 bg-slate-950/60 text-white' : 'border-slate-200 bg-slate-50 text-slate-800'}`} />
                  </label>
                </div>

                {/* Variants Groups List */}
                <div className="space-y-3 pt-1">
                  {variantGroups.map(group => (
                    <div key={group.id} className={`rounded-2xl border p-3 space-y-2 ${theme === 'dark' ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <input value={group.name} onChange={e => setVariantGroups(prev => prev.map(item => item.id === group.id ? { ...item, name: e.target.value } : item))} className={`bg-transparent text-xs font-black outline-none ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`} />
                        <button onClick={() => addVariantOption(group.id)} className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:border-orange-500 transition-all">+ เพิ่มตัวเลือก</button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {group.options.map(option => (
                          <label key={option.id} className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs transition-all ${selectedVariantOptionIds.includes(option.id) ? 'border-orange-500/50 bg-orange-500/10' : theme === 'dark' ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}>
                            <input type="checkbox" checked={selectedVariantOptionIds.includes(option.id)} onChange={() => toggleVariantOption(option.id)} className="accent-orange-500" />
                            <input value={option.label} onChange={e => updateVariantOption(group.id, option.id, { label: e.target.value })} className={`min-w-0 flex-1 bg-transparent text-xs font-bold outline-none ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`} />
                            <input type="number" min="0" value={option.price?.current ?? option.price?.min ?? ''} onChange={e => { const amount = e.target.value === '' ? undefined : Number(e.target.value); updateVariantOption(group.id, option.id, { price: amount === undefined || !Number.isFinite(amount) ? undefined : { currency: 'THB', current: amount, min: amount, max: amount, display: `฿${amount.toLocaleString('th-TH')}` } }); }} placeholder="ราคา" className={`w-16 rounded-lg border px-2 py-1 text-right text-[11px] font-bold outline-none ${theme === 'dark' ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50 text-slate-800'}`} />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                  {!variantGroups.length && (
                    <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-3.5 text-center text-xs text-slate-500">
                      <p className="text-[11px]">ยังไม่พบกลุ่มสี ขนาด หรือรุ่น — คุณสามารถเพิ่มกลุ่มตัวเลือกเองได้</p>
                      <button onClick={addVariantGroup} className="mt-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:border-orange-500 transition-all">+ เพิ่มกลุ่มตัวเลือก</button>
                    </div>
                  )}
                </div>
                {variantGroups.length > 0 && (
                  <button onClick={generateSelectedVariantImages} disabled={isGenerating || selectedVariantOptionIds.length === 0} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 shadow-md shadow-emerald-600/20 disabled:opacity-40 transition-all">
                    <Layers className="h-4 w-4" /> สร้างภาพแยก {selectedVariantOptionIds.length || ''} ตัวเลือกที่เลือก
                  </button>
                )}
              </div>

              {/* Description Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <label className={theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}>รายละเอียดสินค้า</label>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${theme === 'dark' ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>{productDesc.length} / 2000</span>
                </div>
                <textarea
                  rows={5}
                  maxLength={2000}
                  placeholder={`เคล็ดลับ: รายละเอียดสินค้าที่ดีจะช่วยให้ AI เข้าใจสินค้าได้ดียิ่งขึ้น\n\n• คุณสมบัติเด่นของสินค้า\n• วัสดุ / ขนาด / สี\n• จุดเด่นที่ทำให้สินค้าของคุณแตกต่าง`}
                  className={`w-full resize-y rounded-2xl border p-4 text-xs font-medium leading-relaxed outline-none transition-all shadow-sm ${theme === 'dark' ? 'border-slate-800 bg-slate-900/60 text-white placeholder:text-slate-500 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10' : 'border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-400/10'}`}
                  value={productDesc}
                  onChange={(e) => setProductDesc(e.target.value)}
                />
              </div>

              {/* Description Length Segmented Buttons */}
              <div className="space-y-2">
                <span className={`text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>ความยาวรายละเอียด</span>
                <div className={`grid grid-cols-3 gap-1.5 rounded-2xl border p-1.5 ${theme === 'dark' ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-slate-100'}`}>
                  {[
                    { value: 'short' as const, label: 'สั้น', desc: 'กระชับ เข้าใจง่าย' },
                    { value: 'medium' as const, label: 'ปานกลาง', desc: 'รายละเอียดครบ' },
                    { value: 'long' as const, label: 'ละเอียด', desc: 'ข้อมูลครบทุกมิติ' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setSummaryLength(opt.value)}
                      className={`rounded-xl py-2 px-3 text-center transition-all ${summaryLength === opt.value
                        ? 'bg-white dark:bg-slate-800 text-orange-600 dark:text-orange-400 shadow-md font-black'
                        : 'text-slate-500 dark:text-slate-400 font-medium hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <span className="block text-xs">{opt.label}</span>
                      <span className="block text-[10px] opacity-75">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3 pt-2">
                <button
                  onClick={handleSummarize}
                  disabled={isSummarizing || (!productDesc && localImages.length === 0 && scrapedImages.length === 0)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 text-xs font-bold py-3 transition-all disabled:opacity-40 active:scale-[0.99]"
                >
                  {isSummarizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  <span>AI ช่วยเขียนรายละเอียดสินค้า</span>
                </button>

                <button
                  onClick={handleScrape}
                  disabled={isAnalyzing}
                  className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-orange-500 via-orange-600 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white text-sm font-black py-4 shadow-xl shadow-orange-500/25 transition-all disabled:opacity-40 active:scale-[0.99]"
                >
                  {isAnalyzing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                  <span>เริ่มวิเคราะห์สินค้าด้วย AI</span>
                </button>
              </div>

              {/* Reference Images List */}
              <div className="space-y-3 pt-2">
                <p className={`text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>รูปภาพสินค้าอ้างอิง (ไม่บังคับ)</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {[...localImages, ...scrapedImages].map((src, i) => {
                    const isLocalImage = i < localImages.length;
                    return (
                      <div key={i} className={`group relative aspect-square overflow-hidden rounded-2xl border ${theme === 'dark' ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-sm'}`}>
                        <img src={src} className="h-full w-full object-cover" />
                        <button
                          onClick={() => {
                            if (i < localImages.length) removeLocalImage(i);
                            else removeScrapedImage(i - localImages.length);
                          }}
                          className="absolute right-1.5 top-1.5 rounded-full bg-slate-900/80 p-1 text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                          aria-label="Remove image"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <div className="absolute bottom-1.5 left-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const index = isLocalImage ? i : i - localImages.length;
                              setEditingImageParams({ isScraped: !isLocalImage, index, url: src });
                            }}
                            className="rounded-full bg-white/90 p-1 text-orange-500 shadow-sm"
                            title="ตกแต่งรูปภาพ"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const index = isLocalImage ? i : i - localImages.length;
                              removeBackground(src, index, !isLocalImage);
                            }}
                            className="rounded-full bg-white/90 p-1 text-blue-500 shadow-sm"
                            title="ลบพื้นหลัง"
                          >
                            <Scissors className="h-3.5 w-3.5" />
                          </button>
                          {((isLocalImage && src !== originalLocalImages[i]) || (!isLocalImage && src !== originalScrapedImages[i - localImages.length])) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const index = isLocalImage ? i : i - localImages.length;
                                restoreBackground(index, !isLocalImage);
                              }}
                              className="rounded-full bg-white/90 p-1 text-green-500 shadow-sm"
                              title="กู้คืนภาพเดิม"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className={`aspect-square flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed p-3 transition-all ${theme === 'dark' ? 'border-slate-800 bg-slate-900/40 text-slate-400 hover:border-orange-500 hover:text-orange-400' : 'border-slate-300 bg-slate-50 text-slate-500 hover:border-orange-400 hover:text-orange-600'}`}
                  >
                    <Plus className="h-5 w-5" />
                    <span className="text-[11px] font-bold">เพิ่มรูปภาพ</span>
                  </button>
                </div>
              </div>
            </section>

            {/* Right Section: Sidebar Uploader & Benefits */}
            <aside className="space-y-6 pt-0">
              {/* Manual Upload Card */}
              <div className={`rounded-3xl border p-6 shadow-xl backdrop-blur-xl ${theme === 'dark' ? 'border-slate-800 bg-slate-900/50 shadow-black/20' : 'border-slate-200/80 bg-white shadow-slate-200/50'}`}>
                <label className={`mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-wider ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                  <Upload className="h-4 w-4 text-orange-500" />
                  Manual Upload
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`grid min-h-[210px] cursor-pointer place-items-center rounded-2xl border border-dashed p-6 text-center transition-all ${theme === 'dark' ? 'border-slate-800 bg-slate-950/40 hover:border-orange-500/80 hover:bg-slate-950/80' : 'border-slate-300 bg-slate-50/80 hover:border-orange-400 hover:bg-orange-50/30'}`}
                >
                  <div>
                    <div className={`mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border transition-all ${theme === 'dark' ? 'border-orange-500/30 bg-orange-500/10 text-orange-400' : 'border-orange-200 bg-orange-50 text-orange-500'}`}>
                      <Upload className="h-7 w-7" />
                    </div>
                    <p className={`text-base font-black ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>ลากและวางไฟล์ที่นี่</p>
                    <p className={`mt-1 text-xs font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>หรือคลิกเพื่อเลือกไฟล์</p>
                    <p className={`mt-3 text-[11px] font-medium leading-5 ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>รองรับ: PNG, JPG, WEBP · ขนาดสูงสุด 10 MB<br />AI วิเคราะห์ 4 รูปแรก และสร้างภาพใช้ 3 รูปแรก</p>
                  </div>
                  <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
                </div>
              </div>

              {/* Benefits Card */}
              <div className={`rounded-3xl border p-6 shadow-xl backdrop-blur-xl ${theme === 'dark' ? 'border-slate-800 bg-slate-900/50 shadow-black/20' : 'border-slate-200/80 bg-white shadow-slate-200/50'}`}>
                <h3 className="mb-4 flex items-center gap-2 text-sm font-black text-orange-500">
                  <Sparkles className="h-4 w-4" />
                  ทำไมต้องใช้ AI ช่วยปรับแต่ง?
                </h3>
                {[
                  { title: 'ประหยัดเวลา', desc: 'AI ช่วยวิเคราะห์และปรับแต่งรูปภาพภายในไม่กี่วินาที', icon: Zap },
                  { title: 'เพิ่มยอดขาย', desc: 'รูปภาพสวยงาม ดึงดูดลูกค้ามากขึ้น', icon: Target },
                  { title: 'มืออาชีพ', desc: 'ได้ภาพคุณภาพระดับมืออาชีพโดยไม่ต้องมีทักษะการออกแบบ', icon: CheckCircle2 },
                  { title: 'สม่ำเสมอ', desc: 'รักษาโทนสีและสไตล์ให้สอดคล้องกับแบรนด์', icon: ImageIcon },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="mb-4 flex items-start gap-3 last:mb-0">
                      <div className={`mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-xl ${theme === 'dark' ? 'bg-orange-500/10 text-orange-400' : 'bg-orange-50 text-orange-500'}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className={`text-xs font-black ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{item.title}</p>
                        <p className={`mt-0.5 text-xs font-medium leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>{item.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Status Badge */}
              <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-lg ${theme === 'dark' ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-white'}`}>
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-500 text-white shrink-0">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <p className={`text-xs font-black ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>ระบบพร้อมใช้งาน</p>
                  <p className="text-[11px] font-medium text-slate-400">PicSeller SaaS v2.0</p>
                </div>
              </div>
            </aside>
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="lg:col-span-2 space-y-8">
              <div className={`${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-100'} p-10 rounded-[3rem] border shadow-sm`}>
                <div className="flex items-center justify-between mb-8">
                  <h3 className={`text-2xl font-black flex items-center gap-4 uppercase tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>
                    <ImageIcon className="text-orange-500 w-8 h-8" />
                    คลังภาพต้นฉบับ ({totalImages})
                  </h3>
                </div>
                {totalImages > 0 ? (
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-5">
                    {[...localImages, ...scrapedImages].map((src, i) => (
                      <div key={i} className={`relative group aspect-square rounded-[2rem] overflow-hidden ${theme === 'dark' ? 'border-gray-700' : 'border-slate-50'} border-2 shadow-sm hover:shadow-xl transition-all`}>
                        <img src={src} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="bg-white text-orange-500 rounded-full p-2 shadow-2xl">
                            <CheckCircle2 className="w-6 h-6" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={`${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-slate-50 border-slate-100'} py-24 text-center rounded-[2.5rem] border-4 border-dashed`}>
                    <AlertCircle className="w-16 h-16 mx-auto text-slate-200 mb-4" />
                    <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-slate-400'} font-black uppercase tracking-widest`}>ไม่มีรูปภาพที่จะใช้เป็นต้นแบบ</p>
                  </div>
                )}
              </div>

              <div className={`${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-100'} p-10 rounded-[3rem] border shadow-sm`}>
                <div className="flex items-center justify-between mb-8">
                  <h3 className={`text-2xl font-black flex items-center gap-4 uppercase tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>
                    <Layers className="text-orange-500 w-8 h-8" />
                    แผนผังการสร้างชุดภาพ {Object.keys(IMAGE_CATEGORIES_METADATA).length} หมวดหมู่
                  </h3>
                  <button
                    onClick={toggleSelectAll}
                    className={`px-6 py-3 rounded-2xl font-black text-sm transition-all flex items-center gap-2 ${selectedCategories.size === Object.keys(IMAGE_CATEGORIES_METADATA).length
                      ? (theme === 'dark' ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-orange-500 text-white hover:bg-orange-600')
                      : (theme === 'dark' ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                      }`}
                  >
                    {selectedCategories.size === Object.keys(IMAGE_CATEGORIES_METADATA).length ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        เลือกทั้งหมด
                      </>
                    ) : (
                      <>
                        <LayoutGrid className="w-4 h-4" />
                        เลือกทั้งหมด ({selectedCategories.size}/{Object.keys(IMAGE_CATEGORIES_METADATA).length})
                      </>
                    )}
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {Object.entries(IMAGE_CATEGORIES_METADATA).sort(([, a], [, b]) => a.order - b.order).map(([key, meta]) => {
                    const isSelected = selectedCategories.has(key as ImageCategory);
                    return (
                      <div
                        key={key}
                        onClick={() => toggleCategory(key as ImageCategory)}
                        className={`flex flex-col gap-4 p-6 rounded-[2rem] border-2 cursor-pointer transition-all group relative ${isSelected
                          ? (theme === 'dark'
                            ? 'bg-orange-900/30 border-orange-500 shadow-lg shadow-orange-900/20'
                            : 'bg-orange-50 border-orange-400 shadow-lg shadow-orange-100')
                          : (theme === 'dark'
                            ? 'bg-gray-800 hover:bg-gray-700 border-gray-700 opacity-60'
                            : 'bg-[#F8FAFC] hover:bg-white border-slate-100 opacity-60')
                          } hover:opacity-100`}
                      >
                        {/* Checkbox Indicator */}
                        <div className={`absolute top-4 right-4 w-6 h-6 rounded-lg flex items-center justify-center transition-all ${isSelected
                          ? 'bg-orange-500 text-white'
                          : (theme === 'dark' ? 'bg-gray-700 border-2 border-gray-600' : 'bg-white border-2 border-slate-200')
                          }`}>
                          {isSelected && <CheckCircle2 className="w-4 h-4" />}
                        </div>
                        <div className={`w-10 h-10 rounded-2xl shadow-md font-black flex items-center justify-center flex-shrink-0 transition-all text-sm ${isSelected
                          ? 'bg-orange-500 text-white'
                          : (theme === 'dark' ? 'bg-gray-700 text-gray-400' : 'bg-white text-slate-400')
                          }`}>{meta.order}</div>
                        <div>
                          <p className={`font-black text-sm uppercase tracking-tight mb-1 ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>{meta.title}</p>
                          <p className={`text-[11px] ${theme === 'dark' ? 'text-gray-400' : 'text-slate-400'} font-bold leading-relaxed`}>{meta.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Tutorial Step Configuration - แสดงเมื่อเลือก TUTORIAL */}
                {selectedCategories.has(ImageCategory.TUTORIAL) && (
                  <div className={`mt-8 p-8 rounded-[2rem] border-2 ${theme === 'dark' ? 'bg-gray-800/50 border-orange-500/50' : 'bg-orange-50 border-orange-200'}`}>
                    <div className="flex items-center justify-between mb-6">
                      <h4 className={`text-lg font-black flex items-center gap-3 ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>
                        <LayoutGrid className="w-5 h-5 text-orange-500" />
                        ตั้งค่า Tutorial 4 ขั้นตอน
                      </h4>
                      <button
                        onClick={() => setTutorialStepPrompts(DEFAULT_TUTORIAL_STEPS)}
                        className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'}`}
                      >
                        <RotateCcw className="w-3 h-3 inline mr-1" />
                        Reset Default
                      </button>
                    </div>
                    <p className={`text-xs mb-6 ${theme === 'dark' ? 'text-gray-400' : 'text-slate-500'}`}>
                      ปรับแต่ง prompt สำหรับแต่ละช่องในภาพ Tutorial (2x2 grid) เพื่อให้ AI สร้างภาพตามขั้นตอนที่ต้องการ
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {tutorialStepPrompts.map((prompt, index) => (
                        <div key={index} className={`p-4 rounded-2xl ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-white'} border ${theme === 'dark' ? 'border-gray-600' : 'border-slate-200'}`}>
                          <label className={`block text-xs font-black mb-2 ${theme === 'dark' ? 'text-orange-400' : 'text-orange-600'}`}>
                            {index === 0 ? '↖️ ช่องซ้ายบน' : index === 1 ? '↗️ ช่องขวาบน' : index === 2 ? '↙️ ช่องซ้ายล่าง' : '↘️ ช่องขวาล่าง'}
                          </label>
                          <input
                            type="text"
                            value={prompt}
                            onChange={(e) => {
                              const newPrompts = [...tutorialStepPrompts];
                              newPrompts[index] = e.target.value;
                              setTutorialStepPrompts(newPrompts);
                            }}
                            placeholder={`Step ${index + 1} description...`}
                            className={`w-full px-4 py-3 rounded-xl text-sm font-medium transition-all ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600 focus:border-orange-500' : 'bg-slate-50 text-slate-800 border-slate-200 focus:border-orange-400'} border focus:outline-none`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-8">
              {/* ===== GEMINI MODEL SELECTOR ===== */}
              <div className={`${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-100'} p-8 rounded-[3rem] border shadow-xl`}>
                <h3 className={`text-lg font-black mb-2 uppercase tracking-tight flex items-center gap-2 ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>
                  <Sparkles className="w-5 h-5 text-orange-500" />
                  เลือกโมเดล Gemini AI
                </h3>
                <p className={`text-xs mb-5 ${theme === 'dark' ? 'text-gray-400' : 'text-slate-400'}`}>เลือกโมเดลที่ใช้สร้างภาพสินค้า — แต่ละโมเดลมีจุดเด่นต่างกัน</p>
                <div className="space-y-3">
                  {GEMINI_IMAGE_MODELS.map(m => {
                    const isSelected = selectedImageModel === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setSelectedImageModel(m.id)}
                        className={`w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 ${isSelected
                          ? `${m.borderColor} ${theme === 'dark' ? 'bg-gray-700/70' : 'bg-slate-50'} shadow-lg ${m.glowColor} shadow-md scale-[1.02]`
                          : `${theme === 'dark' ? 'border-gray-700 hover:border-gray-600 bg-gray-800/50 hover:bg-gray-700/40' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`
                          }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${m.iconBg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                            <Sparkles className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className={`text-xs font-black truncate ${isSelected ? m.textColor : theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>
                                {m.name}
                              </span>
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full text-white ${m.badgeColor} flex-shrink-0`}>
                                {m.badge}
                              </span>
                            </div>
                            <p className={`text-[10px] ${theme === 'dark' ? 'text-gray-400' : 'text-slate-400'} leading-tight`}>{m.desc}</p>
                          </div>
                          {isSelected && (
                            <CheckCircle2 className={`w-5 h-5 flex-shrink-0 ${m.textColor}`} />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {/* แสดงโมเดลที่เลือก */}
                <div className={`mt-4 px-4 py-2 rounded-xl text-[10px] font-mono ${theme === 'dark' ? 'bg-gray-900 text-gray-400' : 'bg-slate-100 text-slate-500'}`}>
                  <span className="opacity-60">model:</span>{' '}
                  <span className={`font-black ${GEMINI_IMAGE_MODELS.find(m => m.id === selectedImageModel)?.textColor || 'text-orange-400'}`}>
                    {selectedImageModel}
                  </span>
                </div>
              </div>

              {/* ===== ASPECT RATIO SELECTOR ===== */}
              <div className={`${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-100'} p-8 rounded-[3rem] border shadow-xl`}>
                <h3 className={`text-lg font-black mb-2 uppercase tracking-tight flex items-center gap-2 ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>
                  <LayoutGrid className="w-5 h-5 text-orange-500" />
                  อัตราส่วนภาพ (Default)
                </h3>
                <p className={`text-xs mb-4 ${theme === 'dark' ? 'text-gray-400' : 'text-slate-400'}`}>ใช้กับทุกภาพ — สามารถเปลี่ยนเฉพาะภาพใน Results ได้</p>
                <div className="grid grid-cols-5 gap-2">
                  {ASPECT_RATIOS.map(r => {
                    const isSelected = selectedAspectRatio === r.id;
                    return (
                      <button
                        key={r.id}
                        onClick={() => setSelectedAspectRatio(r.id)}
                        title={`${r.name} — ${r.desc}`}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all duration-200 ${isSelected
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/30 shadow-md shadow-orange-200/50 scale-105'
                          : `${theme === 'dark' ? 'border-gray-700 hover:border-gray-600 bg-gray-800/50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`
                          }`}
                      >
                        {/* Visual ratio preview box */}
                        <div className="flex items-center justify-center w-8 h-8">
                          <div className={`rounded-sm border-2 transition-colors ${isSelected ? 'border-orange-500 bg-orange-100' : theme === 'dark' ? 'border-gray-500 bg-gray-700' : 'border-slate-400 bg-slate-100'}`}
                            style={{
                              width: r.id === '16:9' ? '28px' : r.id === '9:16' ? '16px' : r.id === '4:5' ? '18px' : r.id === '3:4' ? '18px' : '22px',
                              height: r.id === '16:9' ? '16px' : r.id === '9:16' ? '28px' : r.id === '4:5' ? '22px' : r.id === '3:4' ? '24px' : '22px',
                            }}
                          />
                        </div>
                        <span className={`text-[10px] font-black ${isSelected ? 'text-orange-500' : theme === 'dark' ? 'text-gray-300' : 'text-slate-600'}`}>{r.label}</span>
                        <span className={`text-[8px] font-bold leading-tight text-center ${theme === 'dark' ? 'text-gray-500' : 'text-slate-400'}`}>{r.name}</span>
                      </button>
                    );
                  })}
                </div>
                <div className={`mt-3 px-3 py-1.5 rounded-xl text-[10px] ${theme === 'dark' ? 'bg-gray-900 text-gray-400' : 'bg-slate-100 text-slate-500'}`}>
                  <span className="opacity-60">ratio:</span>{' '}
                  <span className="font-black text-orange-500">{selectedAspectRatio}</span>
                  <span className="opacity-60 ml-2">— {ASPECT_RATIOS.find(r => r.id === selectedAspectRatio)?.desc}</span>
                </div>
              </div>

              <div className={`${theme === 'dark' ? 'bg-gray-800 border-gray-700 ring-gray-700' : 'bg-white border-slate-100 ring-slate-100'} p-10 rounded-[3rem] border shadow-2xl sticky top-24 ring-1`}>
                <h3 className={`text-2xl font-black mb-8 uppercase tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>สไตล์ที่ต้องการ</h3>
                <div className="relative">
                  {/* ===== SLOT MACHINE DRUM ROLLER ===== */}

                  {/* Fade gradient top - reduced height to see more items */}
                  <div className={`absolute top-0 left-0 right-0 h-10 z-10 pointer-events-none rounded-t-2xl ${theme === 'dark' ? 'bg-gradient-to-b from-gray-800 to-transparent' : 'bg-gradient-to-b from-white to-transparent'}`} />

                  {/* Selection indicator overlay — correctly hugging the center frame */}
                  <div className="absolute inset-0 z-20 pointer-events-none flex flex-col items-center justify-center">
                    <button
                      onClick={() => {
                        const container = document.getElementById('style-roller');
                        if (container) container.scrollBy({ top: -88, behavior: 'smooth' });
                      }}
                      className={`pointer-events-auto p-0.5 rounded-full transition-all hover:scale-125 mb-1 ${theme === 'dark' ? 'text-orange-400' : 'text-orange-500'}`}
                    >
                      <ChevronUp className="w-5 h-5" />
                    </button>
                    
                    <div className="w-[calc(100%-2rem)] h-[88px] rounded-2xl border-2 border-orange-500 shadow-[0_0_30px_rgba(249,115,22,0.25),inset_0_0_30px_rgba(249,115,22,0.08)] bg-orange-500/5 pointer-events-none" />

                    <button
                      onClick={() => {
                        const container = document.getElementById('style-roller');
                        if (container) container.scrollBy({ top: 88, behavior: 'smooth' });
                      }}
                      className={`pointer-events-auto p-0.5 rounded-full transition-all hover:scale-125 mt-1 ${theme === 'dark' ? 'text-orange-400' : 'text-orange-500'}`}
                    >
                      <ChevronDown className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Roller scroll container */}
                  <div
                    id="style-roller"
                    className="h-[360px] overflow-y-auto scrollbar-hide snap-y snap-mandatory px-4"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    onScroll={(e) => {
                      // Tick sound via Web Audio API
                      const container = e.currentTarget;
                      const scrollTop = container.scrollTop;
                      const itemH = 88;
                      const currentIdx = Math.round(scrollTop / itemH);
                      const prevIdx = parseInt(container.dataset.prevIdx || '0');
                      if (currentIdx !== prevIdx) {
                        container.dataset.prevIdx = String(currentIdx);
                        try {
                          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                          const osc = audioCtx.createOscillator();
                          const gain = audioCtx.createGain();
                          osc.connect(gain);
                          gain.connect(audioCtx.destination);
                          osc.frequency.value = 800 + (currentIdx % 3) * 200;
                          osc.type = 'sine';
                          gain.gain.value = 0.05;
                          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
                          osc.start();
                          osc.stop(audioCtx.currentTime + 0.08);
                        } catch { /* ignore audio errors */ }
                        // Auto-select the style in the center
                        if (STYLES[currentIdx]) {
                          setSelectedStyle(STYLES[currentIdx].id);
                        }
                      }
                    }}
                    ref={(el) => {
                      if (el && !el.dataset.initialized) {
                        el.dataset.initialized = 'true';
                        // Scroll to selected style on mount
                        const idx = STYLES.findIndex(s => s.id === selectedStyle);
                        if (idx > 0) {
                          setTimeout(() => { el.scrollTop = idx * 88; }, 100);
                        }
                        
                        // Fix jumpy mouse wheel scroll (OS scrolls ~100px, but item is 88px)
                        el.addEventListener('wheel', (e) => {
                          e.preventDefault();
                          // Force exactly one item (88px) jump per wheel tick
                          el.scrollBy({ top: Math.sign(e.deltaY) * 88, behavior: 'smooth' });
                        }, { passive: false });
                      }
                    }}
                  >
                    {/* Spacer top — so first item can reach center */}
                    <div className="h-[136px] snap-start" />

                    {STYLES.map((style, idx) => {
                      const isActive = selectedStyle === style.id;
                      return (
                        <div
                          key={style.id}
                          className="snap-center h-[88px] flex items-center justify-center cursor-pointer"
                          onClick={() => {
                            setSelectedStyle(style.id);
                            const container = document.getElementById('style-roller');
                            if (container) container.scrollTo({ top: idx * 88, behavior: 'smooth' });
                          }}
                        >
                          <div className={`w-full px-6 py-4 rounded-2xl transition-all duration-300 ${
                            isActive
                              ? 'scale-105'
                              : 'opacity-40 scale-100 hover:opacity-60'
                          }`}>
                            <p className={`font-black text-lg tracking-tight text-center transition-colors duration-300 ${
                              isActive
                                ? style.color
                                : theme === 'dark' ? 'text-gray-400' : 'text-slate-500'
                            }`}>
                              <span className="mr-2 text-xl">{style.emoji}</span>
                              {style.name}
                            </p>
                            {isActive && (
                              <p className={`text-[9px] font-bold uppercase tracking-widest text-center mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-slate-400'}`}>
                                {style.desc}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Spacer bottom */}
                    <div className="h-[136px] snap-start" />
                  </div>



                  {/* Fade gradient bottom - reduced height */}
                  <div className={`absolute bottom-0 left-0 right-0 h-10 z-10 pointer-events-none rounded-b-2xl ${theme === 'dark' ? 'bg-gradient-to-t from-gray-800 to-transparent' : 'bg-gradient-to-t from-white to-transparent'}`} />

                  {/* Decorative sparkle */}
                  <div className="absolute bottom-4 right-4 z-20 opacity-40">
                    <Sparkles className={`w-5 h-5 ${theme === 'dark' ? 'text-orange-400' : 'text-orange-300'}`} />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className={`${theme === 'dark' ? 'border-gray-700' : 'border-slate-100'} pt-8 border-t mt-6`}>
                    <button
                      onClick={startGeneration}
                      disabled={isGenerating || selectedCategories.size === 0}
                      className={`w-full font-black py-6 rounded-[2rem] transition-all flex items-center justify-center gap-4 shadow-2xl group active:scale-95 ${selectedCategories.size === 0
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                        : 'bg-slate-900 hover:bg-black text-white'
                        }`}
                    >
                      {isGenerating ? <Loader2 className="animate-spin w-6 h-6" /> : <Sparkles className={`w-7 h-7 group-hover:scale-125 transition-transform ${selectedCategories.size === 0 ? 'text-slate-400' : 'text-orange-400'}`} />}
                      {selectedCategories.size === 0
                        ? 'เลือกหมวดหมู่ก่อน'
                        : `สร้างภาพ ${selectedCategories.size} หมวดหมู่`}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            {isGenerating && (
              <button
                onClick={stopResultsGeneration}
                className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl border border-rose-300 bg-rose-600 px-5 py-3.5 text-sm font-black text-white shadow-2xl shadow-rose-950/30 transition hover:bg-rose-700 active:scale-95"
              >
                <X className="h-5 w-5" />
                หยุดการสร้างภาพ
              </button>
            )}
            {/* Results Dashboard Header */}
            <div className={`${theme === 'dark' ? 'bg-gray-800 border-gray-700 ring-gray-700' : 'bg-white border-slate-100 ring-slate-50'} rounded-[3.5rem] p-12 border shadow-2xl mb-12 overflow-hidden relative ring-1`}>
              <div className="absolute top-0 right-0 w-80 h-80 bg-orange-100/30 rounded-full -mr-40 -mt-40 blur-[100px] -z-10"></div>

              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-10">
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-4">
                    <span className={`${theme === 'dark' ? 'bg-gray-700' : 'bg-slate-900'} text-white text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-[0.2em] shadow-lg shadow-slate-200`}>Processing Engine</span>
                    <div className="flex -space-x-3">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="w-8 h-8 rounded-full border-4 border-white bg-slate-100 flex items-center justify-center">
                          <Zap className="w-3 h-3 text-orange-500" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <h2 className={`text-5xl font-black flex items-center gap-4 tracking-tighter mb-4 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                    ชุดภาพลำดับการขาย
                  </h2>
                  <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-slate-400'} font-bold text-lg max-w-2xl leading-relaxed`}>
                    สร้างสำเร็จสำหรับ <span className={`font-black ${theme === 'dark' ? 'text-orange-400' : 'text-orange-500'}`}>"{productName || 'Unnamed Product'}"</span> <br />
                    เน้นสไตล์ <span className={theme === 'dark' ? 'text-white' : 'text-slate-900'}>{selectedStyleName}</span> เพื่อเพิ่มยอดขาย
                  </p>
                </div>

                <div className={`${theme === 'dark' ? 'bg-gray-800/90 border-gray-700' : 'bg-slate-50 border-slate-100'} p-6 sm:p-7 rounded-[2rem] flex flex-col gap-4 min-w-[320px] shadow-inner border`}>
                  <div className={`rounded-xl px-3 py-2 text-[10px] font-mono font-bold ${theme === 'dark' ? 'bg-gray-900 text-emerald-300' : 'bg-white text-emerald-700'} border ${theme === 'dark' ? 'border-gray-700' : 'border-emerald-100'}`}>
                    กำลังเลือกใช้: {selectedImageModel}
                  </div>
                  <div className="flex items-center justify-between w-full text-[12px] font-black uppercase tracking-widest text-slate-500">
                    <span className="flex items-center gap-2"><Zap className="w-4 h-4 text-orange-500" /> ความคืบหน้า</span>
                    <span className={`${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{completedCount} / 9</span>
                  </div>
                  <div className="w-full bg-slate-200 h-4 rounded-full overflow-hidden border-4 border-white shadow-sm">
                    <div
                      className="bg-gradient-to-r from-orange-400 to-orange-600 h-full transition-all duration-1000 ease-out shadow-lg"
                      style={{ width: `${progressPercent}%` }}
                    ></div>
                  </div>
                  <div className="flex gap-3 w-full mt-2">
                    <button onClick={() => setStep(2)} className={`flex-1 rounded-[1.25rem] px-5 py-3.5 ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-white border-2 border-slate-200 hover:bg-slate-50 text-slate-700'} font-black text-xs transition-all shadow-sm active:scale-95`}>ย้อนกลับ</button>
                    {isGenerating && <button onClick={stopResultsGeneration} className="rounded-[1.25rem] border border-rose-300 bg-rose-50 px-4 py-3.5 text-xs font-black text-rose-700 shadow-sm transition hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-200"><X className="h-4 w-4" /></button>}
                    <button
                      onClick={handleDownloadAll}
                      disabled={isGenerating || isZipping || completedCount === 0}
                      className="flex-[1.35] rounded-[1.25rem] px-5 py-3.5 bg-orange-500 text-white hover:bg-orange-600 font-black text-xs flex items-center justify-center gap-2.5 shadow-lg shadow-orange-500/25 disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none transition-all active:scale-95"
                    >
                      {isZipping ? <Loader2 className="animate-spin w-5 h-5" /> : <FileArchive className="w-5 h-5" />}
                      {isZipping ? 'กำลังเตรียมไฟล์...' : 'ดาวน์โหลดภาพ'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Strategic Grid Section Header */}
            <div className="mb-10 flex flex-col gap-5 px-4 xl:flex-row xl:items-center">
              <div className="flex min-w-0 items-center gap-4">
                <Target className="h-6 w-6 shrink-0 text-orange-500" />
                <h3 className={`text-xl font-black uppercase tracking-tighter ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>
                  โครงสร้าง 9 ภาพเพื่อการปิดการขาย (Strategic Sequence)
                </h3>
              </div>
              <div className={`${theme === 'dark' ? 'bg-gray-700' : 'bg-slate-200'} hidden h-[2px] flex-1 xl:block`}></div>
              <div className="flex flex-wrap items-center gap-3">
                <div className={`flex items-center gap-1 rounded-2xl border p-1.5 ${theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-slate-200 bg-white shadow-sm'}`}>
                  {RESULTS_DENSITIES.map(option => (
                    <button
                      key={option.id}
                      onClick={() => setResultsDensity(option.id)}
                      title={option.description}
                      className={`rounded-xl px-3 py-2 text-[10px] font-black transition-all ${resultsDensity === option.id ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30' : theme === 'dark' ? 'text-gray-300 hover:bg-gray-700' : 'text-slate-500 hover:bg-slate-100'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <span className={`text-[10px] font-bold ${theme === 'dark' ? 'text-gray-400' : 'text-slate-400'}`}>ปรับมุมมองภาพรวม</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {['Hook', 'Logic', 'Emotion', 'Trust'].map(label => (
                  <div key={label} className="flex items-center gap-2">
                    <div className={`h-3 w-3 rounded-full ${label === 'Hook' ? 'bg-red-500' : label === 'Logic' ? 'bg-blue-500' : label === 'Emotion' ? 'bg-pink-500' : 'bg-green-500'}`}></div>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${theme === 'dark' ? 'text-gray-400' : 'text-slate-400'}`}>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Structured 9-Image Gallery */}
            <div className={`grid ${RESULTS_DENSITIES.find(option => option.id === resultsDensity)?.gridClass || RESULTS_DENSITIES[1].gridClass} mb-20`}>
              {Object.entries(IMAGE_CATEGORIES_METADATA)
                .sort(([, a], [, b]) => a.order - b.order)
                .map(([catKey, meta]) => {
                  const img = generatedImages.find(g => g.category === catKey);
                  const strategy = getStrategyLabel(meta.order);
                  const isHero = meta.order === 1;

                  return (
                    <div key={catKey} className={`group flex flex-col ${isHero && resultsDensity !== 'overview' ? 'lg:scale-105 z-10' : ''}`}>
                      <div className={`aspect-square relative rounded-[3rem] overflow-hidden border-4 transition-all duration-700 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} ${img?.status === 'completed' ? (theme === 'dark' ? 'border-gray-700 shadow-2xl ring-gray-700' : 'border-white shadow-2xl ring-slate-100') : (theme === 'dark' ? 'border-gray-700 border-dashed bg-gray-800/50 hover:bg-gray-700 hover:border-orange-500' : 'border-slate-200 border-dashed bg-slate-50/50 hover:bg-white hover:border-orange-200')}`}>

                        {/* Status: Completed */}
                        {img?.status === 'completed' && (
                          <div className="w-full h-full relative animate-in fade-in duration-1000">
                            <img src={img.url} alt={meta.title} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />
                            {img.modelUsed && (
                              <div title={img.modelUsed} className="absolute left-4 top-4 max-w-[calc(100%-5.5rem)] truncate rounded-full border border-emerald-200/40 bg-slate-950/70 px-3 py-1.5 text-[9px] font-black tracking-wide text-emerald-200 backdrop-blur-md">
                                AI: {img.modelUsed}
                              </div>
                            )}
                            {img.isManualScale && (
                              <div className="absolute bottom-4 left-4 rounded-full border border-orange-200/40 bg-orange-500/90 px-3 py-1.5 text-[9px] font-black tracking-wide text-white shadow-lg backdrop-blur-md">
                                <Ruler className="mr-1 inline h-3 w-3" />ล็อกสเกลจริง
                              </div>
                            )}

                            {/* Preview Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openPreview(img.url);
                              }}
                              className="absolute top-4 right-4 p-2.5 bg-black/30 hover:bg-black/50 text-white rounded-full backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all z-20 hover:scale-110 active:scale-95"
                              title="ดูภาพขนาดใหญ่"
                            >
                              <Eye className="w-5 h-5" />
                            </button>
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-end p-10">
                              <div className="flex flex-col gap-4 w-full">
                                <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/20">
                                  {img.modelUsed && (
                                    <p className="text-emerald-200 text-[10px] font-black uppercase tracking-widest mb-2">
                                      MODEL USED: {img.modelUsed}
                                    </p>
                                  )}
                                  <p className="text-white text-[10px] font-black uppercase tracking-widest mb-1">PROMPT USED</p>
                                  {!editingPrompt[catKey] ? (
                                    <>
                                      <p className="text-white/70 text-[10px] italic line-clamp-2">"High-quality commercial render, ${img.visualStyle || cardVisualStyles[catKey] || (catKey === 'COVER' ? selectedCoverStyle || selectedStyle : selectedStyle)} style, master lighting..."</p>
                                      <button
                                        onClick={() => startEditingPrompt(catKey)}
                                        className="mt-2 text-[9px] text-blue-300 hover:text-white font-black underline"
                                      >
                                        Edit Prompt
                                      </button>
                                    </>
                                  ) : (
                                    <div className="flex flex-col gap-2">
                                      <textarea
                                        value={promptInputs[catKey] || `High-quality commercial render, ${selectedStyle} style, master lighting..., ${meta.title}`}
                                        onChange={(e) => handlePromptInputChange(catKey, e.target.value)}
                                        className="w-full text-[10px] p-2 rounded bg-white/20 text-white placeholder:text-white/50 border border-white/30"
                                        rows={3}
                                      />
                                      <div className="flex gap-2">
                                        <button
                                          onClick={() => saveEditedPrompt(catKey as ImageCategory)}
                                          className="text-[9px] text-green-300 hover:text-white font-black underline"
                                        >
                                          Save & Regenerate
                                        </button>
                                        <button
                                          onClick={() => cancelEditingPrompt(catKey)}
                                          className="text-[9px] text-red-300 hover:text-white font-black underline ml-2"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                {/* Visual direction is available on every result card. */}
                                <div className="mb-2">
                                  <label className="mb-1 block text-[9px] font-black uppercase tracking-wider text-white/80">รูปแบบภาพการ์ดนี้</label>
                                  <select
                                    value={cardVisualStyles[catKey] || (catKey === 'COVER' ? selectedCoverStyle || selectedStyle : selectedStyle)}
                                    onChange={(e) => setCardVisualStyles(prev => ({ ...prev, [catKey]: e.target.value }))}
                                    className="w-full text-[10px] p-2 rounded-xl bg-white/20 text-white border border-white/30 backdrop-blur-md font-bold"
                                  >
                                    {STYLES.map(style => <option key={style.id} value={style.id} className="bg-slate-800 text-white">{style.name} — {style.desc}</option>)}
                                  </select>
                                </div>

                                {/* Cover Style Dropdown - แสดงเฉพาะ COVER */}
                                {catKey === 'COVER' && (
                                  <div className="mb-2">
                                    <select
                                      value={selectedCoverStyle || selectedStyle}
                                      onChange={(e) => setSelectedCoverStyle(e.target.value)}
                                      className="w-full text-[10px] p-2 rounded-xl bg-white/20 text-white border border-white/30 backdrop-blur-md font-bold"
                                    >
                                      {STYLES.map(style => (
                                        <option key={style.id} value={style.id} className="bg-slate-800 text-white">
                                          {style.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}

                                {/* Social Proof Dropdown - แสดงเฉพาะ Social Proof category */}
                                {catKey === 'SOCIAL_PROOF' && (
                                  <div className="mb-2">
                                    <select
                                      value={selectedSocialProof[catKey] || 'unboxing-moment'}
                                      onChange={(e) => setSelectedSocialProof(prev => ({
                                        ...prev,
                                        [catKey]: e.target.value
                                      }))}
                                      className="w-full text-[10px] p-2 rounded-xl bg-white/20 text-white border border-white/30 backdrop-blur-md font-bold"
                                    >
                                      {SOCIAL_PROOF_OPTIONS.map(opt => (
                                        <option key={opt.id} value={opt.id} className="bg-slate-800 text-white">
                                          {opt.name} - {opt.desc}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}

                                {/* Infographic Style Dropdown - แสดงเฉพาะ INFOGRAPHIC */}
                                {catKey === 'INFOGRAPHIC' && (
                                  <div className="mb-2">
                                    <select
                                      value={selectedInfographicStyle[catKey] || '0'}
                                      onChange={(e) => setSelectedInfographicStyle(prev => ({
                                        ...prev,
                                        [catKey]: e.target.value
                                      }))}
                                      className="w-full text-[10px] p-2 rounded-xl bg-white/20 text-white border border-white/30 backdrop-blur-md font-bold"
                                    >
                                      {INFOGRAPHIC_STYLE_OPTIONS.map(opt => (
                                        <option key={opt.id} value={opt.id} className="bg-slate-800 text-white">
                                          {opt.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}

                                {/* Size Chart Style Dropdown - แสดงเฉพาะ SIZE_CHART */}
                                {catKey === 'SIZE_CHART' && (
                                  <div className="mb-3 space-y-2">
                                    <select
                                      value={selectedSizeChartStyle[catKey] || '0'}
                                      onChange={(e) => setSelectedSizeChartStyle(prev => ({
                                        ...prev,
                                        [catKey]: e.target.value
                                      }))}
                                      className="w-full text-[10px] p-2 rounded-xl bg-white/20 text-white border border-white/30 backdrop-blur-md font-bold"
                                    >
                                      {SIZE_CHART_STYLE_OPTIONS.map(opt => (
                                        <option key={opt.id} value={opt.id} className="bg-slate-800 text-white">
                                          {opt.name}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      onClick={(event) => { event.stopPropagation(); openManualScaleCorrection(); }}
                                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-orange-300 bg-orange-500/90 px-3 py-2 text-[10px] font-black text-white shadow-lg transition hover:bg-orange-600"
                                    >
                                      <Ruler className="h-3.5 w-3.5" />{img.isManualScale ? 'ปรับสเกลจริงอีกครั้ง' : 'ขนาดไม่ตรง? ปรับสเกลจริง'}
                                    </button>
                                    {img.isManualScale && img.originalUrl && (
                                      <button
                                        onClick={(event) => { event.stopPropagation(); restoreOriginalSizeChart(); }}
                                        className="w-full rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-[10px] font-black text-white transition hover:bg-white/20"
                                      >
                                        กลับไปใช้ภาพ AI เดิม
                                      </button>
                                    )}
                                  </div>
                                )}

                                {/* Tutorial Style Dropdown - แสดงเฉพาะ TUTORIAL (ก่อน Step Editor) */}
                                {catKey === 'TUTORIAL' && (
                                  <div className="mb-2">
                                    <select
                                      value={selectedTutorialStyle[catKey] || '0'}
                                      onChange={(e) => setSelectedTutorialStyle(prev => ({
                                        ...prev,
                                        [catKey]: e.target.value
                                      }))}
                                      className="w-full text-[10px] p-2 rounded-xl bg-white/20 text-white border border-white/30 backdrop-blur-md font-bold"
                                    >
                                      {TUTORIAL_STYLE_OPTIONS.map(opt => (
                                        <option key={opt.id} value={opt.id} className="bg-slate-800 text-white">
                                          {opt.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}

                                {/* Lifestyle Dropdown - แสดงเฉพาะ Lifestyle categories */}
                                {catKey.startsWith('LIFESTYLE_') && (
                                  <div className="mb-2">
                                    <select
                                      value={selectedLifestyle[catKey] || catKey}
                                      onChange={(e) => setSelectedLifestyle(prev => ({
                                        ...prev,
                                        [catKey]: e.target.value as ImageCategory
                                      }))}
                                      className="w-full text-[10px] p-2 rounded-xl bg-white/20 text-white border border-white/30 backdrop-blur-md font-bold"
                                    >
                                      {LIFESTYLE_OPTIONS.map(opt => (
                                        <option key={opt.id} value={opt.id} className="bg-slate-800 text-white">
                                          {opt.name} - {opt.desc}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                                {/* Tutorial Step Editor - แสดงเฉพาะ TUTORIAL */}
                                {catKey === 'TUTORIAL' && (
                                  <div className="mb-3 bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/20">
                                    <p className="text-white text-[9px] font-black uppercase tracking-wider mb-2 flex items-center gap-1">
                                      <LayoutGrid className="w-3 h-3" />
                                      แก้ไข 4 ขั้นตอน
                                    </p>
                                    <div className="grid grid-cols-2 gap-2">
                                      {tutorialStepPrompts.map((prompt, idx) => (
                                        <input
                                          key={idx}
                                          type="text"
                                          value={prompt}
                                          onChange={(e) => {
                                            const newPrompts = [...tutorialStepPrompts];
                                            newPrompts[idx] = e.target.value;
                                            setTutorialStepPrompts(newPrompts);
                                          }}
                                          className="w-full text-[9px] p-2 rounded-lg bg-white/20 text-white border border-white/30 placeholder:text-white/50"
                                          placeholder={`Step ${idx + 1}`}
                                        />
                                      ))}
                                    </div>
                                    <button
                                      onClick={() => regenerateImage(ImageCategory.TUTORIAL, JSON.stringify(tutorialStepPrompts))}
                                      className="w-full mt-2 py-2 bg-green-500 hover:bg-green-600 text-white text-[10px] font-black rounded-lg transition-all flex items-center justify-center gap-1"
                                    >
                                      <RotateCcw className="w-3 h-3" />
                                      สร้างใหม่ตาม Steps
                                    </button>
                                  </div>
                                )}
                                {/* Per-image Aspect Ratio Selector */}
                                <div className="mb-3 bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/20">
                                  <p className="text-white text-[9px] font-black uppercase tracking-widest mb-2 flex items-center gap-1">
                                    <LayoutGrid className="w-3 h-3" />
                                    Ratio ภาพนี้ {imageAspectRatios[catKey] && imageAspectRatios[catKey] !== selectedAspectRatio ? <span className="text-orange-300 ml-1">(Override)</span> : ''}
                                  </p>
                                  <div className="flex gap-1.5">
                                    {ASPECT_RATIOS.map(r => {
                                      const currentRatio = imageAspectRatios[catKey] || selectedAspectRatio;
                                      const isActiveRatio = currentRatio === r.id;
                                      return (
                                        <button
                                          key={r.id}
                                          onClick={() => setImageAspectRatios(prev => ({ ...prev, [catKey]: r.id }))}
                                          title={`${r.name} — ${r.desc}`}
                                          className={`flex-1 py-1.5 rounded-lg text-[9px] font-black transition-all ${isActiveRatio
                                              ? 'bg-orange-500 text-white shadow-md'
                                              : 'bg-white/20 text-white/80 hover:bg-white/30'
                                            }`}
                                        >
                                          {r.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                <div className="flex gap-3">
                                  <button
                                    onClick={() => downloadSingleImage(img.url, meta.title)}
                                    className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-2xl text-[12px] shadow-2xl flex items-center justify-center gap-3 transition-all active:scale-95"
                                  >
                                    <Download className="w-5 h-5" /> บันทึกภาพ
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      // คำนวณ styleIndex สำหรับหมวดที่รองรับการเลือกสไตล์
                                      let styleIdx: number | undefined;
                                      if (catKey === 'INFOGRAPHIC') {
                                        const val = selectedInfographicStyle[catKey] || '0';
                                        styleIdx = parseInt(val) || undefined;
                                      } else if (catKey === 'SIZE_CHART') {
                                        const val = selectedSizeChartStyle[catKey] || '0';
                                        styleIdx = parseInt(val) || undefined;
                                      } else if (catKey === 'TUTORIAL') {
                                        const val = selectedTutorialStyle[catKey] || '0';
                                        styleIdx = parseInt(val) || undefined;
                                      }

                                      regenerateImage(
                                        catKey.startsWith('LIFESTYLE_')
                                          ? (selectedLifestyle[catKey] || catKey) as ImageCategory
                                          : catKey as ImageCategory,
                                        catKey === 'TUTORIAL' ? JSON.stringify(tutorialStepPrompts) : undefined,
                                        catKey === 'COVER' ? (cardVisualStyles[catKey] || selectedCoverStyle || selectedStyle) : (catKey === 'SOCIAL_PROOF' ? (selectedSocialProof[catKey] || 'unboxing-moment') : undefined),
                                        styleIdx
                                      );
                                    }}
                                    className="p-4 bg-blue-500 hover:bg-blue-600 text-white font-black rounded-2xl text-[12px] shadow-2xl flex items-center justify-center transition-all active:scale-95"
                                    title={`Regenerate (${imageAspectRatios[catKey] || selectedAspectRatio})`}
                                  >
                                    <RotateCcw className="w-5 h-5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div className="absolute top-6 right-6">
                              <div className="bg-white/90 backdrop-blur shadow-xl p-2 rounded-2xl text-green-500 ring-4 ring-green-50">
                                <CheckCircle2 className="w-6 h-6" />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Status: Generating */}
                        {img?.status === 'generating' && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-12 text-center">
                            <div className="relative">
                              <div className="w-20 h-20 border-8 border-orange-50 rounded-[2rem] animate-spin border-t-orange-500"></div>
                              <Sparkles className="absolute inset-0 m-auto w-8 h-8 text-orange-400 animate-pulse" />
                            </div>
                            <div>
                              <p className={`text-lg font-black tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>กำลังรังสรรค์ภาพ...</p>
                              <p className={`text-[10px] font-black uppercase mt-2 tracking-[0.2em] ${theme === 'dark' ? 'text-gray-400' : 'text-slate-400'}`}>{meta.title}</p>
                            </div>
                            <button
                              onClick={(event) => { event.stopPropagation(); stopResultsGeneration(); }}
                              className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-xs font-black text-rose-700 shadow-sm transition hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-200"
                            >
                              หยุดการสร้าง
                            </button>
                          </div>
                        )}

                        {/* Status: Idle / Blueprint */}
                        {(!img || img.status === 'idle') && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isGenerating) regenerateImage(catKey as ImageCategory);
                            }}
                            className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-12 text-center opacity-40 group-hover:opacity-100 transition-all cursor-pointer hover:bg-white/5 hover:backdrop-blur-sm active:scale-95 duration-300 z-10"
                          >
                            <div className={`w-24 h-24 rounded-[2.5rem] ${theme === 'dark' ? 'bg-gray-700' : 'bg-white'} flex items-center justify-center text-slate-200 group-hover:bg-orange-50 group-hover:text-orange-400 transition-all border-4 border-dashed ${theme === 'dark' ? 'border-gray-600' : 'border-slate-100'} shadow-inner group-hover:rotate-12`}>
                              <ImageIcon className="w-12 h-12" />
                            </div>
                            <div>
                              <p className={`text-sm font-black uppercase tracking-widest mb-2 ${theme === 'dark' ? 'text-white' : 'text-slate-500'}`}>โครงสร้างภาพที่ {meta.order}</p>
                              <p className={`text-[10px] font-bold leading-relaxed px-6 italic ${theme === 'dark' ? 'text-gray-400' : 'text-slate-400'}`}>พิมพ์เขียวพร้อมใช้งาน <br />คลิกเพื่อสร้างภาพทันที</p>
                            </div>

                            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xs opacity-0 group-hover:opacity-100 transition-opacity">
                              <label className={`mb-1 block text-[9px] font-black uppercase tracking-wider ${theme === 'dark' ? 'text-white/80' : 'text-slate-600'}`}>เลือกรูปแบบภาพการ์ดนี้</label>
                              <select
                                value={cardVisualStyles[catKey] || (catKey === 'COVER' ? selectedCoverStyle || selectedStyle : selectedStyle)}
                                onChange={(e) => setCardVisualStyles(prev => ({ ...prev, [catKey]: e.target.value }))}
                                className={`w-full rounded-xl border px-3 py-2 text-[10px] font-bold outline-none ${theme === 'dark' ? 'border-gray-600 bg-gray-800 text-white' : 'border-slate-200 bg-white text-slate-700'}`}
                              >
                                {STYLES.map(style => <option key={style.id} value={style.id}>{style.name} — {style.desc}</option>)}
                              </select>
                            </div>

                            <div className="absolute bottom-10 opacity-0 group-hover:opacity-100 transition-opacity animate-in slide-in-from-bottom-2">
                              <span className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full shadow-lg ${theme === 'dark' ? 'bg-orange-500 text-white' : 'bg-slate-900 text-white'}`}>
                                <Sparkles className="w-3 h-3 inline mr-1" /> Click to Generate
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Status: Error */}
                        {img?.status === 'error' && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-12 text-center bg-red-50/30">
                            <div className="bg-white p-4 rounded-3xl shadow-xl">
                              <AlertCircle className="w-10 h-10 text-red-400" />
                            </div>
                            <p className={`text-sm font-black leading-tight ${theme === 'dark' ? 'text-red-300' : 'text-red-500'}`}>เกิดข้อผิดพลาดในการสร้างภาพ</p>
                            {img.error && (
                              <p className="text-xs text-red-300 text-center px-4" title={img.error}>
                                {img.error.length > 50 ? `${img.error.substring(0, 50)}...` : img.error}
                              </p>
                            )}
                            {/* Lifestyle Dropdown ใน Error state */}
                            {catKey.startsWith('LIFESTYLE_') && (
                              <select
                                value={selectedLifestyle[catKey] || catKey}
                                onChange={(e) => setSelectedLifestyle(prev => ({
                                  ...prev,
                                  [catKey]: e.target.value as ImageCategory
                                }))}
                                className={`w-4/5 text-[10px] p-2 rounded-xl ${theme === 'dark' ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-slate-800 border-slate-200'} border font-bold`}
                              >
                                {LIFESTYLE_OPTIONS.map(opt => (
                                  <option key={opt.id} value={opt.id}>
                                    {opt.name} - {opt.desc}
                                  </option>
                                ))}
                              </select>
                            )}
                            <button
                              onClick={() => regenerateImage(
                                catKey.startsWith('LIFESTYLE_')
                                  ? (selectedLifestyle[catKey] || catKey) as ImageCategory
                                  : catKey as ImageCategory
                              )}
                              className="px-6 py-2 bg-blue-500 text-white text-[10px] font-black rounded-xl hover:bg-blue-600 transition-all flex items-center gap-2"
                            >
                              <RotateCcw className="w-4 h-4" /> สร้างภาพใหม่ ({(regenerationAttempts[catKey] || 0) + 1} ครั้ง)
                            </button>
                          </div>
                        )}

                        {/* Slot Strategy Badge */}
                        <div className="absolute top-6 left-6 flex flex-col gap-2">
                          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-white text-[9px] font-black uppercase tracking-widest shadow-lg ${strategy.color}`}>
                            {strategy.icon}
                            {strategy.text}
                          </div>
                          {isHero && (
                            <div className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2 ${theme === 'dark' ? 'bg-gray-700 text-white' : 'bg-slate-900 text-white'}`}>
                              <Target className="w-3 h-3 text-orange-400" /> HERO
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Card Info Footer */}
                      <div className="mt-8 px-4 text-center md:text-left">
                        <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
                          <h4 className={`font-black text-lg group-hover:text-orange-600 transition-colors uppercase tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{meta.title}</h4>
                        </div>
                        <p className={`text-xs font-bold leading-relaxed line-clamp-2 h-10 italic ${theme === 'dark' ? 'text-gray-400' : 'text-slate-400'}`}>
                          " {STYLES.find(s => s.id === (img?.visualStyle || cardVisualStyles[catKey] || (catKey === 'COVER' ? selectedCoverStyle || selectedStyle : selectedStyle)))?.name || meta.desc} "
                        </p>
                        <div className="mt-6 flex items-center gap-4">
                          <div className={`w-2 h-2 rounded-full ${strategy.color} shadow-sm`}></div>
                          <div className={`${theme === 'dark' ? 'bg-gray-700' : 'bg-slate-100'} h-[1px] flex-1`}></div>
                          <span className={`text-[9px] font-black uppercase tracking-[0.2em] flex items-center gap-2 ${theme === 'dark' ? 'text-gray-500' : 'text-slate-300'}`}>
                            SLOT {meta.order}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            {generatedImages.some(image => image.variantLabel) && (
              <section className={`mt-12 rounded-[2.5rem] border p-6 md:p-8 ${theme === 'dark' ? 'border-emerald-900/70 bg-emerald-950/15' : 'border-emerald-100 bg-emerald-50/50'}`}>
                <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">Variant Studio</p>
                    <h3 className={`mt-1 text-xl font-black ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>ภาพแยกตามตัวเลือกสินค้า</h3>
                    <p className={`mt-1 text-xs ${theme === 'dark' ? 'text-emerald-200/70' : 'text-emerald-800/70'}`}>แต่ละภาพยึดชื่อตัวเลือกและราคาที่ยืนยันไว้จากหน้า Analyze</p>
                  </div>
                  <span className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-black text-white">{generatedImages.filter(image => image.variantLabel).length} ตัวเลือก</span>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {generatedImages.filter(image => image.variantLabel).map(image => (
                    <article key={image.id} className={`overflow-hidden rounded-3xl border ${theme === 'dark' ? 'border-gray-700 bg-gray-900' : 'border-white bg-white shadow-sm'}`}>
                      <div className={`aspect-square ${theme === 'dark' ? 'bg-gray-800' : 'bg-slate-100'}`}>
                        {image.status === 'completed' && image.url ? <img src={image.url} alt={image.variantLabel} className="h-full w-full object-cover"/> : <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-xs text-slate-500">{image.status === 'generating' ? <Loader2 className="animate-spin text-emerald-500"/> : <ImageIcon className="text-emerald-500"/>}<span>{image.status === 'generating' ? 'กำลังสร้างภาพตัวเลือก…' : image.error || 'รอสร้างภาพ'}</span></div>}
                      </div>
                      <div className="p-4"><p className={`text-sm font-black ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{image.variantLabel}</p><p className="mt-1 truncate text-[10px] font-bold text-emerald-600">{image.modelUsed ? `ใช้จริง: ${image.modelUsed}` : image.status === 'generating' ? 'กำลังส่งข้อมูลรุ่น/ตัวเลือกให้ AI' : 'รอผลลัพธ์'}</p><p className={`mt-2 text-[10px] ${theme === 'dark' ? 'text-gray-400' : 'text-slate-500'}`}>สไตล์: {STYLES.find(style => style.id === image.visualStyle)?.name || image.visualStyle || selectedStyleName}</p>{image.url && <button onClick={() => downloadSingleImage(image.url, image.variantLabel || 'variant')} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2 text-xs font-black text-white hover:bg-emerald-700"><Download className="h-4 w-4"/>บันทึกภาพ</button>}</div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {/* Empty State Guard */}
            {generatedImages.length === 0 && !isGenerating && (
              <div className={`py-40 flex flex-col items-center justify-center ${theme === 'dark' ? 'text-gray-400 bg-gray-800' : 'text-slate-400 bg-white'} rounded-[4rem] border-4 border-dashed max-w-3xl mx-auto shadow-sm ${theme === 'dark' ? 'border-gray-700' : 'border-slate-50'}`}>
                <div className={`p-12 rounded-[3rem] mb-8 shadow-inner rotate-6 ${theme === 'dark' ? 'bg-gray-800' : 'bg-[#F8FAFC]'}`}>
                  <LayoutGrid className="w-20 h-20 opacity-10 text-orange-500" />
                </div>
                <h3 className={`text-3xl font-black tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>ยังไม่มีประวัติการสร้างภาพ</h3>
                <p className={`text-lg text-center px-16 mt-4 max-w-lg font-bold ${theme === 'dark' ? 'text-gray-400' : 'text-slate-400'} leading-relaxed`}>
                  AI พร้อมที่จะเนรมิตภาพสินค้าทั้ง 9 หมวดหมู่ <br /> กรุณากลับไปกดปุ่ม <span className={`font-black ${theme === 'dark' ? 'text-orange-400' : 'text-orange-500'}`}>"เริ่มสร้างภาพทั้งหมด"</span> ในหน้า Configure
                </p>
                <button
                  onClick={() => setStep(2)}
                  className="mt-12 px-10 py-5 bg-orange-500 text-white rounded-[2rem] hover:bg-orange-600 transition-all font-black text-lg flex items-center gap-4 shadow-2xl shadow-orange-100 active:scale-95"
                >
                  <ArrowRightCircle className="w-6 h-6 rotate-180" />
                  กลับไปหน้าตั้งค่า
                </button>
              </div>
            )}
          </div>
        )
        }
        </>}
      </main >

      <footer className={`${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-100'} border-t py-16 px-8 mt-24`}>
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row justify-between items-center gap-12 text-slate-400">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner ${theme === 'dark' ? 'bg-gray-700' : 'bg-[#F8FAFC]'}`}>
              <Sparkles className="w-6 h-6 text-orange-400" />
            </div>
            <div>
              <p className={`text-xs font-black uppercase tracking-[0.2em] ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>PicSeller AI Suite</p>
              <p className={`text-[10px] font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-gray-400' : 'text-slate-400'}`}>Powered by Gemini 2.5 Flash Rendering</p>
            </div>
          </div>
          <div className="flex gap-8 items-center">
            <div className={`h-10 w-[1px] ${theme === 'dark' ? 'bg-gray-700' : 'bg-slate-100'} hidden lg:block`}></div>
            <div className={`text-[10px] font-black uppercase tracking-[0.25em] text-center lg:text-right leading-loose ${theme === 'dark' ? 'text-gray-400' : 'text-slate-400'}`}>
              v2.5.0 STABLE <br />
              <span className={theme === 'dark' ? 'text-gray-500' : 'text-slate-300'}>© 2024 Intelligent Design Engine</span>
            </div>
          </div>
        </div>
      </footer>

      {isManualScaleOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" onMouseDown={() => setIsManualScaleOpen(false)}>
          <section className={`max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] border p-5 shadow-2xl md:p-8 ${theme === 'dark' ? 'border-slate-700 bg-slate-900 text-white' : 'border-white bg-white text-slate-900'}`} onMouseDown={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.16em] text-orange-500"><Ruler className="h-4 w-4" /> Manual Scale Correction</div>
                <h3 className="mt-2 text-2xl font-black">สร้าง Size Chart จากขนาดจริง</h3>
                <p className={`mt-2 text-sm leading-6 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-500'}`}>ระบบจะคำนวณสัดส่วนสินค้าและวัตถุอ้างอิงบน Canvas โดยตรง จึงไม่ให้ AI เดาขนาดใหม่</p>
              </div>
              <button onClick={() => setIsManualScaleOpen(false)} className={`rounded-xl p-2 ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`} aria-label="ปิด"><X className="h-5 w-5" /></button>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <label className="text-xs font-black">รุ่น/ตัวเลือกสินค้า<select value={manualScaleDraft.variantId} onChange={event => { const match = variantGroups.flatMap(group => group.options.map(option => ({ id: option.id, label: `${group.name}: ${option.label}` }))).find(option => option.id === event.target.value); setManualScaleDraft(previous => ({ ...previous, variantId: event.target.value, variantLabel: match?.label || previous.variantLabel })); }} className={`mt-2 w-full rounded-xl border px-3 py-3 text-sm outline-none ${theme === 'dark' ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'}`}><option value="">กำหนดชื่อเอง</option>{variantGroups.flatMap(group => group.options.map(option => <option key={option.id} value={option.id}>{group.name}: {option.label}</option>))}</select></label>
              <label className="text-xs font-black">ชื่อที่แสดงบนภาพ<input value={manualScaleDraft.variantLabel} onChange={event => setManualScaleDraft(previous => ({ ...previous, variantLabel: event.target.value }))} placeholder="เช่น ตะแกรง 30 × 40 ซม." className={`mt-2 w-full rounded-xl border px-3 py-3 text-sm outline-none ${theme === 'dark' ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'}`}/></label>
            </div>

            <div className={`mt-5 rounded-2xl border p-4 ${theme === 'dark' ? 'border-orange-900/70 bg-orange-950/20' : 'border-orange-100 bg-orange-50/60'}`}>
              <h4 className="text-sm font-black text-orange-600">1. มิติสินค้าจริง</h4>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-xs font-bold">กว้าง (ซม.)<input inputMode="decimal" value={manualScaleDraft.widthCm} onChange={event => setManualScaleDraft(previous => ({ ...previous, widthCm: event.target.value }))} placeholder="30" className={`mt-1 w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${theme === 'dark' ? 'border-slate-700 bg-slate-900' : 'border-orange-100 bg-white'}`}/></label>
                <label className="text-xs font-bold">ยาว (ซม.)<input inputMode="decimal" value={manualScaleDraft.lengthCm} onChange={event => setManualScaleDraft(previous => ({ ...previous, lengthCm: event.target.value }))} placeholder="40" className={`mt-1 w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${theme === 'dark' ? 'border-slate-700 bg-slate-900' : 'border-orange-100 bg-white'}`}/></label>
                <label className="text-xs font-bold">ลึก/หนา (ซม.)<input inputMode="decimal" value={manualScaleDraft.depthCm} onChange={event => setManualScaleDraft(previous => ({ ...previous, depthCm: event.target.value }))} placeholder="ไม่จำเป็น" className={`mt-1 w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${theme === 'dark' ? 'border-slate-700 bg-slate-900' : 'border-orange-100 bg-white'}`}/></label>
                <label className="text-xs font-bold">ช่องตะแกรง (มม.)<input inputMode="decimal" value={manualScaleDraft.meshCellMm} onChange={event => setManualScaleDraft(previous => ({ ...previous, meshCellMm: event.target.value }))} placeholder="เช่น 10" className={`mt-1 w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${theme === 'dark' ? 'border-slate-700 bg-slate-900' : 'border-orange-100 bg-white'}`}/></label>
              </div>
              <p className={`mt-3 text-[11px] leading-5 ${theme === 'dark' ? 'text-orange-200/80' : 'text-orange-800/80'}`}>สำหรับตะแกรง: ระบุขนาดช่องเพียงครั้งเดียวได้ แม้แต่ละรุ่นจะมีขนาดภายนอกต่างกัน</p>
            </div>

            <div className={`mt-5 rounded-2xl border p-4 ${theme === 'dark' ? 'border-blue-900/70 bg-blue-950/20' : 'border-blue-100 bg-blue-50/60'}`}>
              <h4 className="text-sm font-black text-blue-600">2. วัตถุอ้างอิงสเกล</h4>
              <label className="mt-3 block text-xs font-bold">เลือก reference<select value={manualScaleDraft.referenceId} onChange={event => setManualScaleDraft(previous => ({ ...previous, referenceId: event.target.value as ScaleReferenceId }))} className={`mt-1 w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${theme === 'dark' ? 'border-slate-700 bg-slate-900' : 'border-blue-100 bg-white'}`}>{SCALE_REFERENCE_PRESETS.map(reference => <option key={reference.id} value={reference.id}>{reference.label}</option>)}</select></label>
              {manualScaleDraft.referenceId === 'custom' && <div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="text-xs font-bold">ชื่อ reference<input value={manualScaleDraft.customReferenceLabel} onChange={event => setManualScaleDraft(previous => ({ ...previous, customReferenceLabel: event.target.value }))} className={`mt-1 w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${theme === 'dark' ? 'border-slate-700 bg-slate-900' : 'border-blue-100 bg-white'}`}/></label><label className="text-xs font-bold">กว้าง (มม.)<input inputMode="decimal" value={manualScaleDraft.customReferenceWidthMm} onChange={event => setManualScaleDraft(previous => ({ ...previous, customReferenceWidthMm: event.target.value }))} className={`mt-1 w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${theme === 'dark' ? 'border-slate-700 bg-slate-900' : 'border-blue-100 bg-white'}`}/></label><label className="text-xs font-bold">สูง (มม.)<input inputMode="decimal" value={manualScaleDraft.customReferenceHeightMm} onChange={event => setManualScaleDraft(previous => ({ ...previous, customReferenceHeightMm: event.target.value }))} className={`mt-1 w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${theme === 'dark' ? 'border-slate-700 bg-slate-900' : 'border-blue-100 bg-white'}`}/></label></div>}
              {manualScaleDraft.referenceId === 'hand' && <p className={`mt-3 text-[11px] ${theme === 'dark' ? 'text-blue-200/80' : 'text-blue-800/80'}`}>มือใช้สำหรับให้ลูกค้าเห็นภาพคร่าว ๆ เท่านั้น — หากต้องการอัตราส่วนที่ตรวจสอบได้ ให้ใช้ iPhone หรือวัตถุที่กำหนดขนาดเอง</p>}
            </div>

            <div className={`mt-5 rounded-xl border px-4 py-3 text-xs leading-5 ${theme === 'dark' ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'}`}><b>ผลลัพธ์:</b> เป็น Technical Size Chart แบบมุมบนที่ล็อก footprint กว้าง×ยาวและ reference ตามมิติที่กรอก ภาพนี้ไม่บิดสินค้าเพื่อให้ดูใหญ่หรือเล็กเกินจริง</div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button onClick={() => setIsManualScaleOpen(false)} className={`rounded-xl px-5 py-3 text-sm font-black ${theme === 'dark' ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-600'}`}>ยกเลิก</button><button onClick={createManualScaleChart} className="flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-orange-500/25 transition hover:bg-orange-600"><Ruler className="h-4 w-4" />สร้าง Size Chart สเกลจริง</button></div>
          </section>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200" onClick={closePreview}>
          <div className="relative h-full w-full max-h-[90vh] max-w-7xl overflow-hidden rounded-3xl" onClick={event => event.stopPropagation()}>
            <div className="absolute left-4 top-4 z-20 flex items-center gap-1 rounded-2xl border border-white/20 bg-slate-950/70 p-1.5 text-white shadow-2xl backdrop-blur-md">
              <button onClick={() => setPreviewScale(value => Math.max(0.5, value - 0.25))} className="rounded-xl p-2 hover:bg-white/15" title="ซูมออก"><ZoomOut className="h-5 w-5" /></button>
              <button onClick={resetPreviewView} className="min-w-16 rounded-xl px-2 py-2 text-xs font-black hover:bg-white/15" title="รีเซ็ตขนาดและตำแหน่ง">{Math.round(previewScale * 100)}%</button>
              <button onClick={() => setPreviewScale(value => Math.min(4, value + 0.25))} className="rounded-xl p-2 hover:bg-white/15" title="ซูมเข้า"><ZoomIn className="h-5 w-5" /></button>
            </div>
            <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/15 bg-slate-950/65 px-4 py-2 text-[10px] font-bold text-white/85 backdrop-blur-md"><Move className="mr-1 inline h-3.5 w-3.5" />หมุนล้อเพื่อซูม · ลากเพื่อเลื่อน · กด 0 เพื่อรีเซ็ต</div>
            <div
              className={`flex h-full w-full touch-none items-center justify-center overflow-hidden ${previewScale > 1 ? isPreviewDragging ? 'cursor-grabbing' : 'cursor-grab' : 'cursor-zoom-in'}`}
              onDoubleClick={resetPreviewView}
              onWheel={event => {
                event.preventDefault();
                setPreviewScale(value => Math.max(0.5, Math.min(4, value - event.deltaY * 0.0015)));
              }}
              onPointerDown={event => {
                if (previewScale <= 1) return;
                previewDragStart.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: previewOffset.x, originY: previewOffset.y };
                setIsPreviewDragging(true);
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={event => {
                const drag = previewDragStart.current;
                if (!drag || drag.pointerId !== event.pointerId) return;
                setPreviewOffset({ x: drag.originX + event.clientX - drag.x, y: drag.originY + event.clientY - drag.y });
              }}
              onPointerUp={event => {
                if (previewDragStart.current?.pointerId !== event.pointerId) return;
                previewDragStart.current = null;
                setIsPreviewDragging(false);
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                previewDragStart.current = null;
                setIsPreviewDragging(false);
              }}
            >
              <img
                src={previewImage}
                alt="Full Preview"
                draggable={false}
                style={{ transform: `translate(${previewOffset.x}px, ${previewOffset.y}px) scale(${previewScale})` }}
                className={`max-h-full max-w-full select-none rounded-2xl object-contain shadow-2xl will-change-transform ${isPreviewDragging ? 'transition-none' : 'transition-transform duration-100'}`}
              />
            </div>
            <button
              onClick={closePreview}
              className="absolute top-4 right-4 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-md transition-all active:scale-95"
              title="ปิด (Esc)"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}
      <ImageEditorModal
        isOpen={editingImageParams !== null}
        imageUrl={editingImageParams?.url || ''}
        onClose={() => setEditingImageParams(null)}
        onSave={handleSaveEditedImage}
        removeBgApiHandler={callRemoveBgApi}
      />
      {pricingCheckoutModal}
    </div>
  );
};

export default App;
