import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { getPuzzleByShareCode, joinPuzzle } from '../services/puzzleService';
import { useAuth } from '../hooks/useAuth';

export default function Join() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [code, setCode] = useState(searchParams.get('code') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async (shareCode: string) => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const puzzle = await getPuzzleByShareCode(shareCode.toUpperCase());

      if (!puzzle) {
        setError('Invalid share code. Please check and try again.');
        return;
      }

      await joinPuzzle(puzzle.id!, user.uid);
      navigate(`/solve/${puzzle.id}`);
    } catch {
      setError('Failed to join puzzle. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const codeFromUrl = searchParams.get('code');
    if (codeFromUrl && user) {
      handleJoin(codeFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim()) {
      handleJoin(code.trim());
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h1 className="text-3xl font-bold mb-6 text-center">Join Puzzle</h1>

          {error && (
            <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter Share Code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg font-mono text-lg text-center uppercase"
                maxLength={6}
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
            >
              {loading ? 'Joining...' : 'Join Puzzle'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link
              to="/"
              className="text-blue-600 hover:underline"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
