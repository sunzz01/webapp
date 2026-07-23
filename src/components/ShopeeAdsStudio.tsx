import React, { useMemo, useRef } from 'react';
import JSZip from 'jszip';
import { Download, ImagePlus, Loader2, Package, RefreshCw, ShieldCheck, Sparkles, UserRound, X } from 'lucide-react';
import { generateProductImage, type ShopeeAdBrief } from '../apiClient';
import { ImageCategory, type ProductData, type ProductPrice, type ProductVariantGroup } from '../../types';

type AssetKind = 'product' | 'package' | 'logo';
type AdStatus = 'ready' | 'generating' | 'completed' | 'error';
type CampaignStyle = 'thai-premium' | 'clean-editorial' | 'vibrant-shopee' | 'warm-lifestyle' | 'dark-tech';

const CAMPAIGN_STYLES: { id: CampaignStyle; label: string; description: string; direction: string }[] = [
  { id: 'thai-premium', label: 'Thai Premium', description: 'ส้ม–กรมท่า หรู สะอาด อ่านง่าย', direction: 'Thai premium ecommerce campaign. Use deep navy, warm Shopee orange accents, soft studio lighting, refined matte surfaces, confident but clean information hierarchy.' },
  { id: 'clean-editorial', label: 'Clean Editorial', description: 'ขาวสะอาด มินิมอล เน้นสินค้า', direction: 'Clean editorial product campaign. Use warm white backgrounds, restrained neutral palette, soft daylight, generous whitespace, premium catalogue composition.' },
  { id: 'vibrant-shopee', label: 'Vibrant Shopee', description: 'สดใส ชัดเจน เหมาะกับแคมเปญโปรโมชัน', direction: 'Vibrant Thai marketplace campaign. Use energetic orange-red accents, high clarity, friendly light, bold but tidy visual hierarchy, never cluttered.' },
  { id: 'warm-lifestyle', label: 'Warm Lifestyle', description: 'อบอุ่น เป็นธรรมชาติ เห็นการใช้งาน', direction: 'Warm lifestyle campaign. Use golden natural light, tactile home or everyday settings, approachable Thai lifestyle mood, cohesive warm palette.' },
  { id: 'dark-tech', label: 'Dark Tech', description: 'โมเดิร์น คอนทราสต์สูง สำหรับสินค้าเทค', direction: 'Modern dark technology campaign. Use charcoal or deep navy backgrounds, controlled highlights, precise product edges, premium high-contrast studio lighting.' },
];

export type ThaiAdsCard = ShopeeAdBrief & {
  id: string;
  status: AdStatus;
  visualStyle: CampaignStyle;
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
  personBrief: 'คนไทยหรือเอเชียวัยผู้ใหญ่ ใช้งานสินค้าอย่างเป็นธรรมชาติ',
  campaignStyle: 'thai-premium',
  campaignDirection: CAMPAIGN_STYLES[0].direction,
  cards: [],
  isGenerating: false,
  notice: '',
});

const BLUEPRINTS: Omit<ThaiAdsCard, 'status' | 'imageUrl' | 'error' | 'visualStyle'>[] = [
  { id: 'hero', role: 'THAI AD COVER HERO', title: 'ภาพปกยิงแอด', objective: 'หยุดสายตาใน 1 วินาที สินค้าเด่นที่สุด', facts: [], thaiCopy: [], includePerson: false },
  { id: 'anatomy', role: 'PRODUCT ANATOMY & CALLOUT', title: 'จุดเด่นสินค้า', objective: 'อธิบายชิ้นส่วนหรือฟังก์ชันที่ยืนยันแล้ว', facts: [], thaiCopy: [] },
  { id: 'spec', role: 'SPECIFICATION & SIZE', title: 'สเปกและขนาด', objective: 'สื่อสารเฉพาะสเปกที่ผู้ขายยืนยัน', facts: [], thaiCopy: [] },
  { id: 'macro', role: 'MATERIAL & MACRO DETAIL', title: 'วัสดุและรายละเอียด', objective: 'แสดงพื้นผิว งานประกอบ และคุณภาพที่เห็นจริง', facts: [], thaiCopy: [] },
  { id: 'action', role: 'KEY FEATURE IN ACTION', title: 'จุดเด่นขณะใช้งาน', objective: 'สาธิตประโยชน์ในสถานการณ์จริงโดยไม่กล่าวเกินจริง', facts: [], thaiCopy: [] },
  { id: 'solution', role: 'PROBLEM / SOLUTION', title: 'ปัญหาและทางออก', objective: 'แสดงปัญหาที่ผลิตภัณฑ์ช่วยได้ตามข้อมูลจริง', facts: [], thaiCopy: [] },
  { id: 'lifestyle', role: 'THAI LIFESTYLE USE', title: 'การใช้งานจริง', objective: 'ให้ลูกค้าเห็นบริบทใช้งานที่เข้ากับสินค้า', facts: [], thaiCopy: [], includePerson: true },
  { id: 'package', role: 'PACKAGE, WHAT IS INCLUDED & CLOSING VALUE', title: 'ในกล่องมีอะไรบ้าง', objective: 'สรุปแพ็กเกจและสิ่งที่ได้รับตามภาพ/ข้อมูลจริง', facts: [], thaiCopy: [] },
  { id: 'hero-lifestyle', role: 'HERO COVER LIFESTYLE + PRODUCT SHOT', title: 'Hero Shot พร้อมคน', objective: 'สินค้าอยู่ foreground ใหญ่และมีคนไทยหรือเอเชียใช้งานอย่างเป็นธรรมชาติ', facts: [], thaiCopy: [], includePerson: true },
  { id: 'feature', role: 'FEATURE INFOGRAPHIC', title: 'อินโฟกราฟิกจุดขาย', objective: 'วางสินค้าใหญ่ด้านขวาและเว้นพื้นที่ซ้ายสำหรับข้อมูล', facts: [], thaiCopy: [] },
  { id: 'comparison', role: 'VARIANT OR USE-CASE COMPARISON', title: 'เปรียบเทียบตัวเลือก', objective: 'เปรียบเทียบเฉพาะรุ่น ตัวเลือก หรือการใช้งานที่ยืนยันแล้ว', facts: [], thaiCopy: [] },
  { id: 'closing', role: 'CLOSING VALUE & CALL TO ACTION', title: 'สรุปความคุ้มค่า', objective: 'ปิดท้ายแคมเปญด้วยสินค้าและคุณค่าที่อ้างอิงจากข้อมูลจริง', facts: [], thaiCopy: [] },
];

const readFiles = async (files: FileList | null): Promise<string[]> => Promise.all(Array.from(files || []).map(file => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = reject;
  reader.readAsDataURL(file);
})));

const cleanName = (value: string) => value.replace(/[\\/:*?"<>|]/g, '_').trim() || 'shopee-ad';

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

const buildThaiAdsPrompt = (card: ThaiAdsCard, campaignDirection: string) => [
  `Thai Shopee Detail-Rich Ads role: ${card.role}.`,
  `Objective: ${card.objective}.`,
  `Campaign art direction shared by the entire image set: ${campaignDirection}`,
  `This card's visual treatment: ${styleMeta(card.visualStyle).label}. Keep palette, lighting, camera language, background materials, and overlay-zone treatment compatible with the campaign direction so the full set feels like one campaign.`,
  'Use a clean Thai high-information ecommerce layout, with the exact reference product large and unmistakable. Preserve identity, colour, materials, labels, shape, proportions, and included pieces.',
  card.facts.length ? `Confirmed facts only: ${card.facts.join(' | ')}.` : 'Use only visible product details; do not invent specifications.',
  card.includePerson ? `Include an adult Thai or Asian person naturally using the exact product. ${card.personBrief || ''}` : 'Do not include people unless the role requires them.',
  'Leave a clean editable overlay zone for confirmed Thai price, model, variant and copy. Never invent, alter, discount, or approximate a price, variant, measurement, review, certification badge, accessory, or claim.',
].filter(Boolean).join('\n\n');

async function imageWithCopy(url: string, copy: string[]) {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = url;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0);
  const lines = copy.filter(Boolean).slice(0, 4);
  if (lines.length) {
    const pad = Math.max(28, canvas.width * .045);
    const fontSize = Math.max(24, canvas.width * .052);
    const height = fontSize * (lines.length + .95) + pad * 1.5;
    ctx.fillStyle = 'rgba(11, 22, 38, .84)';
    ctx.roundRect(pad, pad, canvas.width - pad * 2, height, fontSize * .32);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${fontSize}px "Noto Sans Thai", Tahoma, sans-serif`;
    ctx.textBaseline = 'top';
    lines.forEach((line, index) => ctx.fillText(line, pad * 1.7, pad * 1.55 + index * fontSize * 1.12));
  }
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Export failed')), 'image/png'));
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
  const createCards = () => BLUEPRINTS.map(base => ({
    ...base,
    status: 'ready' as AdStatus,
    visualStyle: campaignStyle,
    facts: allFacts,
    thaiCopy: base.id === 'hero' ? [name, ...allFacts.slice(0, 2)] : [base.title, ...allFacts.slice(0, 3)],
    includePerson: base.id === 'hero' ? heroWithPerson : base.includePerson,
    personBrief,
  }));
  const updateCard = (id: string, patch: Partial<ThaiAdsCard>) => setSession(prev => ({ ...prev, cards: prev.cards.map(card => card.id === id ? { ...card, ...patch } : card) }));
  const productForGeneration = (): ProductData => ({ name, description: details, features: allFacts, images: allImages, price, variantGroups });

  const generate = async () => {
    if (!allImages.length) return setSession(prev => ({ ...prev, notice: 'เพิ่มภาพสินค้าหลักอย่างน้อย 1 ภาพก่อนสร้าง' }));
    if (!name.trim()) return setSession(prev => ({ ...prev, notice: 'ใส่ชื่อสินค้าก่อนเริ่มสร้าง' }));
    const work = createCards();
    const initialCards = work.slice(0, count);
    setSession(prev => ({ ...prev, cards: work, notice: `AI วางแผนการ์ดครบ ${BLUEPRINTS.length} ช่องแล้ว กำลังเริ่มสร้าง ${count} ภาพแรก…`, isGenerating: true }));
    const product = productForGeneration();
    for (const card of initialCards) {
      updateCard(card.id, { status: 'generating', error: undefined });
      try {
        const result = await generateProductImage(categoryForCard(card.id), product, 'shopee', buildThaiAdsPrompt(card, campaignDirection), imageModel, '1:1');
        updateCard(card.id, { status: 'completed', imageUrl: result.imageUrl, thaiCopy: card.thaiCopy.length ? card.thaiCopy : result.thaiTexts, modelUsed: result.modelUsed, promptUsed: result.promptUsed });
      } catch (error) {
        updateCard(card.id, { status: 'error', error: error instanceof Error ? error.message : 'สร้างภาพไม่สำเร็จ' });
      }
    }
    setSession(prev => ({ ...prev, isGenerating: false, notice: `สร้าง ${count} ภาพแรกครบแล้ว — ช่องที่เหลือกด “สร้างภาพนี้” ได้ทันที` }));
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
    const blob = await imageWithCopy(card.imageUrl, card.thaiCopy);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${cleanName(name)}-${card.id}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const downloadZip = async () => {
    const complete = cards.filter(card => card.imageUrl);
    if (!complete.length) return;
    setSession(prev => ({ ...prev, notice: 'กำลังเตรียม ZIP พร้อมข้อความไทย…' }));
    const zip = new JSZip();
    for (const card of complete) zip.file(`${cleanName(name)}-${card.id}.png`, await imageWithCopy(card.imageUrl!, card.thaiCopy));
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
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><div className="flex items-center gap-2 text-orange-100 text-sm font-bold"><Sparkles size={16}/> AI CREATIVE STUDIO</div><h2 className="mt-2 text-3xl font-black">Shopee Thai Ads Generator</h2><p className="mt-2 max-w-2xl text-orange-50">สร้างชุดภาพขายพร้อมพื้นที่สำหรับข้อความไทยที่แก้ได้จริง — ยึดข้อมูลสินค้า ราคา และตัวเลือกที่ยืนยันแล้วเป็นหลัก</p></div><div className="rounded-2xl bg-white/15 px-4 py-3 text-sm"><ShieldCheck className="inline mr-2" size={18}/>Fact-locked · Campaign-consistent · ZIP export</div></div>
    </div>

    <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
      <div className={`rounded-3xl border p-6 shadow-sm ${classCard}`}>
        <h3 className="font-black text-xl">1. ข้อมูลและภาพอ้างอิง</h3><p className="mt-1 text-sm text-slate-500">ระบบจะไม่เดาสเปก ราคา หรือตัวเลือกที่คุณไม่ได้ยืนยัน</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">{(['product', 'package', 'logo'] as AssetKind[]).map(kind => <div key={kind} className="rounded-2xl border border-dashed border-orange-300 bg-orange-50/60 p-4 text-center dark:bg-orange-950/20"><input ref={fileRefs[kind]} className="hidden" type="file" accept="image/*" multiple onChange={e => addAssets(kind, e.target.files)}/><ImagePlus className="mx-auto text-orange-500"/><p className="mt-2 text-sm font-bold">{kind === 'product' ? 'ภาพสินค้า *' : kind === 'package' ? 'กล่อง / อุปกรณ์' : 'โลโก้ร้าน'}</p><button onClick={() => fileRefs[kind].current?.click()} className="mt-3 text-xs font-bold text-orange-600">เพิ่มรูป ({assets[kind].length})</button></div>)}</div>
        {allImages.length > 0 && <div className="mt-4 flex gap-2 overflow-x-auto">{allImages.map(src => <div key={src} className="relative shrink-0"><img src={src} className="h-16 w-16 rounded-xl object-cover"/><button onClick={() => setSession(prev => ({ ...prev, assets: { product: prev.assets.product.filter(x => x !== src), package: prev.assets.package.filter(x => x !== src), logo: prev.assets.logo.filter(x => x !== src) } }))} className="absolute -right-1 -top-1 rounded-full bg-slate-900 p-1 text-white"><X size={11}/></button></div>)}</div>}
        <div className="mt-5 grid gap-4"><label className="text-sm font-bold">ชื่อสินค้า<input value={name} onChange={e => setSession(prev => ({ ...prev, name: e.target.value }))} placeholder="เช่น เครื่องชั่งดิจิทัล รุ่น X1" className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 outline-none focus:border-orange-500"/></label><label className="text-sm font-bold">รายละเอียดสินค้า<textarea value={details} onChange={e => setSession(prev => ({ ...prev, details: e.target.value }))} rows={3} placeholder="บอกวัสดุ กลุ่มลูกค้า การใช้งาน หรือบริบทที่ต้องการ" className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 outline-none focus:border-orange-500"/></label><label className="text-sm font-bold">ข้อเท็จจริงที่ยืนยันแล้ว <span className="font-normal text-slate-500">(หนึ่งข้อ/บรรทัด)</span><textarea value={factsText} onChange={e => setSession(prev => ({ ...prev, factsText: e.target.value }))} rows={5} placeholder={'เช่น รองรับน้ำหนักสูงสุด 10 กก.\nหน้าจอ LED\nในกล่องมีถาด 1 ชิ้น'} className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 outline-none focus:border-orange-500"/></label></div>
        {commerceFacts.length > 0 && <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"><b>ข้อมูลการขายที่รับมาจาก Analyze</b><div className="mt-1 space-y-1">{commerceFacts.map(fact => <p key={fact}>• {fact}</p>)}</div></div>}
      </div>

      <div className={`rounded-3xl border p-6 shadow-sm ${classCard}`}><h3 className="font-black text-xl">2. AI วางแผนชุดภาพ</h3><div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">โมเดลที่เลือกสำหรับคิวนี้: {modelLabel}</div><div className="mt-5"><p className="text-sm font-bold">จำนวนภาพ</p><div className="mt-2 flex flex-wrap gap-2">{[4, 6, 8, 10].map(value => <button key={value} onClick={() => setSession(prev => ({ ...prev, count: value }))} className={`rounded-xl px-4 py-2 text-sm font-bold ${count === value ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200'}`}>{value} ภาพ</button>)}</div></div><div className="mt-5"><label className="text-sm font-bold">โทนหลักของทั้งชุด<select value={campaignStyle} onChange={e => { const style = e.target.value as CampaignStyle; setSession(prev => ({ ...prev, campaignStyle: style, campaignDirection: styleMeta(style).direction })); }} className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-orange-500">{CAMPAIGN_STYLES.map(style => <option key={style.id} value={style.id} className="text-slate-900">{style.label} — {style.description}</option>)}</select></label><label className="mt-3 block text-sm font-bold">คำสั่งคุมโทนร่วมกัน<textarea value={campaignDirection} onChange={e => setSession(prev => ({ ...prev, campaignDirection: e.target.value }))} rows={4} className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 text-xs outline-none focus:border-orange-500"/></label><p className="mt-2 text-xs text-slate-500">AI จะใส่คำสั่งนี้ในทุกภาพ เพื่อคุมสี แสง วัสดุพื้นหลัง และภาษาองค์ประกอบให้เป็นแคมเปญเดียวกัน</p></div><div className="mt-5 rounded-2xl border border-orange-200 bg-orange-50 p-4 dark:bg-orange-950/20"><label className="flex cursor-pointer items-center gap-3"><input type="checkbox" checked={heroWithPerson} onChange={e => setSession(prev => ({ ...prev, heroWithPerson: e.target.checked }))} className="h-4 w-4 accent-orange-500"/><span className="font-bold"><UserRound className="mr-1 inline" size={17}/>ภาพปกมีคนกำลังใช้งานสินค้า</span></label>{heroWithPerson && <input value={personBrief} onChange={e => setSession(prev => ({ ...prev, personBrief: e.target.value }))} className="mt-3 w-full rounded-xl border border-orange-200 bg-white px-3 py-2 text-sm text-slate-800"/>}</div><div className="mt-6 space-y-2">{BLUEPRINTS.slice(0, count).map((item, index) => <div key={item.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800"><span className="w-6 text-xs font-black text-orange-500">{String(index + 1).padStart(2, '0')}</span><span className="text-sm font-semibold">{item.title}</span>{item.includePerson && <UserRound className="ml-auto text-orange-500" size={16}/>}</div>)}</div><button disabled={isGenerating} onClick={generate} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 px-5 py-3.5 font-black text-white shadow-lg shadow-orange-500/25 disabled:opacity-50">{isGenerating ? <Loader2 className="animate-spin"/> : <Sparkles/>}{isGenerating ? 'กำลังสร้างภาพตามคิว…' : `วางแผนและสร้าง ${count} ภาพ`}</button>{notice && <p className="mt-3 text-center text-sm text-slate-500">{notice}</p>}</div>
    </div>

    {cards.length > 0 && <div className={`rounded-3xl border p-6 shadow-sm ${classCard}`}><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black text-xl">3. ผลลัพธ์และข้อความไทย</h3><p className="text-sm text-slate-500">เปลี่ยนสไตล์เฉพาะภาพได้ แล้วกดสร้างใหม่ โดยยังยึดโทนร่วมกันของชุดภาพ</p></div><button onClick={downloadZip} disabled={!cards.some(c => c.imageUrl)} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"><Package size={17}/>ดาวน์โหลด ZIP</button></div><div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{cards.map((card, index) => <article key={card.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"><div className="aspect-square bg-slate-200 dark:bg-slate-700">{card.imageUrl ? <img src={card.imageUrl} className="h-full w-full object-cover"/> : <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">{card.status === 'generating' ? <Loader2 className="animate-spin text-orange-500" size={30}/> : <ImagePlus size={30}/>}<span className="text-sm">{card.status === 'error' ? card.error : card.status === 'generating' ? 'กำลังสร้าง…' : 'รอคิว'}</span></div>}</div><div className="p-4"><div className="flex items-center justify-between"><span className="text-xs font-black text-orange-500">{String(index + 1).padStart(2, '0')}</span><span className="text-sm font-bold">{card.title}</span></div><p title={card.modelUsed || modelLabel} className="mt-2 truncate rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">{card.status === 'generating' ? `กำลังใช้: ${modelLabel}` : `ใช้จริง: ${card.modelUsed || 'รอสร้างภาพ'}`}</p><label className="mt-3 block text-xs font-bold">สไตล์ภาพนี้<select value={card.visualStyle} onChange={e => updateCard(card.id, { visualStyle: e.target.value as CampaignStyle })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-800 outline-none focus:border-orange-500">{CAMPAIGN_STYLES.map(style => <option key={style.id} value={style.id}>{style.label}</option>)}</select></label><textarea value={card.thaiCopy.join('\n')} onChange={e => updateCard(card.id, { thaiCopy: e.target.value.split('\n').filter(Boolean) })} placeholder="ข้อความไทยที่ต้องการวางบนภาพ" rows={3} className="mt-3 w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-800 outline-none focus:border-orange-500"/><div className="mt-3 flex gap-2"><button onClick={() => regenerate(card)} disabled={card.status === 'generating'} className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-orange-200 py-2 text-xs font-bold text-orange-600 disabled:opacity-40"><RefreshCw size={14}/>สร้างใหม่</button><button onClick={() => download(card)} disabled={!card.imageUrl} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-orange-500 py-2 text-xs font-bold text-white disabled:opacity-40"><Download size={14}/>PNG</button></div></div></article>)}</div></div>}
  </section>;
}
