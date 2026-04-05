import { useRef, useState, useEffect } from 'react';
import { uploadImage, parseCrosswordImage } from '../services/apiService';
import type { ParseResponse } from '../types/puzzle';

interface CaptureUploadProps {
  onPuzzleExtracted: (data: ParseResponse) => void;
}

export function CaptureUpload({ onPuzzleExtracted }: CaptureUploadProps) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });

      setStream(mediaStream);
      setError(null);
    } catch {
      setError('Camera access denied. Please use file upload instead.');
    }
  };

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video && canvas) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.drawImage(video, 0, 0);

        canvas.toBlob(async (blob) => {
          if (blob) {
            await processImage(blob);
          }
        }, 'image/jpeg', 0.9);
      }
    }
  };

  const processImage = async (blob: Blob) => {
    setProcessing(true);
    setError(null);

    try {
      // Check if debug mode is enabled via URL parameter
      const urlParams = new URLSearchParams(window.location.search);
      const debugMode = urlParams.get('debug') === 'true';

      let blobUrl;
      if (debugMode) {
        // In debug mode, use a dummy URL
        blobUrl = 'debug://local';
      } else {
        // Upload to Vercel Blob Storage
        blobUrl = await uploadImage(blob);
      }

      const puzzleData = await parseCrosswordImage(blobUrl, debugMode);
      onPuzzleExtracted(puzzleData);
      stopCamera();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process image');
    } finally {
      setProcessing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processImage(file);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Capture Crossword</h2>

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {!stream ? (
        <div className="space-y-4">
          <button
            onClick={startCamera}
            className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <span>Use Camera</span>
          </button>

          <div className="text-center text-gray-500">or</div>

          <div className="relative">
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
              disabled={processing}
            />
            <label
              htmlFor="file-upload"
              className={`block w-full py-4 px-6 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold text-center rounded-lg cursor-pointer transition-colors ${processing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span className="flex items-center justify-center gap-2">
                <span>Upload Image</span>
              </span>
            </label>
          </div>

          {processing && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <p className="mt-4 text-gray-600">Processing image...</p>
            </div>
          )}

          {/* Debug button - only show in dev */}
          {typeof window !== 'undefined' && window.location.hostname === 'localhost' && (
            <button
              onClick={async () => {
                const debugMode = true;
                const blobUrl = 'debug://local';
                try {
                  setProcessing(true);
                  const puzzleData = await parseCrosswordImage(blobUrl, debugMode);
                  onPuzzleExtracted(puzzleData);
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to parse');
                } finally {
                  setProcessing(false);
                }
              }}
              disabled={processing}
              className="w-full py-4 px-6 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
            >
              {processing ? 'Processing...' : 'Debug: Use Local JSON'}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative rounded-lg overflow-hidden bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full"
            />
          </div>

          <canvas ref={canvasRef} className="hidden" />

          <div className="flex gap-3">
            <button
              onClick={capturePhoto}
              disabled={processing}
              className="flex-1 py-4 px-6 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
            >
              {processing ? 'Processing...' : 'Capture'}
            </button>
            <button
              onClick={stopCamera}
              disabled={processing}
              className="px-6 py-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
