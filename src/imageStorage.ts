import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from './firebase';

export interface StoredImage {
  path: string;
  downloadUrl: string;
  contentType: string;
}

const uploadedCache = new Map<string, StoredImage>();

function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const [, contentType, encoded] = match;
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: contentType });
}

async function sourceToBlob(source: string): Promise<Blob> {
  const dataBlob = dataUrlToBlob(source);
  if (dataBlob) return dataBlob;
  const response = await fetch(source);
  if (!response.ok) throw new Error(`ไม่สามารถอ่านรูปสินค้าได้ (${response.status})`);
  return response.blob();
}

/** Upload one image into the current user's private Storage namespace. */
export async function uploadImageToStorage(source: string, jobId: string, index: number): Promise<StoredImage> {
  const cacheKey = `${jobId}:${source}`;
  const cached = uploadedCache.get(cacheKey);
  if (cached) return cached;

  const user = auth.currentUser;
  if (!user) throw new Error('กรุณาเข้าสู่ระบบก่อนอัปโหลดรูปสินค้า');

  const blob = await sourceToBlob(source);
  if (!blob.type.startsWith('image/')) throw new Error('ไฟล์อ้างอิงต้องเป็นรูปภาพเท่านั้น');
  if (blob.size > 15 * 1024 * 1024) throw new Error('รูปภาพมีขนาดเกิน 15 MB');

  const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `users/${user.uid}/products/${jobId}/source/${String(index + 1).padStart(2, '0')}.${extension}`;
  const snapshot = await uploadBytes(ref(storage, path), blob, { contentType: blob.type });
  const stored: StoredImage = {
    path: snapshot.metadata.fullPath,
    downloadUrl: await getDownloadURL(snapshot.ref),
    contentType: blob.type,
  };
  uploadedCache.set(cacheKey, stored);
  return stored;
}

export async function uploadImagesToStorage(sources: string[], jobId: string, maxImages = 4): Promise<StoredImage[]> {
  return Promise.all(sources.filter(Boolean).slice(0, maxImages).map((source, index) => uploadImageToStorage(source, jobId, index)));
}
