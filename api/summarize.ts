/**
 * POST /api/summarize
 * 
 * Summarize product description for compelling marketing copy using Vertex AI.
 * 
 * Request body:
 *   {
 *     currentDesc: string,
 *     images?: string[],
 *     summaryLength?: 'short' | 'medium' | 'long'
 *   }
 * 
 * Response:
 *   { summary: string }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { smartRetry, MODEL_REGISTRY } from './_lib/vertex.js';
import { generateGeminiText } from './_lib/geminiFallback.js';
import { requireFirebaseUser } from './_lib/firebaseAdmin.js';
import { resolveImageParts } from './_lib/storageImages.js';

function extractVertexText(response: any): string {
  return response?.response?.candidates?.[0]?.content?.parts
    ?.map((part: any) => part.text || '')
    .join('')
    .trim() || '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const firebaseUser = await requireFirebaseUser(req);

    const { currentDesc, images, storagePaths, summaryLength = 'medium' } = req.body;

    if (!currentDesc && (!images?.length && !storagePaths?.length)) {
      return res.status(400).json({ error: 'Provide currentDesc or images' });
    }

    const parts: any[] = [];

    // Add images if available
    parts.push(...await resolveImageParts(firebaseUser.uid, images, storagePaths));

    const lengthInstructions: Record<string, string> = {
      short: `Format (สั้นกระชับ):
      - **จุดเด่นสินค้า**: (2-3 bullet points สั้นๆ)
      - **คำขาย (Hook)**: (Catchy one-liner)
      - ไม่ต้องมีรายละเอียดยาว ให้สั้นกระชับ เน้นจุดขายหลัก`,
      medium: `Format (ปานกลาง):
      - **จุดเด่นสินค้า**: (3-5 bullet points)
      - **รายละเอียด**: (Short paragraph 2-3 ประโยค)
      - **คำขาย (Hook)**: (Catchy one-liner)`,
      long: `Format (ละเอียด):
      - **จุดเด่นสินค้า**: (5-7 bullet points ละเอียด)
      - **รายละเอียด**: (Detailed paragraph อธิบายครบถ้วน 4-6 ประโยค)
      - **วิธีใช้งาน**: (ถ้ามี 2-3 ขั้นตอน)
      - **คำขาย (Hook)**: (Catchy one-liner)`,
    };

    parts.push({
      text: `You are a professional e-commerce copywriter. Analyze the provided product description and/or images.
Input Description: "${currentDesc || ''}"

Task: Write a compelling, concise, and attractive product summary in Thai (ภาษาไทย).
${lengthInstructions[summaryLength]}
- Use emojis to make it engaging.
- Keep it ready for use in Shopee/Lazada product description.

Output strictly the summary text.`,
    });

    let result = '';
    try {
      result = await smartRetry(async (model, ai) => {
        console.log(`[summarize] Using Vertex model: ${model}`);
        const generativeModel = ai.getGenerativeModel({ model });

        const response = await generativeModel.generateContent({
          contents: [{ role: 'user', parts }],
        });
        return extractVertexText(response);
      }, MODEL_REGISTRY.text);
    } catch (vertexError: any) {
      console.warn('[summarize] Vertex failed, trying Gemini API fallback:', vertexError?.message || vertexError);
      result = await generateGeminiText(parts);
    }

    return res.status(200).json({ summary: result });
  } catch (error: any) {
    console.error('[api/summarize] Error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
  }
}
