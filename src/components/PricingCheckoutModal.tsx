import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  CircleDollarSign,
  CreditCard,
  Loader2,
  LockKeyhole,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import { BillingInterval, formatThaiBaht, getPlanPrice, PlanId, PRICING_PLANS } from '../../pricing';
import { useTheme } from '../contexts/ThemeContext';
import { CheckoutResponse, createCheckout, getBillingStatus, getPaymentConfig, PaymentConfig, PaymentMethod, tokenizeOpnCard } from '../payments/client';

interface PricingCheckoutModalProps {
  initialPlanId?: PlanId;
  onClose: () => void;
  onPaymentConfirmed: () => Promise<void> | void;
}

type CardForm = { name: string; number: string; month: string; year: string; cvc: string };

const methods: { id: PaymentMethod; title: string; description: string; icon: typeof QrCode }[] = [
  { id: 'promptpay', title: 'PromptPay QR', description: 'สแกนจ่ายผ่านแอปธนาคาร', icon: QrCode },
  { id: 'truemoney', title: 'TrueMoney Wallet', description: 'ยืนยันด้วยเบอร์ Wallet', icon: Smartphone },
  { id: 'card', title: 'บัตรเครดิต / เดบิต', description: 'Visa, Mastercard และบัตรที่ผู้ให้บริการรองรับ', icon: CreditCard },
  { id: 'alipay', title: 'Alipay', description: 'ชำระผ่าน Alipay อย่างปลอดภัย', icon: CircleDollarSign },
];

export const PricingCheckoutModal: React.FC<PricingCheckoutModalProps> = ({ initialPlanId = 'pro', onClose, onPaymentConfirmed }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [planId, setPlanId] = useState<PlanId>(initialPlanId);
  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const [method, setMethod] = useState<PaymentMethod>('promptpay');
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [checkout, setCheckout] = useState<CheckoutResponse | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [card, setCard] = useState<CardForm>({ name: '', number: '', month: '', year: '', cvc: '' });
  const [confirmed, setConfirmed] = useState(false);

  const selectedPlan = useMemo(() => PRICING_PLANS.find((plan) => plan.id === planId) || PRICING_PLANS[1], [planId]);
  const price = getPlanPrice(selectedPlan, interval);

  useEffect(() => {
    let mounted = true;
    getPaymentConfig()
      .then((nextConfig) => {
        if (!mounted) return;
        setConfig(nextConfig);
        const firstEnabled = methods.find((item) => nextConfig.enabled[item.id]);
        if (firstEnabled) setMethod(firstEnabled.id);
      })
      .catch((nextError: Error) => mounted && setError(nextError.message))
      .finally(() => mounted && setLoadingConfig(false));
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!checkout?.orderId || confirmed) return;
    let cancelled = false;
    const checkStatus = async () => {
      try {
        const status = await getBillingStatus(checkout.orderId);
        if (cancelled) return;
        if (status.order?.status === 'successful') {
          setConfirmed(true);
          await onPaymentConfirmed();
        } else if (status.order?.status === 'failed' || status.order?.status === 'expired') {
          setError(status.order.status === 'expired' ? 'QR หรือรายการชำระเงินหมดอายุแล้ว กรุณาสร้างรายการใหม่' : 'รายการชำระเงินไม่สำเร็จ กรุณาลองอีกครั้ง');
        }
      } catch {
        // QR may still be awaiting authorization. The next polling cycle retries silently.
      }
    };
    void checkStatus();
    const timer = window.setInterval(() => void checkStatus(), 4_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [checkout?.orderId, confirmed, onPaymentConfirmed]);

  const submit = async () => {
    setError('');
    if (!config?.enabled[method]) {
      setError('ช่องทางนี้ยังไม่ได้เปิดใช้งานใน merchant account');
      return;
    }
    if (method === 'truemoney' && !phoneNumber.trim()) {
      setError('กรุณากรอกหมายเลขโทรศัพท์ที่ผูกกับ TrueMoney Wallet');
      return;
    }

    setSubmitting(true);
    try {
      let cardToken: string | undefined;
      if (method === 'card') {
        if (!config.publicKey) throw new Error('ระบบรับบัตรยังไม่ได้ตั้งค่า public key');
        if (!card.name || !card.number || !card.month || !card.year || !card.cvc) {
          throw new Error('กรุณากรอกข้อมูลบัตรให้ครบถ้วน');
        }
        cardToken = await tokenizeOpnCard(config.publicKey, {
          name: card.name,
          number: card.number,
          expirationMonth: card.month,
          expirationYear: card.year,
          securityCode: card.cvc,
        });
      }
      const result = await createCheckout({ planId, interval, paymentMethod: method, cardToken, mobileNumber: phoneNumber });
      setCheckout(result);
      if (result.checkout.kind === 'redirect' && result.checkout.authorizeUri) {
        window.location.assign(result.checkout.authorizeUri);
      }
    } catch (nextError: any) {
      setError(nextError?.message || 'ไม่สามารถเริ่มการชำระเงินได้');
    } finally {
      setSubmitting(false);
    }
  };

  const panelClass = isDark ? 'border-white/10 bg-[#111e32] text-white' : 'border-slate-200 bg-white text-slate-900';
  const mutedClass = isDark ? 'text-slate-400' : 'text-slate-500';

  return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/65 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label="เลือกแพ็กเกจและชำระเงิน">
    <div className={`max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-t-3xl border shadow-2xl sm:rounded-3xl ${panelClass}`}>
      <div className={`sticky top-0 z-10 flex items-center justify-between border-b px-5 py-4 backdrop-blur sm:px-7 ${isDark ? 'border-white/10 bg-[#111e32]/95' : 'border-slate-100 bg-white/95'}`}>
        <div className="flex items-center gap-3"><span className="rounded-xl bg-orange-500/10 p-2 text-orange-500"><Sparkles className="h-5 w-5" /></span><div><h2 className="text-base font-black">อัปเกรด PicSeller</h2><p className={`text-xs ${mutedClass}`}>เลือกแพ็กเกจและช่องทางชำระเงิน</p></div></div>
        <button onClick={onClose} className={`rounded-xl p-2 transition ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`} aria-label="ปิด"><X className="h-5 w-5" /></button>
      </div>

      {confirmed ? <div className="px-5 py-14 text-center sm:px-10"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500"><CheckCircle2 className="h-9 w-9" /></span><h3 className="mt-5 text-2xl font-black">ชำระเงินสำเร็จ</h3><p className={`mx-auto mt-3 max-w-md text-sm leading-6 ${mutedClass}`}>สิทธิ์ของคุณได้รับการอัปเดตแล้ว คุณสามารถเริ่มสร้างภาพต่อได้ทันที</p><button onClick={onClose} className="mt-7 rounded-xl bg-orange-500 px-5 py-3 text-sm font-black text-white hover:bg-orange-600">กลับไปที่ Studio</button></div> : checkout?.checkout.kind === 'qr' && checkout.checkout.qrImageUrl ? <div className="px-5 py-8 sm:px-10"><button onClick={() => { setCheckout(null); setError(''); }} className={`mb-6 inline-flex items-center gap-1 text-sm font-bold ${mutedClass} hover:text-orange-500`}><ChevronLeft className="h-4 w-4" />เปลี่ยนวิธีชำระเงิน</button><div className="mx-auto max-w-md text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-500"><QrCode className="h-6 w-6" /></span><h3 className="mt-4 text-xl font-black">สแกน QR เพื่อชำระเงิน</h3><p className={`mt-2 text-sm ${mutedClass}`}>หลังชำระสำเร็จ ระบบจะตรวจสอบและเพิ่มเครดิตให้อัตโนมัติ</p><div className="mx-auto mt-6 w-fit rounded-2xl bg-white p-3 shadow-inner"><img className="h-60 w-60 rounded-xl object-contain" src={checkout.checkout.qrImageUrl} alt="PromptPay payment QR code" /></div><div className={`mt-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${isDark ? 'bg-amber-400/10 text-amber-300' : 'bg-amber-50 text-amber-700'}`}><Loader2 className="h-3.5 w-3.5 animate-spin" />กำลังรอยืนยันการชำระเงิน</div></div></div> : <div className="grid gap-0 lg:grid-cols-[1.06fr_.94fr]">
        <div className="p-5 sm:p-7"><div className="flex items-center justify-between"><h3 className="font-black">1. เลือกแพ็กเกจ</h3><span className={`text-xs font-bold ${mutedClass}`}>{interval === 'yearly' ? 'รายปี' : 'รายเดือน'}</span></div>
          <div className={`mt-4 inline-flex rounded-xl p-1 ${isDark ? 'bg-white/5' : 'bg-slate-100'}`}><button onClick={() => setInterval('monthly')} className={`rounded-lg px-3 py-2 text-xs font-black ${interval === 'monthly' ? 'bg-orange-500 text-white' : mutedClass}`}>รายเดือน</button><button onClick={() => setInterval('yearly')} className={`rounded-lg px-3 py-2 text-xs font-black ${interval === 'yearly' ? 'bg-orange-500 text-white' : mutedClass}`}>รายปี</button></div>
          <div className="mt-4 grid gap-3">{PRICING_PLANS.map((plan) => <button key={plan.id} onClick={() => setPlanId(plan.id)} className={`relative flex w-full items-center justify-between rounded-2xl border p-4 text-left transition ${planId === plan.id ? 'border-orange-500 bg-orange-500/[0.06] ring-1 ring-orange-500' : isDark ? 'border-white/10 hover:border-white/25' : 'border-slate-200 hover:border-slate-300'}`}><span><span className="block text-sm font-black">{plan.name}</span><span className={`mt-0.5 block text-xs ${mutedClass}`}>{plan.credits.toLocaleString('th-TH')} เครดิต / รอบบิล</span></span><span className="text-right"><span className="block text-base font-black">{formatThaiBaht(getPlanPrice(plan, interval))}</span><span className={`block text-[10px] font-bold ${mutedClass}`}>/{interval === 'yearly' ? 'ปี' : 'เดือน'}</span></span>{plan.highlight && <span className="absolute -top-2 left-4 rounded-full bg-orange-500 px-2 py-0.5 text-[9px] font-black text-white">แนะนำ</span>}</button>)}</div>
          <div className={`mt-7 border-t pt-6 ${isDark ? 'border-white/10' : 'border-slate-100'}`}><h3 className="font-black">2. เลือกวิธีชำระเงิน</h3>{loadingConfig ? <div className={`mt-4 flex items-center gap-2 rounded-xl p-3 text-sm ${isDark ? 'bg-white/5' : 'bg-slate-50'}`}><Loader2 className="h-4 w-4 animate-spin text-orange-500" />กำลังตรวจสอบช่องทางรับชำระเงิน…</div> : <div className="mt-4 grid gap-2">{methods.map(({ id, title, description, icon: Icon }) => { const enabled = Boolean(config?.enabled[id]); return <button key={id} disabled={!enabled} onClick={() => setMethod(id)} className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${method === id ? 'border-orange-500 bg-orange-500/[0.06]' : isDark ? 'border-white/10' : 'border-slate-200'} ${enabled ? 'hover:border-orange-300' : 'cursor-not-allowed opacity-45'}`}><span className="rounded-lg bg-orange-500/10 p-2 text-orange-500"><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-black">{title}</span><span className={`block text-[11px] ${mutedClass}`}>{description}</span></span><span className={`h-4 w-4 rounded-full border-2 ${method === id ? 'border-orange-500 bg-orange-500 ring-2 ring-orange-500/25' : isDark ? 'border-slate-600' : 'border-slate-300'}`} /></button>; })}</div>}</div>
          {method === 'truemoney' && <label className="mt-4 block"><span className="text-xs font-black">เบอร์ TrueMoney Wallet</span><input value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} inputMode="tel" placeholder="08x-xxx-xxxx" className={`mt-2 w-full rounded-xl border px-3 py-3 text-sm outline-none focus:border-orange-500 ${isDark ? 'border-white/10 bg-white/5 placeholder:text-slate-600' : 'border-slate-200 bg-white placeholder:text-slate-400'}`} /></label>}
          {method === 'card' && <div className={`mt-4 rounded-2xl border p-4 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-slate-100 bg-slate-50'}`}><div className="mb-3 flex items-center gap-2 text-xs font-bold text-emerald-600"><LockKeyhole className="h-4 w-4" />ข้อมูลบัตรส่งไปยังผู้ให้บริการรับชำระเงินโดยตรง</div><div className="grid gap-3"><input value={card.name} onChange={(event) => setCard({ ...card, name: event.target.value })} placeholder="ชื่อบนบัตร" className={`rounded-xl border px-3 py-3 text-sm outline-none focus:border-orange-500 ${isDark ? 'border-white/10 bg-white/5 placeholder:text-slate-600' : 'border-slate-200 bg-white placeholder:text-slate-400'}`} /><input value={card.number} onChange={(event) => setCard({ ...card, number: event.target.value })} inputMode="numeric" placeholder="เลขบัตร" className={`rounded-xl border px-3 py-3 text-sm outline-none focus:border-orange-500 ${isDark ? 'border-white/10 bg-white/5 placeholder:text-slate-600' : 'border-slate-200 bg-white placeholder:text-slate-400'}`} /><div className="grid grid-cols-3 gap-2"><input value={card.month} onChange={(event) => setCard({ ...card, month: event.target.value })} inputMode="numeric" maxLength={2} placeholder="MM" className={`rounded-xl border px-3 py-3 text-sm outline-none focus:border-orange-500 ${isDark ? 'border-white/10 bg-white/5 placeholder:text-slate-600' : 'border-slate-200 bg-white placeholder:text-slate-400'}`} /><input value={card.year} onChange={(event) => setCard({ ...card, year: event.target.value })} inputMode="numeric" maxLength={4} placeholder="YYYY" className={`rounded-xl border px-3 py-3 text-sm outline-none focus:border-orange-500 ${isDark ? 'border-white/10 bg-white/5 placeholder:text-slate-600' : 'border-slate-200 bg-white placeholder:text-slate-400'}`} /><input value={card.cvc} onChange={(event) => setCard({ ...card, cvc: event.target.value })} inputMode="numeric" maxLength={4} placeholder="CVC" className={`rounded-xl border px-3 py-3 text-sm outline-none focus:border-orange-500 ${isDark ? 'border-white/10 bg-white/5 placeholder:text-slate-600' : 'border-slate-200 bg-white placeholder:text-slate-400'}`} /></div></div></div>}
        </div>
        <aside className={`border-t p-5 lg:border-l lg:border-t-0 lg:p-7 ${isDark ? 'border-white/10 bg-black/10' : 'border-slate-100 bg-slate-50/70'}`}><p className={`text-xs font-black uppercase tracking-[0.14em] ${mutedClass}`}>สรุปรายการ</p><h3 className="mt-3 text-xl font-black">PicSeller {selectedPlan.name}</h3><p className={`mt-1 text-sm ${mutedClass}`}>{selectedPlan.credits.toLocaleString('th-TH')} เครดิตต่อรอบบิล</p><div className={`my-6 border-y py-4 ${isDark ? 'border-white/10' : 'border-slate-200'}`}><div className="flex justify-between text-sm"><span className={mutedClass}>แพ็กเกจ {interval === 'yearly' ? 'รายปี' : 'รายเดือน'}</span><span className="font-black">{formatThaiBaht(price)}</span></div><div className="mt-3 flex justify-between text-base font-black"><span>ยอดชำระวันนี้</span><span className="text-orange-500">{formatThaiBaht(price)}</span></div></div>{error && <div className={`mb-4 flex gap-2 rounded-xl p-3 text-xs leading-5 ${isDark ? 'bg-rose-500/10 text-rose-200' : 'bg-rose-50 text-rose-700'}`}><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}<button disabled={loadingConfig || submitting || !config?.enabled[method]} onClick={() => void submit()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3.5 text-sm font-black text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? <><Loader2 className="h-4 w-4 animate-spin" />กำลังสร้างรายการ…</> : <>ดำเนินการชำระเงิน <ShieldCheck className="h-4 w-4" /></>}</button><p className={`mt-4 text-center text-[11px] leading-5 ${mutedClass}`}>กดชำระเงินแล้วระบบจะสร้างรายการจากราคาฝั่งเซิร์ฟเวอร์ และเพิ่มเครดิตเมื่อยืนยันสำเร็จเท่านั้น</p></aside>
      </div>}
    </div>
  </div>;
};
