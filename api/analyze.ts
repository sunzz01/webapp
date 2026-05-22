/**
 * POST /api/analyze
 * 
 * Analyze product info and extract key selling points using Vertex AI Gemini.
 * 
 * Request body:
 *   { productInfo: string, images?: string[] }
 * 
 * Response:
 *   { name, summary, features, visualDescription }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { smartRetry, MODEL_REGISTRY } from './_lib/vertex.js';
import { generateGeminiText } from './_lib/geminiFallback.js';
import { requireFirebaseUser } from './_lib/firebaseAdmin.js';

function extractVertexText(response: any): string {
  return response?.response?.candidates?.[0]?.content?.parts
    ?.map((part: any) => part.text || '')
    .join('')
    .trim() || '';
}

function parseJsonResponse(text: string) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned || '{}');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
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
    await requireFirebaseUser(req);

    const { productInfo, images } = req.body;

    if (!productInfo && (!images || images.length === 0)) {
      return res.status(400).json({ error: 'Provide productInfo or images' });
    }

    // Build multimodal content parts
    const parts: any[] = [];

    if (images && images.length > 0) {
      for (const img of images.slice(0, 4)) {
        const base64Data = img.includes('base64,') ? img.split('base64,')[1] : img;
        parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: base64Data,
          },
        });
      }
    }

    parts.push({
      text: `Analyze this Shopee product based on the provided ${images?.length ? 'images and ' : ''}description.
Product Info: ${productInfo || 'No text description provided, please analyze the images.'}
Extract 3-5 key selling points (features) and a concise visual description of the product for image generation.
Return valid JSON only. Do not include markdown fences.
JSON keys: "name", "summary", "features" (array of strings), "visualDescription".`,
    });

    let result: any;
    try {
      result = await smartRetry(async (model, ai) => {
        console.log(`[analyze] Using Vertex model: ${model}`);
        const generativeModel = ai.getGenerativeModel({
          model,
          generationConfig: {
            responseMimeType: 'application/json',
          },
        });

        const response = await generativeModel.generateContent({
          contents: [{ role: 'user', parts }],
        });
        return parseJsonResponse(extractVertexText(response));
      }, MODEL_REGISTRY.text);
    } catch (vertexError: any) {
      console.warn('[analyze] Vertex failed, trying Gemini API fallback:', vertexError?.message || vertexError);
      result = parseJsonResponse(await generateGeminiText(parts, true));
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('[api/analyze] Error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
  }
}
