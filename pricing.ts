export type PlanId = 'starter' | 'pro' | 'business';
export type BillingInterval = 'monthly' | 'yearly';
export type SubscriptionTier = 'starter' | 'pro' | 'enterprise';

export type PricingPlan = {
  id: PlanId;
  name: string;
  tier: SubscriptionTier;
  monthlyPrice: number;
  yearlyPrice: number;
  credits: number;
  description: string;
  highlight?: boolean;
  badge?: string;
  features: string[];
};

/**
 * The single source of truth for amounts shown in the UI and charged by the API.
 * Prices are in Thai baht.  The payment API always converts them to satang itself.
 */
export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    tier: 'starter',
    monthlyPrice: 299,
    yearlyPrice: 2_990,
    credits: 80,
    description: 'เริ่มทำภาพขายสินค้าให้ดูมืออาชีพ',
    features: [
      '80 เครดิตต่อรอบบิล',
      'สร้างภาพสินค้าและ Thai Ads',
      'AI ช่วยเขียนรายละเอียดสินค้า',
      'ส่งข้อมูลจาก Gimi-Shopee X ได้',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tier: 'pro',
    monthlyPrice: 799,
    yearlyPrice: 7_990,
    credits: 300,
    description: 'สำหรับร้านที่ต้องทำคอนเทนต์ทุกสัปดาห์',
    highlight: true,
    badge: 'คุ้มค่าที่สุด',
    features: [
      '300 เครดิตต่อรอบบิล',
      'ทุกความสามารถของ Starter',
      'สร้างชุดภาพหลายตัวเลือกสินค้า',
      'Size Chart และปรับสเกลจริง',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    tier: 'enterprise',
    monthlyPrice: 1_990,
    yearlyPrice: 19_900,
    credits: 1_000,
    description: 'สำหรับทีมและร้านที่ทำแคมเปญต่อเนื่อง',
    badge: 'สำหรับทีม',
    features: [
      '1,000 เครดิตต่อรอบบิล',
      'ทุกความสามารถของ Pro',
      'สิทธิ์สำหรับงานปริมาณมาก',
      'ลำดับการช่วยเหลือก่อน',
    ],
  },
];

export function findPricingPlan(planId: string | undefined | null): PricingPlan | undefined {
  return PRICING_PLANS.find((plan) => plan.id === planId);
}

export function getPlanPrice(plan: PricingPlan, interval: BillingInterval): number {
  return interval === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
}

export function formatThaiBaht(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
