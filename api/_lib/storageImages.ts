import { getStorage } from 'firebase-admin/storage';
import { getFirebaseAdminApp } from './firebaseAdmin.js';

export type InlineImagePart = {
  inlineData: { data: string; mimeType: string };
};

function parseInlineImages(images?: string[]): InlineImagePart[] {
  return (images || []).slice(0, 4).flatMap((image) => {
    if (!image || !image.includes('base64')) return [];
    const [header, data] = image.split(',', 2);
    return [{
      inlineData: {
        data: data || header,
        mimeType: header.match(/data:([^;]+);/)?.[1] || 'image/png',
      },
    }];
  });
}

/** Resolve private Storage paths owned by the authenticated user into model parts. */
export async function resolveImageParts(
  userId: string,
  images?: string[],
  storagePaths?: string[],
): Promise<InlineImagePart[]> {
  const inline = parseInlineImages(images);
  const paths = (storagePaths || []).filter((path) => path.startsWith(`users/${userId}/`)).slice(0, 4);
  if (!paths.length) return inline;

  const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
  const bucket = bucketName
    ? getStorage(getFirebaseAdminApp()).bucket(bucketName)
    : getStorage(getFirebaseAdminApp()).bucket();

  const stored = await Promise.all(paths.map(async (path) => {
    const file = bucket.file(path);
    const [buffer] = await file.download();
    const [metadata] = await file.getMetadata();
    return {
      inlineData: {
        data: buffer.toString('base64'),
        mimeType: metadata.contentType || 'image/png',
      },
    } satisfies InlineImagePart;
  }));

  return [...stored, ...inline].slice(0, 4);
}
