import { GoogleGenAI, Type } from '@google/genai';

const TEXT_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

const IMAGE_MODELS = [
  'gemini-2.5-flash-image',
  'imagen-3.0-generate-002',
  'imagen-3.0-fast-generate-001',
];

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('Vertex AI failed and GEMINI_API_KEY is not set in Vercel Environment Variables.');
  }
  return new GoogleGenAI({ apiKey });
}

function extractImageAndText(response: any) {
  let imageUrl = '';
  let text = response?.text || '';
  const parts = response?.candidates?.[0]?.content?.parts || [];

  for (const part of parts) {
    if (part.inlineData?.data) {
      imageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
    }
    if (part.text) text += part.text;
  }

  return { imageUrl, text: text.trim() };
}

export async function generateGeminiText(parts: any[], json = false) {
  const ai = getGeminiClient();
  let lastError: any;

  for (const model of TEXT_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: { parts },
        config: json
          ? {
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
            }
          : undefined,
      });
      return response.text || '';
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

export async function generateGeminiImage(prompt: string, imageParts: any[], aspectRatio: string) {
  const ai = getGeminiClient();
  let lastError: any;
  const hasReferenceImages = imageParts.length > 0;

  for (const model of IMAGE_MODELS) {
    try {
      if (model.startsWith('imagen-')) {
        if (hasReferenceImages) {
          continue;
        }
        const response = await ai.models.generateImages({
          model,
          prompt,
          config: {
            numberOfImages: 1,
            aspectRatio: aspectRatio as any,
          },
        });
        const imageBytes = response.generatedImages?.[0]?.image?.imageBytes;
        if (imageBytes) {
          return { imageUrl: `data:image/png;base64,${imageBytes}`, model, text: '' };
        }
      } else {
        const response = await ai.models.generateContent({
          model,
          contents: { parts: [...imageParts, { text: prompt }] },
          config: {
            responseModalities: ['Text', 'Image'],
          } as any,
        });
        const extracted = extractImageAndText(response);
        if (extracted.imageUrl) {
          return { ...extracted, model };
        }
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}
