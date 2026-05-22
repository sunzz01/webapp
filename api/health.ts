import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({
    ok: true,
    vertex: {
      hasProjectId: Boolean(process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT),
      hasServiceAccount: Boolean(process.env.GCP_SERVICE_ACCOUNT),
      location: process.env.GCP_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
      serviceAccountLooksJson: Boolean(process.env.GCP_SERVICE_ACCOUNT?.trim().startsWith('{')),
    },
    geminiFallback: {
      hasApiKey: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    },
  });
}
