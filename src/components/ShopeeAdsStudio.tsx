import React, { useMemo, useRef } from 'react';
import JSZip from 'jszip';
import { Download, ImagePlus, Loader2, Package, RefreshCw, ShieldCheck, Sparkles, UserRound, X } from 'lucide-react';
import { generateProductImage, type ShopeeAdBrief } from '../apiClient';
import { ImageCategory, type ProductData, type ProductPrice, type ProductVariantGroup } from '../../types';

type AssetKind = 'product' | 'package' | 'logo';
type AdStatus = 'ready' | 'generating' | 'completed' | 'error';
type CampaignStyle = 'thai-premium' | 'clean-editorial' | 'vibrant-shopee' | 'warm-lifestyle' | 'dark-tech';
type HeroCreativeMode = 'human-product-female' | 'human-product-male' | 'human-product-couple' | 'product-dominant' | 'short-hook' | 'price-ready' | 'human-product';
type TextOverlayStyle = '3d-outlined' | 'top-banner' | 'modern-card';
type TextRenderingMode = 'ai-native' | 'app-overlay' | 'clean';

const THAI_FONTS: { id: string; label: string }[] = [
  { id: 'Prompt', label: 'Prompt (นิยมที่สุด E-Commerce)' },
  { id: 'Kanit', label: 'Kanit (ตัวหนา คอนทราสต์สูง)' },
  { id: 'Krub', label: 'Krub (โมเดิร์น โค้งมน มินิมอล)' },
  { id: 'Chakra Petch', label: 'Chakra Petch (สปอร์ต / ไอที)' },
  { id: 'Sarabun', label: 'Sarabun (เรียบหรู น่าเชื่อถือ)' },
  { id: 'Mitr', label: 'Mitr (มน นุ่มนวล เป็นธรรมชาติ)' },
  { id: 'Noto Sans Thai', label: 'Noto Sans Thai (สากล อ่านง่าย)' },
];

const CAMPAIGN_STYLES: { id: CampaignStyle; label: string; description: string; direction: string }[] = [
  { id: 'thai-premium', label: 'Thai Premium', description: 'ส้ม–กรมท่า หรู สะอาด อ่านง่าย', direction: 'Thai premium ecommerce campaign. Use deep navy, warm Shopee orange accents, soft studio lighting, refined matte surfaces, confident but clean information hierarchy.' },
  { id: 'clean-editorial', label: 'Clean Editorial', description: 'ขาวสะอาด มินิมอล เน้นสินค้า', direction: 'Clean editorial product campaign. Use warm white backgrounds, restrained neutral palette, soft daylight, generous whitespace, premium catalogue composition.' },
  { id: 'vibrant-shopee', label: 'Vibrant Shopee', description: 'สดใส ชัดเจน เหมาะกับแคมเปญโปรโมชัน', direction: 'Vibrant Thai marketplace campaign. Use energetic orange-red accents, high clarity, friendly light, bold but tidy visual hierarchy, never cluttered.' },
  { id: 'warm-lifestyle', label: 'Warm Lifestyle', description: 'อบอุ่น เป็นธรรมชาติ เห็นการใช้งาน', direction: 'Warm lifestyle campaign. Use golden natural light, tactile home or everyday settings, approachable Thai lifestyle mood, cohesive warm palette.' },
  { id: 'dark-tech', label: 'Dark Tech', description: 'โมเดิร์น คอนทราสต์สูง สำหรับสินค้าเทค', direction: 'Modern dark technology campaign. Use charcoal or deep navy backgrounds, controlled highlights, precise product edges, premium high-contrast studio lighting.' },
];

const HERO_CREATIVE_MODES: { id: HeroCreativeMode; label: string; description: string; direction: string }[] = [
  {
    id: 'human-product-female',
    label: '👩 แบรนด์แอมบาสเดอร์ ผู้หญิง + สินค้าเด่น (ขายดี ⭐)',
    description: 'พรีเซนเตอร์หญิงไทย/เอเชีย ถือ/แสดงสินค้าลอยเด่นใน foreground ใหญ่ 75–85%',
    direction: 'CRITICAL CAMERA FRAMING & SUBJECT POSING: Shot type MUST be a high-impact Medium Close-Up portrait (chest-up or waist-up). The presenter is an attractive, smiling adult Thai or Asian female brand ambassador with friendly direct eye contact looking straight into the camera lens. The female presenter holds or displays the exact product FORWARD TOWARDS THE CAMERA LENS IN THE FOREGROUND, occupying 75-85% of the center/lower canvas. The product is crystal clear, large, front-and-center, with vibrant commercial studio lighting, soft rim light, and warm background bokeh.'
  },
  {
    id: 'human-product-male',
    label: '👨 แบรนด์แอมบาสเดอร์ ผู้ชาย + สินค้าเด่น',
    description: 'พรีเซนเตอร์ชายไทย/เอเชีย ถือ/แสดงสินค้าลอยเด่นใน foreground ใหญ่ 75–85%',
    direction: 'CRITICAL CAMERA FRAMING & SUBJECT POSING: Shot type MUST be a high-impact Medium Close-Up portrait (chest-up or waist-up). The presenter is a handsome, smiling adult Thai or Asian male brand ambassador with confident direct eye contact looking straight into the camera lens. The male presenter holds or displays the exact product FORWARD TOWARDS THE CAMERA LENS IN THE FOREGROUND, occupying 75-85% of the center/lower canvas. The product is crystal clear, large, front-and-center, with vibrant commercial studio lighting, soft rim light, and warm background bokeh.'
  },
  {
    id: 'human-product-couple',
    label: '👩‍❤️‍👨 แบรนด์แอมบาสเดอร์ คู่ชาย-หญิง + สินค้าเด่น',
    description: 'พรีเซนเตอร์คู่ชายหญิง ถือ/แสดงสินค้าลอยเด่นร่วมกัน',
    direction: 'CRITICAL CAMERA FRAMING & SUBJECT POSING: Medium Close-Up portrait showing a friendly adult Thai/Asian male and female couple together, smiling warm into the camera. They present the exact product forward towards the camera lens in foreground occupying 75-85% of the canvas.'
  },
  {
    id: 'product-dominant',
    label: '📦 สินค้าเด่นที่สุด (ไร้พรีเซนเตอร์)',
    description: 'สินค้าใหญ่ 65–75% · Hook เดียวสั้น ๆ',
    direction: 'Make the exact product the unmistakable hero, occupying approximately 65–75% of the canvas in the foreground. Use a simple premium scene and one clean title zone only.'
  },
  {
    id: 'short-hook',
    label: '🎯 Hook สั้น หยุดสายตา',
    description: 'สินค้าชัด · พื้นที่ Hook 2–5 คำ',
    direction: 'Keep the product large and crisp at approximately 60–70% of the canvas. Design for one compelling Thai hook of only 2–5 words.'
  },
  {
    id: 'price-ready',
    label: '🏷️ พร้อมราคา / โปรโมชัน',
    description: 'สินค้าเด่น · เว้นพื้นที่ราคาเล็ก กระชับ',
    direction: 'Make the exact product occupy approximately 60–70% of the canvas. Reserve one compact clean area for a confirmed price or offer and one very short hook.'
  },
];

export type ThaiAdsCard = ShopeeAdBrief & {
  id: string;
  status: AdStatus;
  visualStyle: CampaignStyle;
  heroCreativeMode?: HeroCreativeMode;
  textRenderingMode?: TextRenderingMode;
  textOverlayStyle?: TextOverlayStyle;
  thaiFont?: string;
  badgeText?: string;
  imageUrl?: string;
  error?: string;
  modelUsed?: string;
  promptUsed?: string;
};

export type ThaiAdsSession = {
  assets: Record<AssetKind, string[]>;
  name: string;
  details: string;
  factsText: string;
  price?: ProductPrice;
  variantGroups?: ProductVariantGroup[];
  count: number;
  heroWithPerson: boolean;
  personBrief: string;
  campaignStyle: CampaignStyle;
  campaignDirection: string;
  cards: ThaiAdsCard[];
  isGenerating: boolean;
  notice: string;
};

export const createThaiAdsSession = (): ThaiAdsSession => ({
  assets: { product: [], package: [], logo: [] },
  name: '',
  details: '',
  factsText: '',
  price: { currency: 'THB' },
  variantGroups: [],
  count: 10,
  heroWithPerson: true,
  personBrief: 'คนไทยหรือเอเชียวัยผู้ใหญ่ พรีเซนเตอร์ยิ้มแย้มถือสินค้าเด่นออกมาด้านหน้าใกล้กล้อง',
  campaignStyle: 'thai-premium',
  campaignDirection: CAMPAIGN_STYLES[0].direction,
  cards: [],
  isGenerating: false,
  notice: '',
});

const BLUEPRINTS: Omit<ThaiAdsCard, 'status' | 'imageUrl' | 'error' | 'visualStyle'>[] = [
  { id: 'hero', role: 'THAI AD COVER HERO', title: 'ภาพปกยิงแอด', objective: 'หยุดสายตาใน 1 วินาที พรีเซนเตอร์เด่นพร้อมสินค้า foreground ใหญ่', facts: [], thaiCopy: [], includePerson: true },
  { id: 'hero-lifestyle', role: 'HERO COVER LIFESTYLE + PRODUCT SHOT', title: 'Hero Shot พร้อมคน', objective: 'สินค้าอยู่ foreground ใหญ่ 80% และมีพรีเซนเตอร์ไทย/เอเชียถือสินค้าเสนอหน้ากล้อง', facts: [], thaiCopy: [], includePerson: true },
  { id: 'anatomy', role: 'PRODUCT ANATOMY & CALLOUT', title: 'จุดเด่นสินค้า', objective: 'อธิบายชิ้นส่วนหรือฟังก์ชันที่ยืนยันแล้ว', facts: [], thaiCopy: [] },
  { id: 'spec', role: 'SPECIFICATION & SIZE', title: 'สเปกและขนาด', objective: 'สื่อสารเฉพาะสเปกที่ผู้ขายยืนยัน', facts: [], thaiCopy: [] },
  { id: 'macro', role: 'MATERIAL & MACRO DETAIL', title: 'วัสดุและรายละเอียด', objective: 'แสดงพื้นผิว งานประกอบ และคุณภาพที่เห็นจริง', facts: [], thaiCopy: [] },
  { id: 'action', role: 'KEY FEATURE IN ACTION', title: 'จุดเด่นขณะใช้งาน', objective: 'สาธิตประโยชน์ในสถานการณ์จริงโดยไม่กล่าวเกินจริง', facts: [], thaiCopy: [] },
  { id: 'solution', role: 'PROBLEM / SOLUTION', title: 'ปัญหาและทางออก', objective: 'แสดงปัญหาที่ผลิตภัณฑ์ช่วยได้ตามข้อมูลจริง', facts: [], thaiCopy: [] },
  { id: 'lifestyle', role: 'THAI LIFESTYLE USE', title: 'การใช้งานจริง', objective: 'ให้ลูกค้าเห็นบริบทใช้งานที่เข้ากับสินค้า', facts: [], thaiCopy: [], includePerson: true },
  { id: 'package', role: 'PACKAGE, WHAT IS INCLUDED & CLOSING VALUE', title: 'ในกล่องมีอะไรบ้าง', objective: 'สรุปแพ็กเกจและสิ่งที่ได้รับตามภาพ/ข้อมูลจริง', facts: [], thaiCopy: [] },
  { id: 'feature', role: 'FEATURE INFOGRAPHIC', title: 'อินโฟกราฟิกจุดขาย', objective: 'วางสินค้าใหญ่ด้านขวาและเว้นพื้นที่ซ้ายสำหรับข้อมูล', facts: [], thaiCopy: [] },
];

const readFiles = async (files: FileList | null): Promise<string[]> => Promise.all(Array.from(files || []).map(file => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = reject;
  reader.readAsDataURL(file);
})));

const cleanName = (value: string) => value.replace(/[\\/:*?"<>|]/g, '_').trim() || 'shopee-ad';
const compactCoverCopy = (value: string, maxLength = 42) => {
  const cleaned = value
    .replace(/\*\*/g, '')
    .replace(/^[-•\d.)\s]+/, '')
    .split(/[.!?\n]/)[0]
    .trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1).trim()}…` : cleaned;
};
const buildCoverCopy = (name: string, details: string, facts: string[]) => {
  const hook = compactCoverCopy(facts[0] || name, 34);
  const support = compactCoverCopy(facts[1] || details || name, 58);
  return support && support !== hook ? [hook, support] : [hook];
};

const categoryForCard = (id: string): ImageCategory => ({
  hero: ImageCategory.COVER,
  anatomy: ImageCategory.INFOGRAPHIC,
  spec: ImageCategory.SIZE_CHART,
  macro: ImageCategory.CLOSE_UP,
  action: ImageCategory.LIFESTYLE_A,
  solution: ImageCategory.INFOGRAPHIC,
  lifestyle: ImageCategory.LIFESTYLE_A,
  package: ImageCategory.INFOGRAPHIC,
  'hero-lifestyle': ImageCategory.LIFESTYLE_B,
  feature: ImageCategory.INFOGRAPHIC,
}[id] || ImageCategory.COVER);

const styleMeta = (id: CampaignStyle) => CAMPAIGN_STYLES.find(style => style.id === id) || CAMPAIGN_STYLES[0];
const isHeroCard = (id: string) => id === 'hero' || id === 'hero-lifestyle';
const heroCreativeMeta = (id?: HeroCreativeMode) => HERO_CREATIVE_MODES.find(mode => mode.id === id || (id === 'human-product' && mode.id === 'human-product-female')) || HERO_CREATIVE_MODES[0];

const buildThaiAdsPrompt = (card: ThaiAdsCard, campaignDirection: string) => {
  const mode = card.textRenderingMode || 'ai-native';

  let textDirective = '';
  if (mode === 'ai-native') {
    textDirective = `TYPOGRAPHY & VISUAL ART: Feel free to design and render high-impact, bold, stylized Thai headlines, 3D text graphics, creative fonts, and promotional badges naturally within the image composition for maximum commercial visual appeal. Thai copy to render: "${card.thaiCopy.join(' | ')}".`;
  } else if (mode === 'clean') {
    textDirective = 'Do not render any text or words inside the image. Pure product studio photography only.';
  } else {
    textDirective = 'Leave a clean editable overlay zone at top or corner for client-side Thai text overlay. Do not render text inside the image.';
  }

  return [
    `Thai Shopee High-Impact Ads role: ${card.role}.`,
    `Objective: ${card.objective}.`,
    `Campaign art direction shared by the entire image set: ${campaignDirection}`,
    `This card's visual treatment: ${styleMeta(card.visualStyle).label}. Keep palette, lighting, camera language, background materials compatible with the campaign direction.`,
    'Use a clean Thai high-information ecommerce layout, with the exact reference product large and unmistakable. Preserve identity, colour, materials, labels, shape, proportions, and included pieces.',
    card.facts.length ? `Confirmed facts only: ${card.facts.join(' | ')}.` : 'Use only visible product details; do not invent specifications.',
    card.includePerson
      ? `CAMERA & POSING INSTRUCTIONS: Medium close-up chest-up shot. Include an attractive adult Thai or Asian brand ambassador (male/female) smiling directly at camera. Presenter holds/presents the exact product PROMINENTLY FORWARD TOWARDS THE CAMERA IN FOREGROUND occupying 75-80% of center canvas. ${card.personBrief || ''}`
      : 'Do not include people unless the role requires them.',
    isHeroCard(card.id) ? `Cover generation mode — ${heroCreativeMeta(card.heroCreativeMode).label}: ${heroCreativeMeta(card.heroCreativeMode).direction}` : '',
    textDirective,
  ].filter(Boolean).join('\n\n');
};

/** Render High-Converting Thai E-Commerce Typography & Badges onto Canvas */
async function imageWithCopy(
  url: string,
  copy: string[],
  isCover = false,
  overlayStyle: TextOverlayStyle = '3d-outlined',
  badgeText?: string,
  fontFamily = 'Prompt',
  textRenderingMode: TextRenderingMode = 'ai-native'
) {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = url;
  await image.decode();

  if (textRenderingMode === 'ai-native' || textRenderingMode === 'clean') {
    const response = await fetch(url);
    return await response.blob();
  }

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0);

  const lines = copy.filter(Boolean).slice(0, isCover ? 2 : 4);
  const w = canvas.width;
  const h = canvas.height;

  if (lines.length) {
    const pad = Math.max(30, w * 0.045);
    const headlineSize = Math.max(32, w * (isCover ? 0.065 : 0.052));
    const supportSize = Math.max(20, w * 0.034);

    if (overlayStyle === 'top-banner') {
      const bannerHeight = headlineSize * lines.length * 1.3 + pad * 1.5;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.fillRect(0, 0, w, bannerHeight);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `800 ${headlineSize}px "${fontFamily}", "Prompt", "Kanit", Tahoma, sans-serif`;

      lines.forEach((line, i) => {
        const y = pad * 1.2 + i * (headlineSize * 1.25) + headlineSize / 2;
        ctx.fillText(line, w / 2, y);
      });
    } else if (overlayStyle === '3d-outlined') {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const startX = pad * 1.2;
      let startY = pad * 1.2;

      const grad = ctx.createLinearGradient(0, 0, 0, h * 0.35);
      grad.addColorStop(0, 'rgba(0,0,0,0.65)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h * 0.35);

      lines.forEach((line, index) => {
        const fontSize = index === 0 ? headlineSize : supportSize;
        ctx.font = `${index === 0 ? '900' : '700'} ${fontSize}px "${fontFamily}", "Prompt", "Kanit", Tahoma, sans-serif`;

        ctx.strokeStyle = '#180d04';
        ctx.lineWidth = Math.max(6, fontSize * 0.16);
        ctx.lineJoin = 'round';

        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 14;
        ctx.shadowOffsetX = 3;
        ctx.shadowOffsetY = 4;

        ctx.strokeText(line, startX, startY);

        ctx.shadowColor = 'transparent';
        ctx.fillStyle = index === 0 ? '#FFFFFF' : '#FFDD00';
        ctx.fillText(line, startX, startY);

        startY += fontSize * 1.22;
      });
    } else {
      const textHeight = isCover && lines.length > 1
        ? headlineSize * 1.18 + supportSize * 1.35
        : headlineSize * lines.length * 1.12;
      const height = textHeight + pad * 1.8;

      ctx.fillStyle = 'rgba(11, 22, 38, 0.86)';
      ctx.beginPath();
      ctx.roundRect(pad, pad, w - pad * 2, height, headlineSize * 0.3);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.font = `800 ${headlineSize}px "${fontFamily}", "Prompt", "Kanit", Tahoma, sans-serif`;
      ctx.fillText(lines[0], pad * 1.6, pad * 1.5);

      if (lines[1]) {
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.font = `600 ${supportSize}px "${fontFamily}", "Prompt", "Kanit", Tahoma, sans-serif`;
        ctx.fillText(lines[1], pad * 1.6, pad * 1.5 + headlineSize * 1.2);
      }
    }
  }

  const defaultBadge = badgeText || (isCover ? 'เกรดพรีเมียม' : undefined);
  if (defaultBadge) {
    const badgeFontSize = Math.max(16, w * 0.028);
    ctx.font = `800 ${badgeFontSize}px "${fontFamily}", "Prompt", "Kanit", sans-serif`;
    const textWidth = ctx.measureText(defaultBadge).width;
    const badgePaddingX = badgeFontSize * 0.9;
    const badgePaddingY = badgeFontSize * 0.45;
    const badgeWidth = textWidth + badgePaddingX * 2;
    const badgeHeight = badgeFontSize + badgePaddingY * 2;

    const badgeX = w - pad - badgeWidth;
    const badgeY = h - pad - badgeHeight;

    const bGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX, badgeY + badgeHeight);
    bGrad.addColorStop(0, '#DC2626');
    bGrad.addColorStop(1, '#991B1B');

    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;

    ctx.fillStyle = bGrad;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, badgeHeight / 2);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(defaultBadge, badgeX + badgeWidth / 2, badgeY + badgeHeight / 2);
  }

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Export failed'))), 'image/png')
  );
}

export function ShopeeAdsStudio({ dark, imageModel, session, setSession }: {
  dark: boolean;
  imageModel: string;
  session: ThaiAdsSession;
  setSession: React.Dispatch<React.SetStateAction<ThaiAdsSession>>;
}) {
  const { assets, name, details, factsText, price, variantGroups = [], count, heroWithPerson, personBrief, campaignStyle, campaignDirection, cards, isGenerating, notice } = session;
  const fileRefs = { product: useRef<HTMLInputElement>(null), package: useRef<HTMLInputElement>(null), logo: useRef<HTMLInputElement>(null) };
  const allImages = useMemo(() => [...assets.product, ...assets.package, ...assets.logo], [assets]);
  const confirmedFacts = useMemo(() => factsText.split('\n').map(x => x.trim()).filter(Boolean), [factsText]);
  const commerceFacts = useMemo(() => {
    const output: string[] = [];
    if (price?.display) output.push(`ราคาขายที่ยืนยัน: ${price.display}`);
    else if (typeof price?.current === 'number') output.push(`ราคาขายที่ยืนยัน: ${new Intl.NumberFormat('th-TH', { style: 'currency', currency: price.currency || 'THB' }).format(price.current)}`);
    variantGroups.forEach(group => {
      const options = group.options.map(option => option.label).filter(Boolean);
      if (options.length) output.push(`${group.name}: ${options.join(', ')}`);
    });
    return output;
  }, [price, variantGroups]);
  const allFacts = useMemo(() => [...confirmedFacts, ...commerceFacts], [confirmedFacts, commerceFacts]);
  const classCard = dark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900';
  const modelLabel = imageModel === 'gemini-3.1-flash-image' ? 'Gemini 3.1 Flash Image' : imageModel;

  const addAssets = async (kind: AssetKind, files: FileList | null) => {
    const data = await readFiles(files);
    setSession(prev => ({ ...prev, assets: { ...prev.assets, [kind]: [...prev.assets[kind], ...data] } }));
  };
  const createCards = () => BLUEPRINTS.slice(0, count).map(base => ({
    ...base,
    status: 'ready' as AdStatus,
    visualStyle: campaignStyle,
    textRenderingMode: 'ai-native' as TextRenderingMode,
    textOverlayStyle: '3d-outlined' as TextOverlayStyle,
    thaiFont: 'Prompt',
    badgeText: base.id === 'hero' || base.id === 'hero-lifestyle' ? 'เกรดพรีเมียม' : undefined,
    facts: allFacts,
    thaiCopy: isHeroCard(base.id) ? buildCoverCopy(name, details, confirmedFacts) : [base.title, ...allFacts.slice(0, 3)],
    includePerson: base.id === 'hero' || base.id === 'hero-lifestyle' ? heroWithPerson : base.includePerson,
    personBrief,
    heroCreativeMode: isHeroCard(base.id) ? 'human-product-female' as HeroCreativeMode : undefined,
  }));
  const updateCard = (id: string, patch: Partial<ThaiAdsCard>) => setSession(prev => ({ ...prev, cards: prev.cards.map(card => card.id === id ? { ...card, ...patch } : card) }));
  const productForGeneration = (): ProductData => ({ name, description: details, features: allFacts, images: allImages, price, variantGroups });

  const generate = async () => {
    if (!allImages.length) return setSession(prev => ({ ...prev, notice: 'เพิ่มภาพสินค้าหลักอย่างน้อย 1 ภาพก่อนเริ่มสร้าง' }));
    if (!name.trim()) return setSession(prev => ({ ...prev, notice: 'ใส่ชื่อสินค้าก่อนเริ่มสร้าง' }));
    const work = createCards();
    setSession(prev => ({ ...prev, cards: work, notice: 'AI วางแผนมุมกล้องและพรีเซนเตอร์แล้ว กำลังเริ่มคิวสร้าง…', isGenerating: true }));
    const product = productForGeneration();
    for (const card of work) {
      updateCard(card.id, { status: 'generating', error: undefined });
      try {
        const result = await generateProductImage(categoryForCard(card.id), product, 'shopee', buildThaiAdsPrompt(card, campaignDirection), imageModel, '1:1');
        updateCard(card.id, { status: 'completed', imageUrl: result.imageUrl, thaiCopy: card.thaiCopy.length ? card.thaiCopy : result.thaiTexts, modelUsed: result.modelUsed, promptUsed: result.promptUsed });
      } catch (error) {
        updateCard(card.id, { status: 'error', error: error instanceof Error ? error.message : 'สร้างภาพไม่สำเร็จ' });
      }
    }
    setSession(prev => ({ ...prev, isGenerating: false, notice: 'สร้างภาพครบคิวแล้ว คุณเลือกสลับโหมดข้อความ AI / แอป / ภาพคลีน ได้รายภาพ' }));
  };
  const regenerate = async (card: ThaiAdsCard) => {
    if (!allImages.length) return;
    updateCard(card.id, { status: 'generating', error: undefined });
    try {
      const result = await generateProductImage(categoryForCard(card.id), productForGeneration(), 'shopee', buildThaiAdsPrompt(card, campaignDirection), imageModel, '1:1');
      updateCard(card.id, { status: 'completed', imageUrl: result.imageUrl, thaiCopy: card.thaiCopy.length ? card.thaiCopy : result.thaiTexts, modelUsed: result.modelUsed, promptUsed: result.promptUsed });
    } catch (error) {
      updateCard(card.id, { status: 'error', error: error instanceof Error ? error.message : 'สร้างภาพไม่สำเร็จ' });
    }
  };
  const download = async (card: ThaiAdsCard) => {
    if (!card.imageUrl) return;
    const blob = await imageWithCopy(
      card.imageUrl,
      card.thaiCopy,
      isHeroCard(card.id),
      card.textOverlayStyle || '3d-outlined',
      card.badgeText,
      card.thaiFont || 'Prompt',
      card.textRenderingMode || 'ai-native'
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${cleanName(name)}-${card.id}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const downloadZip = async () => {
    const complete = cards.filter(card => card.imageUrl);
    if (!complete.length) return;
    setSession(prev => ({ ...prev, notice: 'กำลังเตรียม ZIP…' }));
    const zip = new JSZip();
    for (const card of complete) {
      zip.file(
        `${cleanName(name)}-${card.id}.png`,
        await imageWithCopy(
          card.imageUrl!,
          card.thaiCopy,
          isHeroCard(card.id),
          card.textOverlayStyle || '3d-outlined',
          card.badgeText,
          card.thaiFont || 'Prompt',
          card.textRenderingMode || 'ai-native'
        )
      );
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${cleanName(name)}-shopee-ads.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
    setSession(prev => ({ ...prev, notice: 'ดาวน์โหลด ZIP เรียบร้อย' }));
  };

  return <section className="max-w-7xl mx-auto space-y-6">
    <div className="rounded-3xl bg-gradient-to-br from-orange-500 via-orange-600 to-rose-600 p-7 text-white shadow-xl">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><div className="flex items-center gap-2 text-orange-100 text-sm font-bold"><Sparkles size={16}/> AI CREATIVE STUDIO</div><h2 className="mt-2 text-3xl font-black">Shopee Thai Ads Generator</h2><p className="mt-2 max-w-2xl text-orange-50">สร้างชุดภาพโฆษณายิงแอดแบบพรีเซนเตอร์เด่น สินค้าชิ้นใหญ่ เลือกแบรนด์แอมบาสเดอร์หญิง/ชาย และโหมดตัวอักษรได้ตามใจชอบ</p></div><div className="rounded-2xl bg-white/15 px-4 py-3 text-sm"><ShieldCheck className="inline mr-2" size={18}/>Brand Ambassador · AI Native Typography · ZIP export</div></div>
    </div>

    <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
      <div className={`rounded-3xl border p-6 shadow-sm ${classCard}`}>
        <h3 className="font-black text-xl">1. ข้อมูลและภาพอ้างอิง</h3><p className="mt-1 text-sm text-slate-500">ระบบจะไม่เดาสเปก ราคา หรือตัวเลือกที่คุณไม่ได้ยืนยัน</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">{(['product', 'package', 'logo'] as AssetKind[]).map(kind => <div key={kind} className="rounded-2xl border border-dashed border-orange-300 bg-orange-50/60 p-4 text-center dark:bg-orange-950/20"><input ref={fileRefs[kind]} className="hidden" type="file" accept="image/*" multiple onChange={e => addAssets(kind, e.target.files)}/><ImagePlus className="mx-auto text-orange-500"/><p className="mt-2 text-sm font-bold">{kind === 'product' ? 'ภาพสินค้า *' : kind === 'package' ? 'กล่อง / อุปกรณ์' : 'โลโก้ร้าน'}</p><button onClick={() => fileRefs[kind].current?.click()} className="mt-3 text-xs font-bold text-orange-600">เพิ่มรูป ({assets[kind].length})</button></div>)}</div>
        {allImages.length > 0 && <div className="mt-4 flex gap-2 overflow-x-auto">{allImages.map(src => <div key={src} className="relative shrink-0"><img src={src} className="h-16 w-16 rounded-xl object-cover"/><button onClick={() => setSession(prev => ({ ...prev, assets: { product: prev.assets.product.filter(x => x !== src), package: prev.assets.package.filter(x => x !== src), logo: prev.assets.logo.filter(x => x !== src) } }))} className="absolute -right-1 -top-1 rounded-full bg-slate-900 p-1 text-white"><X size={11}/></button></div>)}</div>}
        <div className="mt-5 grid gap-4"><label className="text-sm font-bold">ชื่อสินค้า<input value={name} onChange={e => setSession(prev => ({ ...prev, name: e.target.value }))} placeholder="เช่น ไม้แขวนเสื้อเด็ก ยกลัง 144 ชิ้น" className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 outline-none focus:border-orange-500"/></label><label className="text-sm font-bold">รายละเอียดสินค้า<textarea value={details} onChange={e => setSession(prev => ({ ...prev, details: e.target.value }))} rows={3} placeholder="บอกวัสดุ กลุ่มลูกค้า การใช้งาน หรือบริบทที่ต้องการ" className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 outline-none focus:border-orange-500"/></label><label className="text-sm font-bold">ข้อเท็จจริงที่ยืนยันแล้ว <span className="font-normal text-slate-500">(หนึ่งข้อ/บรรทัด)</span><textarea value={factsText} onChange={e => setSession(prev => ({ ...prev, factsText: e.target.value }))} rows={5} placeholder={'เช่น พลาสติกเกรด A\nบรรจุ 144 ชิ้น\nสีสันสดใส ทนทานไม่หักง่าย'} className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 outline-none focus:border-orange-500"/></label></div>
        {commerceFacts.length > 0 && <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"><b>ข้อมูลการขายที่รับมาจาก Analyze</b><div className="mt-1 space-y-1">{commerceFacts.map(fact => <p key={fact}>• {fact}</p>)}</div></div>}
      </div>

      <div className={`rounded-3xl border p-6 shadow-sm ${classCard}`}><h3 className="font-black text-xl">2. AI วางแผนชุดภาพ</h3><div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">โมเดลที่เลือกสำหรับคิวนี้: {modelLabel}</div><div className="mt-5"><p className="text-sm font-bold">จำนวนภาพ</p><div className="mt-2 flex flex-wrap gap-2">{[4, 6, 8, 10].map(value => <button key={value} onClick={() => setSession(prev => ({ ...prev, count: value }))} className={`rounded-xl px-4 py-2 text-sm font-bold ${count === value ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200'}`}>{value} ภาพ</button>)}</div></div><div className="mt-5"><label className="text-sm font-bold">โทนหลักของทั้งชุด<select value={campaignStyle} onChange={e => { const style = e.target.value as CampaignStyle; setSession(prev => ({ ...prev, campaignStyle: style, campaignDirection: styleMeta(style).direction })); }} className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-orange-500">{CAMPAIGN_STYLES.map(style => <option key={style.id} value={style.id} className="text-slate-900">{style.label} — {style.description}</option>)}</select></label><label className="mt-3 block text-sm font-bold">คำสั่งคุมโทนร่วมกัน<textarea value={campaignDirection} onChange={e => setSession(prev => ({ ...prev, campaignDirection: e.target.value }))} rows={4} className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 text-xs outline-none focus:border-orange-500"/></label><p className="mt-2 text-xs text-slate-500">AI จะใส่คำสั่งนี้ในทุกภาพ เพื่อคุมสี แสง วัสดุพื้นหลัง และภาษาองค์ประกอบให้เป็นแคมเปญเดียวกัน</p></div><div className="mt-5 rounded-2xl border border-orange-200 bg-orange-50 p-4 dark:bg-orange-950/20"><label className="flex cursor-pointer items-center gap-3"><input type="checkbox" checked={heroWithPerson} onChange={e => setSession(prev => ({ ...prev, heroWithPerson: e.target.checked }))} className="h-4 w-4 accent-orange-500"/><span className="font-bold"><UserRound className="mr-1 inline" size={17}/>ภาพปกมีพรีเซนเตอร์ถือ/แสดงสินค้า (Brand Ambassador Shot)</span></label>{heroWithPerson && <input value={personBrief} onChange={e => setSession(prev => ({ ...prev, personBrief: e.target.value }))} placeholder="ระบุพรีเซนเตอร์ เช่น พรีเซนเตอร์หญิงไทย/เอเชีย ยิ้มแย้มถือสินค้าเสนอหน้ากล้อง" className="mt-3 w-full rounded-xl border border-orange-200 bg-white px-3 py-2 text-sm text-slate-800"/>}</div><div className="mt-6 space-y-2">{BLUEPRINTS.slice(0, count).map((item, index) => <div key={item.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800"><span className="w-6 text-xs font-black text-orange-500">{String(index + 1).padStart(2, '0')}</span><span className="text-sm font-semibold">{item.title}</span>{item.includePerson && <UserRound className="ml-auto text-orange-500" size={16}/>}</div>)}</div><button disabled={isGenerating} onClick={generate} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 px-5 py-3.5 font-black text-white shadow-lg shadow-orange-500/25 disabled:opacity-50">{isGenerating ? <Loader2 className="animate-spin"/> : <Sparkles/>}{isGenerating ? 'กำลังสร้างภาพตามคิว…' : `วางแผนและสร้าง ${count} ภาพ`}</button>{notice && <p className="mt-3 text-center text-sm text-slate-500">{notice}</p>}</div>
    </div>

    {cards.length > 0 && <div className={`rounded-3xl border p-6 shadow-sm ${classCard}`}><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black text-xl">3. ผลลัพธ์และข้อความไทย</h3><p className="text-sm text-slate-500">เลือกแนวภาพปก แบรนด์แอมบาสเดอร์หญิง/ชาย ฟอนต์ไทย และสไตล์ภาพได้รายการ์ด</p></div><button onClick={downloadZip} disabled={!cards.some(c => c.imageUrl)} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"><Package size={17}/>ดาวน์โหลด ZIP</button></div><div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{cards.map((card, index) => <article key={card.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"><div className="relative aspect-square bg-slate-200 dark:bg-slate-700 overflow-hidden">{card.imageUrl ? <> <img src={card.imageUrl} className={`h-full w-full object-cover transition-all ${card.status === 'generating' ? 'opacity-30 blur-[2px]' : ''}`}/> {card.status === 'generating' && <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-slate-900/60 text-white backdrop-blur-sm"><Loader2 className="animate-spin text-orange-500" size={38}/><span className="text-xs font-black tracking-wide text-orange-200 animate-pulse">กำลังสร้างภาพใหม่…</span></div>} </> : <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">{card.status === 'generating' ? <Loader2 className="animate-spin text-orange-500" size={38}/> : <ImagePlus size={30}/>}<span className="text-sm font-bold">{card.status === 'error' ? card.error : card.status === 'generating' ? 'กำลังสร้าง…' : 'รอคิว'}</span></div>}</div><div className="p-4"><div className="flex items-center justify-between"><span className="text-xs font-black text-orange-500">{String(index + 1).padStart(2, '0')}</span><span className="text-sm font-bold">{card.title}</span></div><p title={card.modelUsed || modelLabel} className="mt-2 truncate rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">{card.status === 'generating' ? `กำลังใช้: ${modelLabel}` : `ใช้จริง: ${card.modelUsed || 'รอสร้างภาพ'}`}</p><label className="mt-3 block text-xs font-bold text-orange-700">⚙️ โหมดการสร้างตัวอักษร/ฟอนต์<select value={card.textRenderingMode || 'ai-native'} onChange={e => updateCard(card.id, { textRenderingMode: e.target.value as TextRenderingMode })} className="mt-1 w-full rounded-xl border border-orange-200 bg-orange-50 p-2 text-xs font-bold text-slate-800 outline-none focus:border-orange-500"><option value="ai-native">🤖 AI Native Typography (ให้อิสระ AI วาดฟอนต์/กราฟิก)</option><option value="app-overlay">🎨 App Overlay (ใส่อักษร 3D/Banner ด้วยแอป)</option><option value="clean">🖼️ Clean Image (ภาพคลีน ไร้ตัวอักษร)</option></select></label>{isHeroCard(card.id) && <label className="mt-3 block text-xs font-bold text-orange-700">🖼️ แนวภาพปก & แบรนด์แอมบาสเดอร์<select value={card.heroCreativeMode || 'human-product-female'} onChange={e => updateCard(card.id, { heroCreativeMode: e.target.value as HeroCreativeMode })} className="mt-1 w-full rounded-xl border border-orange-200 bg-orange-50 p-2 text-xs font-bold text-slate-800 outline-none focus:border-orange-500">{HERO_CREATIVE_MODES.map(mode => <option key={mode.id} value={mode.id}>{mode.label}</option>)}</select></label>}<div className="mt-3 space-y-3">{card.textRenderingMode === 'app-overlay' && <label className="block text-xs font-bold text-orange-700">🔤 ฟอนต์ข้อความไทย<select value={card.thaiFont || 'Prompt'} onChange={e => updateCard(card.id, { thaiFont: e.target.value })} className="mt-1 w-full rounded-xl border border-orange-200 bg-white p-2 text-xs font-bold text-slate-800 outline-none focus:border-orange-500">{THAI_FONTS.map(font => <option key={font.id} value={font.id}>{font.label}</option>)}</select></label>}<div className="grid grid-cols-2 gap-2"><label className="block text-xs font-bold">สไตล์ภาพ<select value={card.visualStyle} onChange={e => updateCard(card.id, { visualStyle: e.target.value as CampaignStyle })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-800 outline-none focus:border-orange-500">{CAMPAIGN_STYLES.map(style => <option key={style.id} value={style.id}>{style.label}</option>)}</select></label>{card.textRenderingMode === 'app-overlay' && <label className="block text-xs font-bold">รูปแบบเลย์เอาต์<select value={card.textOverlayStyle || '3d-outlined'} onChange={e => updateCard(card.id, { textOverlayStyle: e.target.value as TextOverlayStyle })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-800 outline-none focus:border-orange-500"><option value="3d-outlined">🌟 ตัวหนา 3D Outline</option><option value="top-banner">⬛ แถบแบนเนอร์ชิดบน</option><option value="modern-card">📦 การ์ดเรียบหรู</option></select></label>}</div>{card.textRenderingMode === 'app-overlay' && <label className="block text-xs font-bold">ข้อความป้าย Badge<input value={card.badgeText || ''} onChange={e => updateCard(card.id, { badgeText: e.target.value })} placeholder="เช่น พลาสติกเกรด A" className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-800 outline-none focus:border-orange-500"/></label>}</div><textarea value={card.thaiCopy.join('\n')} onChange={e => updateCard(card.id, { thaiCopy: e.target.value.split('\n').filter(Boolean) })} placeholder={isHeroCard(card.id) ? "บรรทัด 1: Hook หลัก · บรรทัด 2: ข้อความประกอบเล็ก" : "ข้อความไทยที่ต้องการวางบนภาพ"} rows={isHeroCard(card.id) ? 2 : 3} className="mt-3 w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-800 outline-none focus:border-orange-500"/><div className="mt-3 flex gap-2"><button onClick={() => regenerate(card)} disabled={card.status === 'generating'} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-orange-200 py-2 text-xs font-bold text-orange-600 disabled:opacity-40 hover:bg-orange-50 transition-colors">{card.status === 'generating' ? <Loader2 className="animate-spin text-orange-500" size={14}/> : <RefreshCw size={14}/>}{card.status === 'generating' ? 'กำลังสร้าง…' : 'สร้างใหม่'}</button><button onClick={() => download(card)} disabled={!card.imageUrl || card.status === 'generating'} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-orange-500 py-2 text-xs font-bold text-white disabled:opacity-40"><Download size={14}/>PNG</button></div></div></article>)}</div></div>}
  </section>;
}
