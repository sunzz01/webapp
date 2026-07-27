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
    const vertex = await import('./_lib/vertex.js');
    return res.status(200).json({
      ok: true,
      node: process.version,
      exports: Object.keys(vertex),
      config: vertex.getVertexConfigStatus(),
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      node: process.version,
      error: error?.message || String(error),
      stack: error?.stack?.split('\n').slice(0, 8).join('\n'),
    });
  }
}
