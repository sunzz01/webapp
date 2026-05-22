/**
 * POST /api/generate
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
import { MODEL_REGISTRY, getVertexAI, getVertexAccessToken, getVertexEnvironment } from './_lib/vertex.js';

// Aspect ratio descriptions for prompt enhancement
const RATIO_DESCRIPTIONS: Record<string, string> = {
  '1:1': 'square format (1:1 aspect ratio)',
  '4:5': 'portrait format (4:5 aspect ratio)',
  '9:16': 'vertical portrait format (9:16 aspect ratio, mobile/story)',
  '16:9': 'landscape widescreen format (16:9 aspect ratio)',
  '3:4': 'portrait format (3:4 aspect ratio)',
};

function extractVertexTextAndImage(response: any) {
  let imageUrl = '';
  let text = '';
  const parts = response?.response?.candidates?.[0]?.content?.parts || [];

  for (const part of parts) {
    if (part.inlineData?.data) {
      imageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
    }
    if (part.text) text += part.text;
  }

  return { imageUrl, text: text.trim() };
}

async function generateImagenImage(modelName: string, prompt: string, aspectRatio: string) {
  const { projectId, location } = getVertexEnvironment();
  const accessToken = await getVertexAccessToken();
  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelName}:predict`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio,
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || response.statusText || 'Imagen request failed';
    throw new Error(`Imagen ${modelName}: ${message}`);
  }

  const base64 = payload?.predictions?.[0]?.bytesBase64Encoded;
  if (!base64) {
    throw new Error(`Imagen ${modelName}: no image data returned`);
  }

  return `data:image/png;base64,${base64}`;
}

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

    // Try with smart retry across models
    let imageUrl = '';
    let usedModel = selectedModel;
    let geminiTextResponse = '';
    let lastError: any;

    for (const modelName of modelChain) {
      let success = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          console.log(`[generate] model="${modelName}" attempt=${attempt + 1}`);

          // Check if this is an Imagen model or Gemini model
          if (modelName.startsWith('imagen-')) {
            // ─── Imagen 3 API ───────────────────────────────────
            imageUrl = await generateImagenImage(modelName, finalPrompt, aspectRatio);
            usedModel = modelName;
            success = true;
            break;
          } else {
            // ─── Gemini Native Image Generation ─────────────────
            const vertexAI = getVertexAI();
            const generativeModel = vertexAI.getGenerativeModel({
              model: modelName,
              generationConfig: {
                responseModalities: ['TEXT', 'IMAGE'] as any,
              } as any,
            });

            const contents = {
              contents: [{ role: 'user', parts: [...imageParts, { text: finalPrompt }] }],
            };

            const response = await generativeModel.generateContent(contents);
            const extracted = extractVertexTextAndImage(response);
            imageUrl = extracted.imageUrl;
            geminiTextResponse = extracted.text;

            if (imageUrl) {
              usedModel = modelName;
              success = true;
              break;
            }
          }
        } catch (err: any) {
          lastError = err;
          const msg = err?.message || String(err);
          console.warn(`[generate] Error: ${msg}`);

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
    console.error('[api/generate] Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
