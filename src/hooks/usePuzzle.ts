import { useState, useEffect } from 'react';
import { subscribeToPuzzle } from '../services/puzzleService';
import type { PuzzleData } from '../types/puzzle';

export function usePuzzle(puzzleId: string | undefined) {
  const [puzzle, setPuzzle] = useState<PuzzleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!puzzleId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToPuzzle(puzzleId, (data) => {
      if (data) {
        setPuzzle(data);
        setError(null);
      } else {
        setError('Puzzle not found');
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [puzzleId]);

  return { puzzle, loading, error };
}
