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
import { smartRetry, Type, MODEL_REGISTRY } from './_lib/vertex';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { productInfo, images } = req.body;

    if (!productInfo && (!images || images.length === 0)) {
      return res.status(400).json({ error: 'Provide productInfo or images' });
    }

    // Build multimodal content parts
    const parts: any[] = [];

    if (images && images.length > 0) {
      for (const img of images.slice(0, 5)) {
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
Return as JSON with keys: "name", "summary", "features" (array of strings), "visualDescription".`,
    });

    const result = await smartRetry(async (model, ai) => {
      console.log(`[analyze] Using model: ${model}`);
      const response = await ai.models.generateContent({
        model,
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              summary: { type: Type.STRING },
              features: { type: Type.ARRAY, items: { type: Type.STRING } },
              visualDescription: { type: Type.STRING },
            },
            required: ['name', 'summary', 'features', 'visualDescription'],
          },
        },
      });
      const text = response.text || '{}';
      return JSON.parse(text);
    }, MODEL_REGISTRY.text);

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('[api/analyze] Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
