import { useNavigate } from 'react-router-dom';
import { CaptureUpload } from '../components/CaptureUpload';
import { useAuth } from '../hooks/useAuth';
import type { ParseResponse } from '../types/puzzle';

export default function Capture() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handlePuzzleExtracted = (data: ParseResponse) => {
    sessionStorage.setItem('extractedPuzzle', JSON.stringify(data));
    navigate('/verify');
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Signing in...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <CaptureUpload onPuzzleExtracted={handlePuzzleExtracted} />
    </div>
  );
}
