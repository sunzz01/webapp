/**
 * POST /api/generate-image
 * 
 * Generate product images using Vertex AI (Imagen 3 or Gemini native image gen).
 * 
 * Request body:
 *   {
 *     prompt: string,
 *     images?: string[],        // source product images (base64)
 *     model?: string,           // optional model override
 *     aspectRatio?: string,     // "1:1" | "4:5" | "16:9" | "9:16" | "3:4"
 *     category?: string,        // image category
 *     style?: string,           // ecommerce style
 *     productData?: object,     // for prompt construction
 *     customPrompt?: string,    // user-provided custom prompt
 *   }
 * 
 * Response:
 *   { imageUrl: string, promptUsed: string, model: string }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { smartRetry, MODEL_REGISTRY, getVertexAI } from './_lib/vertex';

// Aspect ratio descriptions for prompt enhancement
const RATIO_DESCRIPTIONS: Record<string, string> = {
  '1:1': 'square format (1:1 aspect ratio)',
  '4:5': 'portrait format (4:5 aspect ratio)',
  '9:16': 'vertical portrait format (9:16 aspect ratio, mobile/story)',
  '16:9': 'landscape widescreen format (16:9 aspect ratio)',
  '3:4': 'portrait format (3:4 aspect ratio)',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
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
    const {
      prompt,
      images,
      model,
      aspectRatio = '1:1',
      customPrompt,
    } = req.body;

    if (!prompt && !customPrompt) {
      return res.status(400).json({ error: 'Provide prompt or customPrompt' });
    }

    const ratioDesc = RATIO_DESCRIPTIONS[aspectRatio] || RATIO_DESCRIPTIONS['1:1'];

    // Build the final prompt with aspect ratio instruction
    const finalPrompt = (customPrompt || prompt) +
      `\n\nIMPORTANT: Generate this image in ${ratioDesc}. The canvas must be ${aspectRatio} ratio.`;

    // Build image parts from source images
    const imageParts: any[] = [];
    if (images && images.length > 0) {
      for (const img of images.slice(0, 3)) {
        if (img && img.includes('base64')) {
          const parts = img.split(',');
          const mimePart = parts[0];
          const dataPart = parts[1];
          const mimeType = mimePart.match(/:(.*?);/)?.[1] || 'image/png';
          imageParts.push({
            inlineData: { data: dataPart, mimeType },
          });
        }
      }
    }

    // Determine model chain
    const selectedModel = model || MODEL_REGISTRY.image[0];
    const modelChain = [selectedModel, ...MODEL_REGISTRY.image.filter((m) => m !== selectedModel)];

    const ai = getVertexAI();

    // Try with smart retry across models
    let imageUrl = '';
    let usedModel = selectedModel;
    let geminiTextResponse = '';
    let lastError: any;

    for (const modelName of modelChain) {
      let success = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          console.log(`[generate-image] model="${modelName}" attempt=${attempt + 1}`);

          // Check if this is an Imagen model or Gemini model
          if (modelName.startsWith('imagen-')) {
            // ─── Imagen 3 API ───────────────────────────────────
            const response = await ai.models.generateImages({
              model: modelName,
              prompt: finalPrompt,
              config: {
                numberOfImages: 1,
                aspectRatio: aspectRatio as any,
              },
            });

            if (response.generatedImages && response.generatedImages.length > 0) {
              const img = response.generatedImages[0].image;
              if (img?.imageBytes) {
                imageUrl = `data:image/png;base64,${img.imageBytes}`;
                usedModel = modelName;
                success = true;
                break;
              }
            }
          } else {
            // ─── Gemini Native Image Generation ─────────────────
            const contents: any = {
              parts: [
                ...imageParts,
                { text: finalPrompt },
              ],
            };

            const response = await ai.models.generateContent({
              model: modelName,
              contents,
              config: {
                responseModalities: ['Text', 'Image'],
              },
            });

            if (response.candidates && response.candidates[0]?.content?.parts) {
              for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                  imageUrl = `data:image/png;base64,${part.inlineData.data}`;
                }
                if (part.text) {
                  geminiTextResponse = part.text;
                }
              }
            }

            if (imageUrl) {
              usedModel = modelName;
              success = true;
              break;
            }
          }
        } catch (err: any) {
          lastError = err;
          const msg = err?.message || String(err);
          console.warn(`[generate-image] Error: ${msg}`);

          if (/404|NOT_FOUND|does not exist|INVALID_ARGUMENT/i.test(msg)) {
            break; // skip to next model
          }
          if (/429|QUOTA|RESOURCE_EXHAUSTED/i.test(msg)) {
            break; // skip to next model
          }
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 1500));
          }
        }
      }
      if (success) break;
    }

    if (!imageUrl) {
      throw new Error(
        `Image generation failed with all models.\n` +
        `Tried: ${modelChain.join(', ')}\n` +
        `Last error: ${lastError?.message || 'No image data returned'}\n\n` +
        `💡 Tips:\n` +
        `• Check GCP quotas at https://console.cloud.google.com/iam-admin/quotas\n` +
        `• Ensure Vertex AI API is enabled for your project\n` +
        `• Verify service account has "Vertex AI User" role`
      );
    }

    return res.status(200).json({
      imageUrl,
      promptUsed: finalPrompt,
      model: usedModel,
      textResponse: geminiTextResponse || undefined,
    });
  } catch (error: any) {
    console.error('[api/generate-image] Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
