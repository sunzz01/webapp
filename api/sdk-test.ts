import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const genai = await import('@google/genai');
    return res.status(200).json({
      ok: true,
      node: process.version,
      hasGoogleGenAI: Boolean(genai.GoogleGenAI),
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      node: process.version,
      error: error?.message || String(error),
      stack: error?.stack?.split('\n').slice(0, 5).join('\n'),
    });
  }
}
