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
import { MODEL_REGISTRY, getVertexAIForLocation, getVertexAccessToken, getVertexEnvironment } from './_lib/vertex.js';
import { generateGeminiImage } from './_lib/geminiFallback.js';
import { requireFirebaseUser } from './_lib/firebaseAdmin.js';

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

function isImagenModel(modelName: string) {
  return modelName.startsWith('imagen-');
}

function isNanoBananaOriginal(modelName: string) {
  return modelName === 'gemini-2.5-flash-image';
}

function isNanoBanana2OrHigher(modelName: string) {
  return (
    modelName.includes('gemini-3.1-flash-image') ||
    modelName.includes('gemini-3-pro-image')
  );
}

function getGeminiImageLocation() {
  return process.env.GCP_IMAGE_LOCATION || process.env.GEMINI_IMAGE_LOCATION || 'global';
}

function buildImageModelChain(selectedModel: string, hasReferenceImages: boolean) {
  const uniqueModels = [selectedModel, ...MODEL_REGISTRY.image.filter((m) => m !== selectedModel)];

  if (isNanoBanana2OrHigher(selectedModel)) {
    const highModels = uniqueModels.filter(isNanoBanana2OrHigher);
    return highModels.length ? highModels : [selectedModel];
  }

  if (isNanoBananaOriginal(selectedModel)) {
    return uniqueModels.filter((m) => !isImagenModel(m));
  }

  if (!hasReferenceImages) return uniqueModels;

  const geminiModels = uniqueModels.filter((m) => !isImagenModel(m));
  const imagenModels = uniqueModels.filter(isImagenModel);
  return [...geminiModels, ...imagenModels];
}

function buildProductContext(productData: any) {
  if (!productData || typeof productData !== 'object') return '';

  const name = String(productData.name || '').trim();
  const description = String(productData.description || '').trim();
  const features = Array.isArray(productData.features)
    ? productData.features.filter(Boolean).map(String).slice(0, 8)
    : [];

  const lines = [
    'PRODUCT CONTEXT:',
    name ? `- Product name: ${name}` : '',
    description ? `- Description: ${description}` : '',
    features.length ? `- Key features: ${features.join(' | ')}` : '',
  ].filter(Boolean);

  return lines.length > 1 ? lines.join('\n') : '';
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await requireFirebaseUser(req);

    const {
      prompt,
      images,
      model,
      aspectRatio = '1:1',
      customPrompt,
      productData,
    } = req.body;

    if (!prompt && !customPrompt) {
      return res.status(400).json({ error: 'Provide prompt or customPrompt' });
    }

    const ratioDesc = RATIO_DESCRIPTIONS[aspectRatio] || RATIO_DESCRIPTIONS['1:1'];

    const productContext = buildProductContext(productData);

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

    const hasReferenceImages = imageParts.length > 0;
    const referenceInstruction = hasReferenceImages
      ? [
          'REFERENCE IMAGE RULES:',
          '- The attached images are the source product. Keep the same product identity, shape, proportions, color, logos/labels, materials, and visible details.',
          '- You may improve lighting, background, composition, and ecommerce styling, but do not invent a different product.',
          '- If a requested scene requires usage context, place this exact product into the scene instead of replacing it.',
        ].join('\n')
      : [
          'NO REFERENCE IMAGE WAS PROVIDED:',
          '- Generate from the product context only. Avoid inventing brand logos, labels, or features not listed.',
        ].join('\n');

    // Build the final prompt with product grounding and aspect ratio instruction.
    const finalPrompt = [
      productContext,
      prompt || customPrompt,
      referenceInstruction,
      `IMPORTANT: Generate this image in ${ratioDesc}. The canvas must be ${aspectRatio} ratio.`,
    ].filter(Boolean).join('\n\n');

    // Determine model chain
    const selectedModel = model || MODEL_REGISTRY.image[0];
    const modelChain = buildImageModelChain(selectedModel, hasReferenceImages);
    const allowTextOnlyImagenFallback = !hasReferenceImages || isImagenModel(selectedModel);
    const allowGeminiApiFallback = !isNanoBanana2OrHigher(selectedModel);

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
          if (isImagenModel(modelName)) {
            if (!allowTextOnlyImagenFallback) {
              console.warn(`[generate] Skipping text-only model "${modelName}" because product reference images were provided`);
              break;
            }
            // ─── Imagen 3 API ───────────────────────────────────
            imageUrl = await generateImagenImage(modelName, finalPrompt, aspectRatio);
            usedModel = modelName;
            success = true;
            break;
          } else {
            // ─── Gemini Native Image Generation ─────────────────
            const vertexAI = getVertexAIForLocation(getGeminiImageLocation());
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
      if (!allowGeminiApiFallback) {
        throw new Error(
          `Selected image model "${selectedModel}" did not return an image and fallback to lower models is disabled.\n` +
          `Tried: ${modelChain.join(', ')}\n` +
          `Last error: ${lastError?.message || 'No image data returned'}`
        );
      }

      console.warn('[generate] Vertex image generation failed, trying Gemini API fallback:', lastError?.message || lastError);
      const fallback = await generateGeminiImage(finalPrompt, imageParts, aspectRatio);
      imageUrl = fallback.imageUrl;
      usedModel = fallback.model;
      geminiTextResponse = fallback.text || geminiTextResponse;
    }

    return res.status(200).json({
      imageUrl,
      promptUsed: finalPrompt,
      model: usedModel,
      textResponse: geminiTextResponse || undefined,
    });
  } catch (error: any) {
    console.error('[api/generate] Error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
  }
}
