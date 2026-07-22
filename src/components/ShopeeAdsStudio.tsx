import React, { useMemo, useRef } from 'react';
import JSZip from 'jszip';
import { Download, ImagePlus, Loader2, Package, RefreshCw, ShieldCheck, Sparkles, UserRound, X } from 'lucide-react';
import { generateProductImage, type ShopeeAdBrief } from '../apiClient';
import { ImageCategory, type ProductData } from '../../types';

type AssetKind = 'product' | 'package' | 'logo';
type AdStatus = 'ready' | 'generating' | 'completed' | 'error';
export type ThaiAdsCard = ShopeeAdBrief & { id: string; status: AdStatus; imageUrl?: string; error?: string };

export type ThaiAdsSession = {
  assets: Record<AssetKind, string[]>;
  name: string;
  details: string;
  factsText: string;
  count: number;
  heroWithPerson: boolean;
  personBrief: string;
  cards: ThaiAdsCard[];
  isGenerating: boolean;
  notice: string;
};

export const createThaiAdsSession = (): ThaiAdsSession => ({
  assets: { product: [], package: [], logo: [] },
  name: '',
  details: '',
  factsText: '',
  count: 10,
  heroWithPerson: true,
  personBrief: 'คนไทยหรือเอเชียวัยผู้ใหญ่ ใช้งานสินค้าอย่างเป็นธรรมชาติ',
  cards: [],
  isGenerating: false,
  notice: '',
});

const BLUEPRINTS: Omit<ThaiAdsCard, 'status' | 'imageUrl' | 'error'>[] = [
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
];

const readFiles = async (files: FileList | null): Promise<string[]> => Promise.all(Array.from(files || []).map(file => new Promise<string>((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file);
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

const buildThaiAdsPrompt = (card: ThaiAdsCard) => [
  `Thai Shopee Detail-Rich Ads role: ${card.role}.`,
  `Objective: ${card.objective}.`,
  'Use a clean Thai high-information ecommerce layout, with the exact reference product large and unmistakable. Preserve identity, colour, materials, labels, shape, proportions, and included pieces.',
  card.facts.length ? `Confirmed facts only: ${card.facts.join(' | ')}.` : 'Use only visible product details; do not invent specifications.',
  card.includePerson ? `Include an adult Thai or Asian person naturally using the exact product. ${card.personBrief || ''}` : 'Do not include people unless the role requires them.',
  'Leave clean overlay space for editable Thai copy. Do not invent prices, discounts, reviews, certification badges, measurements, variants, accessories, or claims.',
].filter(Boolean).join('\n\n');

async function imageWithCopy(url: string, copy: string[]) {
  const image = new Image(); image.crossOrigin = 'anonymous'; image.src = url; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
  const lines = copy.filter(Boolean).slice(0, 4);
  if (lines.length) {
    const pad = Math.max(28, canvas.width * .045); const fontSize = Math.max(24, canvas.width * .052);
    const height = fontSize * (lines.length + .95) + pad * 1.5;
    ctx.fillStyle = 'rgba(11, 22, 38, .84)'; ctx.roundRect(pad, pad, canvas.width - pad * 2, height, fontSize * .32); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `700 ${fontSize}px "Noto Sans Thai", Tahoma, sans-serif`; ctx.textBaseline = 'top';
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
  const { assets, name, details, factsText, count, heroWithPerson, personBrief, cards, isGenerating, notice } = session;
  const fileRefs = { product: useRef<HTMLInputElement>(null), package: useRef<HTMLInputElement>(null), logo: useRef<HTMLInputElement>(null) };
  const allImages = useMemo(() => [...assets.product, ...assets.package, ...assets.logo], [assets]);
  const confirmedFacts = useMemo(() => factsText.split('\n').map(x => x.trim()).filter(Boolean), [factsText]);
  const classCard = dark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900';

  const addAssets = async (kind: AssetKind, files: FileList | null) => {
    const data = await readFiles(files); setSession(prev => ({ ...prev, assets: { ...prev.assets, [kind]: [...prev.assets[kind], ...data] } }));
  };
  const createCards = () => BLUEPRINTS.slice(0, count).map(base => ({ ...base, status: 'ready' as AdStatus, facts: confirmedFacts, thaiCopy: base.id === 'hero' ? [name, ...confirmedFacts.slice(0, 2)] : [base.title, ...confirmedFacts.slice(0, 3)], includePerson: base.id === 'hero' ? heroWithPerson : base.includePerson, personBrief }));
  const updateCard = (id: string, patch: Partial<ThaiAdsCard>) => setSession(prev => ({ ...prev, cards: prev.cards.map(card => card.id === id ? { ...card, ...patch } : card) }));

  const generate = async () => {
    if (!allImages.length) return setSession(prev => ({ ...prev, notice: 'เพิ่มภาพสินค้าหลักอย่างน้อย 1 ภาพก่อนสร้าง' }));
    if (!name.trim()) return setSession(prev => ({ ...prev, notice: 'ใส่ชื่อสินค้าก่อนเริ่มสร้าง' }));
    const work = createCards(); setSession(prev => ({ ...prev, cards: work, notice: 'กำลังเตรียมคิวสร้างภาพ…', isGenerating: true }));
    const product: ProductData = { name, description: details, features: confirmedFacts, images: allImages };
    for (const card of work) {
      updateCard(card.id, { status: 'generating', error: undefined });
      try {
        const result = await generateProductImage(categoryForCard(card.id), product, 'shopee', buildThaiAdsPrompt(card), imageModel, '1:1');
        updateCard(card.id, { status: 'completed', imageUrl: result.imageUrl, thaiCopy: card.thaiCopy.length ? card.thaiCopy : result.thaiTexts });
      } catch (error) { updateCard(card.id, { status: 'error', error: error instanceof Error ? error.message : 'สร้างภาพไม่สำเร็จ' }); }
    }
    setSession(prev => ({ ...prev, isGenerating: false, notice: 'สร้างภาพครบคิวแล้ว คุณแก้ข้อความและสร้างใหม่เป็นรายภาพได้' }));
  };
  const regenerate = async (card: ThaiAdsCard) => {
    if (!allImages.length) return; updateCard(card.id, { status: 'generating', error: undefined });
    try { const result = await generateProductImage(categoryForCard(card.id), { name, description: details, features: confirmedFacts, images: allImages }, 'shopee', buildThaiAdsPrompt(card), imageModel, '1:1'); updateCard(card.id, { status: 'completed', imageUrl: result.imageUrl, thaiCopy: card.thaiCopy.length ? card.thaiCopy : result.thaiTexts }); }
    catch (error) { updateCard(card.id, { status: 'error', error: error instanceof Error ? error.message : 'สร้างภาพไม่สำเร็จ' }); }
  };
  const download = async (card: ThaiAdsCard) => { if (!card.imageUrl) return; const blob = await imageWithCopy(card.imageUrl, card.thaiCopy); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${cleanName(name)}-${card.id}.png`; a.click(); URL.revokeObjectURL(a.href); };
  const downloadZip = async () => { const complete = cards.filter(card => card.imageUrl); if (!complete.length) return; setSession(prev => ({ ...prev, notice: 'กำลังเตรียม ZIP พร้อมข้อความไทย…' })); const zip = new JSZip(); for (const card of complete) zip.file(`${cleanName(name)}-${card.id}.png`, await imageWithCopy(card.imageUrl!, card.thaiCopy)); const blob = await zip.generateAsync({ type: 'blob' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${cleanName(name)}-shopee-ads.zip`; a.click(); URL.revokeObjectURL(a.href); setSession(prev => ({ ...prev, notice: 'ดาวน์โหลด ZIP เรียบร้อย' })); };

  return <section className="max-w-7xl mx-auto space-y-6">
    <div className="rounded-3xl bg-gradient-to-br from-orange-500 via-orange-600 to-rose-600 p-7 text-white shadow-xl">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><div className="flex items-center gap-2 text-orange-100 text-sm font-bold"><Sparkles size={16}/> AI CREATIVE STUDIO</div><h2 className="mt-2 text-3xl font-black">Shopee Thai Ads Generator</h2><p className="mt-2 max-w-2xl text-orange-50">สร้างชุดภาพขายพร้อมพื้นที่สำหรับข้อความไทยที่แก้ได้จริง — ยึดข้อมูลสินค้าและภาพอ้างอิงของคุณเป็นหลัก</p></div><div className="rounded-2xl bg-white/15 px-4 py-3 text-sm"><ShieldCheck className="inline mr-2" size={18}/>Fact-locked · Mobile-safe · ZIP export</div></div>
    </div>

    <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
      <div className={`rounded-3xl border p-6 shadow-sm ${classCard}`}>
        <h3 className="font-black text-xl">1. ข้อมูลและภาพอ้างอิง</h3><p className="mt-1 text-sm text-slate-500">ระบบจะไม่เดาสเปกที่คุณไม่ได้ยืนยัน</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">{(['product', 'package', 'logo'] as AssetKind[]).map(kind => <div key={kind} className="rounded-2xl border border-dashed border-orange-300 bg-orange-50/60 p-4 text-center dark:bg-orange-950/20"><input ref={fileRefs[kind]} className="hidden" type="file" accept="image/*" multiple onChange={e => addAssets(kind, e.target.files)}/><ImagePlus className="mx-auto text-orange-500"/><p className="mt-2 text-sm font-bold">{kind === 'product' ? 'ภาพสินค้า *' : kind === 'package' ? 'กล่อง / อุปกรณ์' : 'โลโก้ร้าน'}</p><button onClick={() => fileRefs[kind].current?.click()} className="mt-3 text-xs font-bold text-orange-600">เพิ่มรูป ({assets[kind].length})</button></div>)}</div>
        {allImages.length > 0 && <div className="mt-4 flex gap-2 overflow-x-auto">{allImages.map((src, i) => <div key={src} className="relative shrink-0"><img src={src} className="h-16 w-16 rounded-xl object-cover"/><button onClick={() => setSession(prev => ({ ...prev, assets: { product: prev.assets.product.filter(x => x !== src), package: prev.assets.package.filter(x => x !== src), logo: prev.assets.logo.filter(x => x !== src) } }))} className="absolute -right-1 -top-1 rounded-full bg-slate-900 p-1 text-white"><X size={11}/></button></div>)}</div>}
        <div className="mt-5 grid gap-4"><label className="text-sm font-bold">ชื่อสินค้า<input value={name} onChange={e => setSession(prev => ({ ...prev, name: e.target.value }))} placeholder="เช่น เครื่องชั่งดิจิทัล รุ่น X1" className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 outline-none focus:border-orange-500"/></label><label className="text-sm font-bold">รายละเอียดสินค้า<textarea value={details} onChange={e => setSession(prev => ({ ...prev, details: e.target.value }))} rows={3} placeholder="บอกวัสดุ กลุ่มลูกค้า การใช้งาน หรือบริบทที่ต้องการ" className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 outline-none focus:border-orange-500"/></label><label className="text-sm font-bold">ข้อเท็จจริงที่ยืนยันแล้ว <span className="font-normal text-slate-500">(หนึ่งข้อ/บรรทัด)</span><textarea value={factsText} onChange={e => setSession(prev => ({ ...prev, factsText: e.target.value }))} rows={5} placeholder={'เช่น รองรับน้ำหนักสูงสุด 10 กก.\nหน้าจอ LED\nในกล่องมีถาด 1 ชิ้น'} className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 outline-none focus:border-orange-500"/></label></div>
      </div>

      <div className={`rounded-3xl border p-6 shadow-sm ${classCard}`}><h3 className="font-black text-xl">2. วางแผนชุดภาพ</h3><div className="mt-5"><p className="text-sm font-bold">จำนวนภาพ</p><div className="mt-2 flex flex-wrap gap-2">{[4, 6, 8, 10].map(value => <button key={value} onClick={() => setSession(prev => ({ ...prev, count: value }))} className={`rounded-xl px-4 py-2 text-sm font-bold ${count === value ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200'}`}>{value} ภาพ</button>)}</div></div><div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50 p-4 dark:bg-orange-950/20"><label className="flex cursor-pointer items-center gap-3"><input type="checkbox" checked={heroWithPerson} onChange={e => setSession(prev => ({ ...prev, heroWithPerson: e.target.checked }))} className="h-4 w-4 accent-orange-500"/><span className="font-bold"><UserRound className="mr-1 inline" size={17}/>ภาพปกมีคนกำลังใช้งานสินค้า</span></label>{heroWithPerson && <input value={personBrief} onChange={e => setSession(prev => ({ ...prev, personBrief: e.target.value }))} className="mt-3 w-full rounded-xl border border-orange-200 bg-white px-3 py-2 text-sm text-slate-800"/>}</div><div className="mt-6 space-y-2">{BLUEPRINTS.slice(0, count).map((item, index) => <div key={item.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800"><span className="w-6 text-xs font-black text-orange-500">{String(index + 1).padStart(2, '0')}</span><span className="text-sm font-semibold">{item.title}</span>{item.includePerson && <UserRound className="ml-auto text-orange-500" size={16}/>}</div>)}</div><button disabled={isGenerating} onClick={generate} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 px-5 py-3.5 font-black text-white shadow-lg shadow-orange-500/25 disabled:opacity-50">{isGenerating ? <Loader2 className="animate-spin"/> : <Sparkles/>}{isGenerating ? 'กำลังสร้างภาพตามคิว…' : `สร้างชุดภาพ ${count} ภาพ`}</button>{notice && <p className="mt-3 text-center text-sm text-slate-500">{notice}</p>}</div>
    </div>

    {cards.length > 0 && <div className={`rounded-3xl border p-6 shadow-sm ${classCard}`}><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black text-xl">3. ผลลัพธ์และข้อความไทย</h3><p className="text-sm text-slate-500">ข้อความจะถูกวางด้วย Canvas ตอนดาวน์โหลด จึงสะกดไทยได้ตรงตามที่คุณแก้ไข</p></div><button onClick={downloadZip} disabled={!cards.some(c => c.imageUrl)} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"><Package size={17}/>ดาวน์โหลด ZIP</button></div><div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{cards.map((card, index) => <article key={card.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"><div className="aspect-square bg-slate-200 dark:bg-slate-700">{card.imageUrl ? <img src={card.imageUrl} className="h-full w-full object-cover"/> : <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">{card.status === 'generating' ? <Loader2 className="animate-spin text-orange-500" size={30}/> : <ImagePlus size={30}/>}<span className="text-sm">{card.status === 'error' ? card.error : card.status === 'generating' ? 'กำลังสร้าง…' : 'รอคิว'}</span></div>}</div><div className="p-4"><div className="flex items-center justify-between"><span className="text-xs font-black text-orange-500">{String(index + 1).padStart(2, '0')}</span><span className="text-sm font-bold">{card.title}</span></div><textarea value={card.thaiCopy.join('\n')} onChange={e => updateCard(card.id, { thaiCopy: e.target.value.split('\n').filter(Boolean) })} placeholder="ข้อความไทยที่ต้องการวางบนภาพ" rows={3} className="mt-3 w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-800 outline-none focus:border-orange-500"/><div className="mt-3 flex gap-2"><button onClick={() => regenerate(card)} disabled={card.status === 'generating'} className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-orange-200 py-2 text-xs font-bold text-orange-600 disabled:opacity-40"><RefreshCw size={14}/>สร้างใหม่</button><button onClick={() => download(card)} disabled={!card.imageUrl} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-orange-500 py-2 text-xs font-bold text-white disabled:opacity-40"><Download size={14}/>PNG</button></div></div></article>)}</div></div>}
  </section>;
}
