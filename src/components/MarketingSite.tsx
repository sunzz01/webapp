import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleDollarSign,
  CreditCard,
  Download,
  ImageIcon,
  Menu,
  Moon,
  QrCode,
  ShieldCheck,
  Sparkles,
  Sun,
  WalletCards,
  X,
  Zap,
} from 'lucide-react';
import { BillingInterval, formatThaiBaht, getPlanPrice, PlanId, PRICING_PLANS } from '../../pricing';
import { useTheme } from '../contexts/ThemeContext';
import { KineticBackground } from './KineticBackground';
import { SlotMachineHeroPreview } from './SlotMachineHeroPreview';
import { FloatingHint } from './FloatingHint';

interface MarketingSiteProps {
  onOpenAuth: (planId?: PlanId) => void;
  onGoToStudio?: () => void;
  onSelectPlan?: (planId: PlanId) => void;
}

const paymentMethods = [
  { icon: QrCode, title: 'PromptPay QR', description: 'สแกนจ่ายได้ทุกธนาคาร' },
  { icon: WalletCards, title: 'TrueMoney', description: 'ยืนยันผ่าน Wallet ของคุณ' },
  { icon: CreditCard, title: 'บัตรเครดิต/เดบิต', description: 'ชำระผ่านหน้ารับบัตรที่ปลอดภัย' },
  { icon: CircleDollarSign, title: 'Alipay', description: 'รองรับลูกค้าข้ามพรมแดน' },
];

const faqs = [
  ['เครดิตใช้ทำอะไรได้บ้าง?', '1 เครดิตใช้กับการวิเคราะห์สินค้าหรือภาพที่สร้างสำเร็จ 1 ภาพ โดยระบบจะแจ้งก่อนเริ่มงานเสมอ'],
  ['ทำไม QR และ Wallet ไม่ตัดเงินรายเดือนอัตโนมัติ?', 'ช่องทางเหล่านี้เป็นการชำระแต่ละครั้ง เมื่อถึงรอบใหม่คุณเลือกต่ออายุเองได้ ส่วนสิทธิ์จะเพิ่มหลังระบบยืนยันการชำระเงินแล้ว'],
  ['ข้อมูลบัตรถูกเก็บไว้ที่ PicSeller หรือไม่?', 'ไม่เก็บ เลขบัตรจะถูกส่งตรงไปยังผู้ให้บริการรับชำระเงินเพื่อแปลงเป็น token ที่ปลอดภัย'],
];

const EXTENSION_REPOSITORY_URL = 'https://github.com/sunzz01/Combo-Shopee-Image-Generate-V.2';

export const MarketingSite: React.FC<MarketingSiteProps> = ({ onOpenAuth, onGoToStudio, onSelectPlan }) => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const yearlySaving = useMemo(() => {
    const pro = PRICING_PLANS.find((plan) => plan.id === 'pro');
    return pro ? pro.monthlyPrice * 12 - pro.yearlyPrice : 0;
  }, []);

  const jumpToPricing = () => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const isSignedIn = Boolean(onGoToStudio);
  const returnToStudio = () => onGoToStudio?.();
  const selectPlan = (planId: PlanId) => onSelectPlan ? onSelectPlan(planId) : onOpenAuth(planId);

  return (
    <div className={isDark ? 'min-h-screen bg-[#08111f]/90 text-slate-100 relative z-0' : 'min-h-screen bg-[#f8fafc]/90 text-slate-900 relative z-0'}>
      <KineticBackground />
      <header className={`sticky top-0 z-40 border-b backdrop-blur-xl ${isDark ? 'border-white/10 bg-[#08111f]/80' : 'border-slate-200/80 bg-white/80'}`}>
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 py-3 lg:px-8">
          <button className="flex items-center gap-3 text-left" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-lg shadow-orange-500/30">
              <Sparkles className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-base font-black tracking-tight">PicSeller</span>
              <span className={`block text-[9px] font-bold uppercase tracking-[0.18em] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Visual Commerce Suite</span>
            </span>
          </button>

          <nav className="hidden items-center gap-7 md:flex">
            <FloatingHint title="ดูความสามารถ" description="ดูเครื่องมือที่ช่วยเปลี่ยนข้อมูลสินค้าเป็นภาพพร้อมขาย"><button onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })} className={`text-sm font-bold transition-colors ${isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-950'}`}>ความสามารถ</button></FloatingHint>
            <FloatingHint title="แพ็กเกจและราคา" description="เปรียบเทียบเครดิตและเลือกแผนที่เหมาะกับร้านของคุณ"><button onClick={jumpToPricing} className={`text-sm font-bold transition-colors ${isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-950'}`}>ราคา</button></FloatingHint>
            <FloatingHint title="คำถามที่พบบ่อย" description="ดูคำตอบเรื่องเครดิต การชำระเงิน และความปลอดภัย"><button onClick={() => document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' })} className={`text-sm font-bold transition-colors ${isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-950'}`}>คำถามที่พบบ่อย</button></FloatingHint>
            <a href={EXTENSION_REPOSITORY_URL} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1.5 text-sm font-bold transition-colors ${isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-950'}`}><Download className="h-3.5 w-3.5" />ดาวน์โหลด Extension</a>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <button onClick={toggleTheme} aria-label="สลับธีม" className={`rounded-xl p-2 transition-colors ${isDark ? 'bg-white/10 text-amber-300 hover:bg-white/15' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button onClick={isSignedIn ? returnToStudio : () => onOpenAuth()} className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${isDark ? 'text-slate-200 hover:bg-white/10' : 'text-slate-600 hover:bg-slate-100'}`}>{isSignedIn ? 'กลับไป Studio' : 'เข้าสู่ระบบ'}</button>
            <FloatingHint title={isSignedIn ? 'เปิด Studio' : 'ทดลองใช้ฟรี 10 เครดิต'} description={isSignedIn ? 'กลับไปสร้างและจัดการภาพสินค้า' : 'สมัครเพื่อเริ่มใช้งานโดยไม่ต้องใช้บัตรเครดิต'} align="right"><button onClick={isSignedIn ? returnToStudio : () => onOpenAuth()} className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-black text-white shadow-lg shadow-orange-500/25 transition hover:bg-orange-600">{isSignedIn ? 'เปิด Studio' : 'ทดลองใช้งานฟรี'}</button></FloatingHint>
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <button onClick={toggleTheme} aria-label="สลับธีม" className={`rounded-xl p-2 ${isDark ? 'bg-white/10 text-amber-300' : 'bg-slate-100 text-slate-600'}`}>{isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
            <button onClick={() => setMenuOpen((open) => !open)} aria-label="เปิดเมนู" className={`rounded-xl p-2 ${isDark ? 'bg-white/10' : 'bg-slate-100'}`}>{menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
          </div>
        </div>
        {menuOpen && <div className={`border-t px-5 py-4 md:hidden ${isDark ? 'border-white/10 bg-[#0c192b]' : 'border-slate-200 bg-white'}`}>
          <div className="grid gap-2">
            <button onClick={() => { setMenuOpen(false); jumpToPricing(); }} className="rounded-xl px-3 py-2 text-left text-sm font-bold">ราคาและแพ็กเกจ</button>
            <a href={EXTENSION_REPOSITORY_URL} target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold"><Download className="h-4 w-4 text-orange-500" />ดาวน์โหลด Extension</a>
            <button onClick={() => { setMenuOpen(false); isSignedIn ? returnToStudio() : onOpenAuth(); }} className="rounded-xl bg-orange-500 px-3 py-2 text-left text-sm font-black text-white">{isSignedIn ? 'กลับไป Studio' : 'ทดลองใช้งานฟรี'}</button>
          </div>
        </div>}
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-16 lg:grid-cols-[1.02fr_.98fr] lg:px-8 lg:py-24">
            <div className="flex flex-col justify-center">
              <div className={`mb-6 inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${isDark ? 'border-orange-400/30 bg-orange-400/10 text-orange-200' : 'border-orange-200 bg-orange-50 text-orange-700'}`}>
                <Zap className="h-3.5 w-3.5" />
                AI Visual Studio สำหรับร้านค้าออนไลน์
              </div>
              <h1 className="max-w-3xl text-4xl font-black leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                เปลี่ยนข้อมูลสินค้า
                <span className="block bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 bg-clip-text text-transparent">เป็นภาพขายที่พร้อมใช้</span>
              </h1>
              <p className={`mt-6 max-w-2xl text-base leading-8 sm:text-lg ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                ดึงสินค้าและตัวเลือกจาก Shopee, สร้างภาพ Thai Ads, อินโฟกราฟิก และ Size Chart ที่ควบคุมรายละเอียดได้ในขั้นตอนเดียว
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <FloatingHint title="เริ่มทดลองใช้ฟรี" description="รับ 10 เครดิตเพื่อทดลองวิเคราะห์สินค้าและสร้างภาพชุดแรก"><button onClick={isSignedIn ? returnToStudio : () => onOpenAuth()} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-orange-500 px-6 py-3.5 text-sm font-black text-white shadow-xl shadow-orange-500/25 transition hover:-translate-y-0.5 hover:bg-orange-600">ทดลองใช้งานฟรี <ArrowRight className="h-4 w-4" /></button></FloatingHint>
                <button onClick={isSignedIn ? returnToStudio : () => onOpenAuth()} className={`inline-flex items-center justify-center rounded-2xl border px-6 py-3.5 text-sm font-black transition ${isDark ? 'border-white/15 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'}`}>{isSignedIn ? 'กลับไป Studio' : 'เข้าสู่ระบบ'}</button>
              </div>
              <div className={`mt-8 flex flex-wrap gap-x-5 gap-y-3 text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" />เริ่มฟรี 10 เครดิต</span>
                <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" />รองรับ QR และ Wallet</span>
                <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" />ไม่มีการเก็บเลขบัตร</span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-xl">
              <div className={`rounded-[2rem] border p-4 shadow-2xl ${isDark ? 'border-white/10 bg-[#101d31]/90 shadow-slate-950/40' : 'border-white bg-white/90 shadow-slate-300/50'}`}>
                <div className="flex items-center justify-between px-2 pb-4">
                  <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-rose-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /></div>
                  <span className={`text-[10px] font-black uppercase tracking-[0.16em] ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>Thai Ads Studio</span>
                </div>
                <SlotMachineHeroPreview isDark={isDark} />
                <div className={`mt-4 rounded-xl border p-3 ${isDark ? 'border-emerald-400/20 bg-emerald-400/10' : 'border-emerald-100 bg-emerald-50'}`}><div className="flex items-center gap-2 text-xs font-bold text-emerald-600"><ShieldCheck className="h-4 w-4" />ภาพพร้อมใช้ขาย พร้อมคุมรายละเอียดสินค้าให้ตรงจริง</div></div>
              </div>
              <div className={`mt-3 flex items-center justify-center gap-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}><Sparkles className="h-4 w-4 text-emerald-500" /><span><span className="font-bold">พร้อมสร้างแคมเปญ</span><span className="mx-1 text-slate-400">·</span>6 ภาพในชุดเดียว</span></div>
            </div>
          </div>
        </section>

        <section id="features" className={`border-y py-16 ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-slate-200 bg-white'}`}>
          <div className="mx-auto max-w-7xl px-5 lg:px-8"><div className="max-w-2xl"><p className="text-xs font-black uppercase tracking-[0.18em] text-orange-500">Built for commerce</p><h2 className="mt-3 text-3xl font-black tracking-tight">ภาพที่ไม่ใช่แค่สวย แต่ใช้ขายได้จริง</h2></div><div className="mt-10 grid gap-4 md:grid-cols-3">
            {[{ icon: ImageIcon, title: 'รู้จักสินค้าและตัวเลือก', text: 'รับชื่อ ราคา สเปก รูป และหลายตัวเลือกจากสินค้า เพื่อไม่ให้ภาพพูดเกินจริง' }, { icon: Sparkles, title: 'คุมโทนทั้งแคมเปญ', text: 'กำหนด art direction กลางและปรับรูปแบบของการ์ดแต่ละภาพได้' }, { icon: ShieldCheck, title: 'ตรวจสอบขนาดได้', text: 'ทำ Size Chart และแก้สเกลเทียบ iPhone หรือมือด้วยข้อมูลจริง' }].map(({ icon: Icon, title, text }) => <article key={title} className={`rounded-2xl border p-6 ${isDark ? 'border-white/10 bg-[#0c192b]' : 'border-slate-200 bg-slate-50'}`}><span className="inline-flex rounded-xl bg-orange-500/10 p-3 text-orange-500"><Icon className="h-5 w-5" /></span><h3 className="mt-5 font-black">{title}</h3><p className={`mt-2 text-sm leading-6 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{text}</p></article>)}
          </div></div>
        </section>

        <section id="pricing" className="scroll-mt-24 px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-7xl text-center"><p className="text-xs font-black uppercase tracking-[0.18em] text-orange-500">Simple pricing</p><h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">เลือกพลัง AI ให้เหมาะกับร้านของคุณ</h2><p className={`mx-auto mt-4 max-w-2xl text-sm leading-6 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>ราคาและจำนวนเครดิตจะถูกยืนยันอีกครั้งในหน้าเช็กเอาต์ก่อนชำระเงินจริง</p>
            <div className={`mx-auto mt-8 inline-flex rounded-xl border p-1 ${isDark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white'}`}><button onClick={() => setInterval('monthly')} className={`rounded-lg px-4 py-2 text-sm font-black transition ${interval === 'monthly' ? 'bg-orange-500 text-white shadow-sm' : isDark ? 'text-slate-400' : 'text-slate-500'}`}>รายเดือน</button><button onClick={() => setInterval('yearly')} className={`rounded-lg px-4 py-2 text-sm font-black transition ${interval === 'yearly' ? 'bg-orange-500 text-white shadow-sm' : isDark ? 'text-slate-400' : 'text-slate-500'}`}>รายปี <span className={interval === 'yearly' ? 'text-orange-100' : 'text-emerald-500'}>ประหยัด {formatThaiBaht(yearlySaving)}</span></button></div>
            <div className="mt-12 grid items-stretch gap-5 lg:grid-cols-3">{PRICING_PLANS.map((plan) => { const price = getPlanPrice(plan, interval); return <article key={plan.id} className={`relative flex flex-col rounded-3xl border p-6 text-left transition ${plan.highlight ? 'border-orange-500 bg-orange-500/[0.06] shadow-xl shadow-orange-500/10 lg:-translate-y-3' : isDark ? 'border-white/10 bg-[#0c192b]' : 'border-slate-200 bg-white'}`}>
              {plan.badge && <span className={`absolute -top-3 left-6 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide ${plan.highlight ? 'bg-orange-500 text-white' : 'bg-slate-800 text-white'}`}>{plan.badge}</span>}
              <h3 className="text-xl font-black">{plan.name}</h3><p className={`mt-2 min-h-10 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{plan.description}</p>
              <div className="mt-6 flex items-end gap-1"><span className="text-4xl font-black tracking-tight">{formatThaiBaht(price)}</span><span className={`mb-1 text-sm font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>/{interval === 'yearly' ? 'ปี' : 'เดือน'}</span></div>
              <p className="mt-2 text-sm font-black text-orange-500">{plan.credits.toLocaleString('th-TH')} เครดิตต่อรอบบิล</p>
              <ul className={`mt-6 space-y-3 border-t pt-6 text-sm ${isDark ? 'border-white/10 text-slate-300' : 'border-slate-100 text-slate-600'}`}>{plan.features.map((feature) => <li key={feature} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{feature}</li>)}</ul>
              <button onClick={() => selectPlan(plan.id)} className={`mt-8 w-full rounded-xl px-4 py-3 text-sm font-black transition ${plan.highlight ? 'bg-orange-500 text-white hover:bg-orange-600' : isDark ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-slate-900 text-white hover:bg-slate-700'}`}>เลือก {plan.name}</button>
            </article>; })}</div>
            <p className={`mt-7 text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>PromptPay QR, TrueMoney และ Alipay เป็นการชำระต่อครั้ง; สิทธิ์จะเพิ่มเมื่อผู้ให้บริการยืนยันธุรกรรมแล้ว</p>
          </div>
        </section>

        <section className={`border-y px-5 py-14 ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-slate-200 bg-white'}`}>
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col items-start justify-between gap-5 md:flex-row md:items-end">
              <div><p className="text-xs font-black uppercase tracking-[0.18em] text-orange-500">Payment options</p><h2 className="mt-3 text-2xl font-black">จ่ายด้วยวิธีที่ลูกค้าคุ้นเคย</h2></div>
              <p className={`max-w-md text-sm leading-6 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>เช็กเอาต์จะแสดงวิธีจ่ายที่ร้านเปิดใช้งานจริง และไม่เปิดเผยข้อมูลสำคัญของผู้ใช้</p>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {paymentMethods.map(({ icon: Icon, title, description }) => <div key={title} className={`rounded-2xl border p-4 ${isDark ? 'border-white/10 bg-[#0c192b]' : 'border-slate-200 bg-slate-50'}`}><Icon className="h-5 w-5 text-orange-500" /><p className="mt-4 text-sm font-black">{title}</p><p className={`mt-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{description}</p></div>)}
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-24 px-5 py-20 lg:px-8"><div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[.7fr_1.3fr]"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-orange-500">FAQ</p><h2 className="mt-3 text-3xl font-black tracking-tight">เริ่มต้นแบบมั่นใจ</h2><p className={`mt-4 text-sm leading-6 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>คำตอบสำคัญก่อนเปิดใช้แผนชำระเงิน</p></div><div className="space-y-3">{faqs.map(([question, answer], index) => <div key={question} className={`overflow-hidden rounded-2xl border ${isDark ? 'border-white/10 bg-[#0c192b]' : 'border-slate-200 bg-white'}`}><button onClick={() => setOpenFaq(openFaq === index ? null : index)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-black"><span>{question}</span><ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${openFaq === index ? 'rotate-180 text-orange-500' : ''}`} /></button>{openFaq === index && <p className={`px-5 pb-5 text-sm leading-6 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{answer}</p>}</div>)}</div></div></section>
      </main>

      <footer className={`border-t px-5 py-8 ${isDark ? 'border-white/10 text-slate-500' : 'border-slate-200 text-slate-500'}`}><div className="mx-auto flex max-w-7xl flex-col justify-between gap-2 text-xs sm:flex-row"><span>© {new Date().getFullYear()} PicSeller. Visual commerce for Thai sellers.</span><span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />Payment is confirmed server-side before credits are granted.</span></div></footer>
    </div>
  );
};
