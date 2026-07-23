import React from 'react';
import { COLOR_LOGOS } from '@thai-qr-payment/assets';

export type PaymentBrand = 'promptpay' | 'truemoney' | 'alipay' | 'stripe' | 'card';

const externalBrands: Partial<Record<PaymentBrand, { src: string; alt: string; className?: string }>> = {
  truemoney: {
    src: 'https://www.truemoney.com/wp-content/uploads/2023/02/truemoney_logo_2x.png',
    alt: 'TrueMoney',
    className: 'object-contain',
  },
  alipay: {
    src: 'https://cdn.simpleicons.org/alipay/1677FF',
    alt: 'Alipay',
    className: 'object-contain',
  },
  stripe: {
    src: 'https://cdn.simpleicons.org/stripe/635BFF',
    alt: 'Stripe',
    className: 'object-contain',
  },
};

/** Renders provider artwork instead of a generic UI icon. */
export const PaymentBrandLogo: React.FC<{ brand: PaymentBrand; className?: string }> = ({ brand, className = 'h-7 w-12' }) => {
  if (brand === 'promptpay') {
    return <span className={`${className} inline-flex items-center justify-center overflow-hidden`} aria-label="PromptPay" role="img" dangerouslySetInnerHTML={{ __html: COLOR_LOGOS.PromptPay1 }} />;
  }

  if (brand === 'card') {
    return <span className={`${className} inline-flex items-center justify-center rounded-md bg-slate-900 px-1.5 text-[10px] font-black tracking-tight text-white`} aria-label="Credit and debit cards">VISA&nbsp;MC</span>;
  }

  const logo = externalBrands[brand]!;
  return <img src={logo.src} alt={logo.alt} className={`${className} ${logo.className || ''}`} loading="lazy" referrerPolicy="no-referrer" />;
};
