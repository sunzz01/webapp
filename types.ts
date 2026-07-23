
export enum ImageCategory {
  COVER = 'COVER',
  INFOGRAPHIC = 'INFOGRAPHIC',
  CLOSE_UP = 'CLOSE_UP',
  LIFESTYLE_A = 'LIFESTYLE_A',
  LIFESTYLE_B = 'LIFESTYLE_B',
  LIFESTYLE_C = 'LIFESTYLE_C',
  LIFESTYLE_THAI_STREET_FOOD = 'LIFESTYLE_THAI_STREET_FOOD',
  LIFESTYLE_THAI_MARKET = 'LIFESTYLE_THAI_MARKET',
  LIFESTYLE_THAI_KITCHEN = 'LIFESTYLE_THAI_KITCHEN',
  LIFESTYLE_ISAN_KITCHEN = 'LIFESTYLE_ISAN_KITCHEN',
  LIFESTYLE_THAI_LOCAL_RESTAURANT = 'LIFESTYLE_THAI_LOCAL_RESTAURANT',
  SIZE_CHART = 'SIZE_CHART',
  SOCIAL_PROOF = 'SOCIAL_PROOF',
  TUTORIAL = 'TUTORIAL'
}

export interface ImageStyle {
  id: string;
  name: string;
  description: string;
}

export interface ProductData {
  name: string;
  description: string;
  images: string[];
  /** Optional semantic reference order for multimodal generation (product, package, logo). */
  referenceImages?: string[];
  features: string[];
  price?: ProductPrice;
  variantGroups?: ProductVariantGroup[];
}

export interface ProductPrice {
  currency?: string;
  current?: number;
  min?: number;
  max?: number;
  original?: number;
  display?: string;
}

export interface ProductVariantOption {
  id: string;
  label: string;
  price?: ProductPrice;
  stock?: number;
}

export interface ProductVariantGroup {
  id: string;
  name: string;
  options: ProductVariantOption[];
}

export interface GeneratedImage {
  id: string;
  category: ImageCategory;
  url: string;
  prompt: string;
  status: 'idle' | 'generating' | 'completed' | 'error';
  thaiTexts?: string[];    // ข้อความภาษาไทยที่ควรปรากฏในภาพ (สำหรับอ้างอิงแก้ไขใน Photoshop)
  promptUsed?: string;     // prompt ที่ใช้สร้างภาพจริง
  modelUsed?: string;      // โมเดลจริงที่ backend ใช้ หลัง fallback
  variantLabel?: string;   // ตัวเลือกสินค้า สำหรับภาพที่สร้างแยกรายตัวเลือก
  visualStyle?: string;    // รูปแบบภาพที่เลือกเฉพาะการ์ด
  originalUrl?: string;    // ภาพ AI เดิม ก่อนสร้างแผนภูมิเทียบสเกลแบบ manual
  isManualScale?: boolean; // ผลลัพธ์นี้สร้างจาก Manual Scale Canvas ไม่ใช่การเดาของ AI
  error?: string;          // ข้อความแสดงข้อผิดพลาดถ้ามี
}

// ผลลัพธ์จาก generateProductImage ที่รวมข้อมูลข้อความภาษาไทย
export interface ImageGenerationResult {
  imageUrl: string;
  promptUsed: string;
  thaiTexts: string[];
  modelUsed?: string;
}

// Image Strategy Structure for Platforms
export interface PlatformImageCategory {
  id: ImageCategory;
  title: string;
  desc: string;
  order: number;
}

export const PLATFORM_IMAGE_STRATEGIES: Record<string, { categories: PlatformImageCategory[] }> = {
  // ==================== B2B Platforms ====================
  'alibaba': {
    categories: [
      { id: ImageCategory.COVER, title: 'ภาพหลัก (Main Product)', desc: 'Professional factory/product shot with verification badges', order: 1 },
      { id: ImageCategory.INFOGRAPHIC, title: 'คุณสมบัติโรงงาน (Factory Specs)', desc: 'Production capacity, certifications, MOQ details', order: 2 },
      { id: ImageCategory.CLOSE_UP, title: 'คุณภาพวัสดุ (Material Quality)', desc: 'Close-up of materials, finishes, craftsmanship', order: 3 },
      { id: ImageCategory.LIFESTYLE_A, title: 'การใช้งานในอุตสาหกรรม (Industrial Use)', desc: 'Product in factory/warehouse setting', order: 4 },
      { id: ImageCategory.LIFESTYLE_B, title: 'บรรจุภัณฑ์และจัดส่ง (Packaging/Shipping)', desc: 'Pallets, containers, export packaging', order: 5 },
      { id: ImageCategory.SIZE_CHART, title: 'ขนาดและสเปก (Technical Specs)', desc: 'Detailed measurements, tolerances, diagrams', order: 6 },
      { id: ImageCategory.SOCIAL_PROOF, title: 'ลูกค้าและโครงการ (Client Projects)', desc: 'B2B client testimonials, large projects', order: 7 },
      { id: ImageCategory.TUTORIAL, title: 'การติดตั้ง/ใช้งาน (Installation Guide)', desc: 'Assembly, maintenance instructions', order: 8 },
    ]
  },

  '1688': {
    categories: [
      { id: ImageCategory.COVER, title: 'ภาพรวมสินค้า (Product Overview)', desc: 'Shows all colors/variants in grid format', order: 1 },
      { id: ImageCategory.INFOGRAPHIC, title: 'ราคาขายส่ง (Wholesale Pricing)', desc: 'MOQ price breakdown, bulk discounts', order: 2 },
      { id: ImageCategory.CLOSE_UP, title: 'คุณภาพสินค้า (Product Quality)', desc: 'Material details, stitching, durability', order: 3 },
      { id: ImageCategory.LIFESTYLE_A, title: 'การแสดงสินค้า (Display Setup)', desc: 'How to display in retail/store', order: 4 },
      { id: ImageCategory.SIZE_CHART, title: 'ตารางขนาด (Size Grid)', desc: 'Multiple sizes comparison chart', order: 5 },
      { id: ImageCategory.SOCIAL_PROOF, title: 'คำสั่งซื้อล่าสุด (Recent Orders)', desc: 'Recent bulk order screenshots', order: 6 },
      { id: ImageCategory.TUTORIAL, title: 'ขั้นตอนการสั่งซื้อ (Order Process)', desc: 'How to order, payment, shipping steps', order: 7 },
    ]
  },

  // ==================== Premium Retail Platforms ====================
  'aliexpress': {
    categories: [
      { id: ImageCategory.COVER, title: 'ภาพสินค้าหลัก (Main Product)', desc: 'Clean white background, multiple angles', order: 1 },
      { id: ImageCategory.INFOGRAPHIC, title: 'จุดเด่นสินค้า (Key Features)', desc: '3-5 premium features with icons', order: 2 },
      { id: ImageCategory.CLOSE_UP, title: 'รายละเอียดวัสดุ (Material Close-up)', desc: 'Texture, finish, quality details', order: 3 },
      { id: ImageCategory.LIFESTYLE_A, title: 'การใช้งานในชีวิตประจำวัน (Daily Use)', desc: 'Product in home/domestic setting', order: 4 },
      { id: ImageCategory.LIFESTYLE_B, title: 'การใช้งานมืออาชีพ (Professional Use)', desc: 'Product in office/business context', order: 5 },
      { id: ImageCategory.SIZE_CHART, title: 'ขนาดและข้อมูลจำเพาะ (Specifications)', desc: 'Accurate measurements with scale', order: 6 },
      { id: ImageCategory.SOCIAL_PROOF, title: 'รีวิวลูกค้า (Customer Reviews)', desc: '5-star review highlights', order: 7 },
      { id: ImageCategory.TUTORIAL, title: 'วิธีการสั่งซื้อ (How to Order)', desc: 'Step-by-step purchase guide', order: 8 },
    ]
  },

  'minimalist': {
    categories: [
      { id: ImageCategory.COVER, title: 'ภาพหลัก (Hero Shot)', desc: 'Minimal white background, perfect lighting', order: 1 },
      { id: ImageCategory.INFOGRAPHIC, title: 'ดีไซน์และฟังก์ชัน (Design Features)', desc: '1-2 key design innovations', order: 2 },
      { id: ImageCategory.CLOSE_UP, title: 'รายละเอียดการผลิต (Craftsmanship)', desc: 'Precision details, material joints', order: 3 },
      { id: ImageCategory.LIFESTYLE_A, title: 'การจัดวางในพื้นที่ (In Context)', desc: 'Product in minimalist interior', order: 4 },
      { id: ImageCategory.SIZE_CHART, title: 'มิติและสัดส่วน (Dimensions)', desc: 'Clean dimensional drawings', order: 5 },
      { id: ImageCategory.SOCIAL_PROOF, title: 'การรับรอง (Awards/Certifications)', desc: 'Design awards, quality certifications', order: 6 },
    ]
  },

  // ==================== Social Commerce Platforms ====================
  'taobao': {
    categories: [
      { id: ImageCategory.COVER, title: 'ภาพรวมครบทุกมุม (Full Product View)', desc: 'Multiple angles in one composite image', order: 1 },
      { id: ImageCategory.INFOGRAPHIC, title: 'เปรียบเทียบคุณสมบัติ (Feature Comparison)', desc: 'Vs competitors, value for money', order: 2 },
      { id: ImageCategory.CLOSE_UP, title: 'รายละเอียดสำคัญ (Key Details)', desc: 'Important functional details', order: 3 },
      { id: ImageCategory.LIFESTYLE_A, title: 'การใช้งานจริง (Real Usage)', desc: 'In various real-life scenarios', order: 4 },
      { id: ImageCategory.LIFESTYLE_B, title: 'สไตล์การแต่งตัว (Styling Ideas)', desc: 'How to style with other items', order: 5 },
      { id: ImageCategory.SIZE_CHART, title: 'ตารางวัดขนาด (Measurement Chart)', desc: 'Detailed with body measurements', order: 6 },
      { id: ImageCategory.SOCIAL_PROOF, title: 'รีวิวและออเดอร์จริง (Live Reviews)', desc: 'Real customer photos/orders', order: 7 },
      { id: ImageCategory.TUTORIAL, title: 'วิธีเลือกซื้อ (Buying Guide)', desc: 'How to choose the right variant', order: 8 },
    ]
  },

  'pinduoduo': {
    categories: [
      { id: ImageCategory.COVER, title: 'ภาพโปรโมชั่น (Promotional Banner)', desc: 'Vibrant colors, group buy discounts', order: 1 },
      { id: ImageCategory.INFOGRAPHIC, title: 'เปรียบเทียบราคา (Price Comparison)', desc: 'Before/after group buy price', order: 2 },
      { id: ImageCategory.CLOSE_UP, title: 'คุณภาพในราคา (Value Details)', desc: 'Shows quality despite low price', order: 3 },
      { id: ImageCategory.LIFESTYLE_A, title: 'การใช้งานในครอบครัว (Family Use)', desc: 'Multiple people using product', order: 4 },
      { id: ImageCategory.SIZE_CHART, title: 'ขนาดและจำนวน (Quantity Info)', desc: 'Shows what you get for price', order: 5 },
      { id: ImageCategory.SOCIAL_PROOF, title: 'จำนวนผู้ร่วมกลุ่ม (Group Stats)', desc: 'How many people joined deal', order: 6 },
      { id: ImageCategory.TUTORIAL, title: 'วิธีเข้าร่วมกลุ่ม (How to Join)', desc: 'Step-by-step joining guide', order: 7 },
    ]
  },

  // ==================== Niche/C2C Platforms ====================
  'etsy': {
    categories: [
      { id: ImageCategory.COVER, title: 'ภาพสร้างสรรค์ (Creative Shot)', desc: 'Artistic, story-telling composition', order: 1 },
      { id: ImageCategory.INFOGRAPHIC, title: 'กระบวนการสร้าง (Creation Process)', desc: 'How it\'s made, materials used', order: 2 },
      { id: ImageCategory.CLOSE_UP, title: 'รายละเอียดหัตถกรรม (Artisan Details)', desc: 'Handmade details, unique features', order: 3 },
      { id: ImageCategory.LIFESTYLE_A, title: 'การใช้งานในบ้าน (Home Lifestyle)', desc: 'Cozy, warm home setting', order: 4 },
      { id: ImageCategory.LIFESTYLE_B, title: 'ของขวัญและการแพค (Gift Packaging)', desc: 'How it looks as a gift', order: 5 },
      { id: ImageCategory.SIZE_CHART, title: 'ขนาดและสัดส่วน (Dimensions)', desc: 'Natural scale references', order: 6 },
      { id: ImageCategory.SOCIAL_PROOF, title: 'เรื่องราวลูกค้า (Customer Stories)', desc: 'Personalized customer photos', order: 7 },
      { id: ImageCategory.TUTORIAL, title: 'การดูแลรักษา (Care Guide)', desc: 'How to maintain product', order: 8 },
    ]
  },

  'xianyu': {
    categories: [
      { id: ImageCategory.COVER, title: 'ภาพจริงของสินค้า (Actual Product)', desc: 'Honest shot showing condition', order: 1 },
      { id: ImageCategory.CLOSE_UP, title: 'จุดที่เสียหรือสึกหรอ (Flaw Details)', desc: 'Close-up of any imperfections', order: 2 },
      { id: ImageCategory.INFOGRAPHIC, title: 'ข้อมูลการใช้งาน (Usage Info)', desc: 'How much used, why selling', order: 3 },
      { id: ImageCategory.LIFESTYLE_A, title: 'ภาพในสถานที่จริง (Current Location)', desc: 'Where item is stored/used', order: 4 },
      { id: ImageCategory.SIZE_CHART, title: 'ขนาดจริง (Actual Size)', desc: 'Comparison with common objects', order: 5 },
      { id: ImageCategory.TUTORIAL, title: 'วิธีการส่ง (Shipping Method)', desc: 'How it will be packaged/sent', order: 6 },
    ]
  },
};

// Default Metadata for Fallback
export const IMAGE_CATEGORIES_METADATA: Record<ImageCategory, { title: string; desc: string; order: number }> = {
  [ImageCategory.COVER]: { title: 'ภาพปก (Cover)', desc: 'Alibaba/AliExpress/Etsy Style', order: 1 },
  [ImageCategory.INFOGRAPHIC]: { title: 'จุดเด่น (Infographic)', desc: '3-5 key features', order: 2 },
  [ImageCategory.CLOSE_UP]: { title: 'รายละเอียด (Close-up)', desc: 'Zoom textures/materials', order: 3 },
  [ImageCategory.LIFESTYLE_A]: { title: 'การใช้งานจริง A (Home)', desc: 'Indoor / Cozy setting', order: 4 },
  [ImageCategory.LIFESTYLE_B]: { title: 'การใช้งานจริง B (Outdoor)', desc: 'Nature / Outside setting', order: 5 },
  [ImageCategory.LIFESTYLE_C]: { title: 'การใช้งานจริง C (Professional)', desc: 'Office / Urban setting', order: 6 },
  [ImageCategory.LIFESTYLE_THAI_STREET_FOOD]: { title: 'Thai Street Food', desc: 'สตรีทฟู้ดไทย / รถเข็น', order: 7 },
  [ImageCategory.LIFESTYLE_THAI_MARKET]: { title: 'Thai Market', desc: 'ตลาดสดไทย / ตลาดนัด', order: 8 },
  [ImageCategory.LIFESTYLE_THAI_KITCHEN]: { title: 'Thai Kitchen', desc: 'ครัวไทย / ทำอาหารไทย', order: 9 },
  [ImageCategory.LIFESTYLE_ISAN_KITCHEN]: { title: 'Isan Kitchen', desc: 'ครัวอีสาน / ส้มตำ', order: 10 },
  [ImageCategory.LIFESTYLE_THAI_LOCAL_RESTAURANT]: { title: 'Thai Local Restaurant', desc: 'ร้านอาหารท้องถิ่นไทย', order: 11 },
  [ImageCategory.SIZE_CHART]: { title: 'ขนาด/สเปก (Size Chart)', desc: 'Comparison/Scale', order: 12 },
  [ImageCategory.SOCIAL_PROOF]: { title: 'รีวิว (Social Proof)', desc: 'Customer satisfaction', order: 13 },
  [ImageCategory.TUTORIAL]: { title: 'วิธีใช้งาน (Tutorial)', desc: 'How to use / Gifts', order: 14 },
};

// Helper function to get platform-specific categories
export function getPlatformCategories(platform: string) {
  return PLATFORM_IMAGE_STRATEGIES[platform as keyof typeof PLATFORM_IMAGE_STRATEGIES]?.categories
    || Object.values(IMAGE_CATEGORIES_METADATA).map((cat, index) => ({
      id: Object.keys(IMAGE_CATEGORIES_METADATA)[index] as ImageCategory,
      ...cat
    }));
}
