import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        // Validate that it's an image upload
        if (!pathname.match(/\.(jpg|jpeg|png|gif|webp|heic)$/i)) {
          throw new Error('Only image files are allowed');
        }

        return {
          allowedContentTypes: [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'image/heic',
          ],
          maximumSizeInBytes: 20 * 1024 * 1024, // 20MB max
        };
      },
      onUploadCompleted: async () => {
        // No-op: we don't need to do anything after upload
      },
    });

    return res.status(200).json(jsonResponse);
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Upload failed',
    });
  }
}
