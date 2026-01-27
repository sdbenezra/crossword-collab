import { upload } from '@vercel/blob/client';
import type { ParseResponse } from '../types/puzzle';

export async function uploadImage(blob: Blob): Promise<string> {
  const file = new File([blob], 'crossword.jpg', { type: blob.type || 'image/jpeg' });

  const result = await upload(file.name, file, {
    access: 'public',
    handleUploadUrl: '/api/upload',
  });

  return result.url;
}

export async function parseCrosswordImage(blobUrl: string): Promise<ParseResponse> {
  const response = await fetch('/api/parse-crossword', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ blobUrl })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to parse crossword');
  }

  return response.json();
}
