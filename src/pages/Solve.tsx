import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CrosswordGrid } from '../components/CrosswordGrid';
import { CluesList } from '../components/CluesList';
import { ShareDialog } from '../components/ShareDialog';
import { CollaboratorsList } from '../components/CollaboratorsList';
import { usePuzzle } from '../hooks/usePuzzle';
import { useAuth } from '../hooks/useAuth';

export default function Solve() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { puzzle, loading, error } = usePuzzle(id);
  const [showShare, setShowShare] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading puzzle...</p>
        </div>
      </div>
    );
  }

  if (error || !puzzle) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Puzzle not found'}</p>
          <Link
            to="/"
            className="text-blue-600 hover:underline"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

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
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="text-gray-600 hover:text-gray-900 text-sm"
            >
              Home
            </Link>
            <h1 className="text-lg font-bold">Crossword Puzzle</h1>
          </div>

          <div className="flex items-center gap-4">
            <CollaboratorsList puzzle={puzzle} currentUserId={user.uid} />
            <button
              onClick={() => setShowShare(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
            >
              Share
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-[auto_1fr] gap-8">
          <div className="bg-white rounded-lg shadow p-6 flex justify-center overflow-auto">
            <CrosswordGrid puzzle={puzzle} userId={user.uid} />
          </div>

          <div className="bg-white rounded-lg shadow p-6 overflow-auto max-h-[80vh]">
            <CluesList puzzle={puzzle} />
          </div>
        </div>
      </div>

      {showShare && (
        <ShareDialog
          shareCode={puzzle.shareCode}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
