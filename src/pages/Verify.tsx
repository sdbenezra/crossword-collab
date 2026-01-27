import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CrosswordGrid } from '../components/CrosswordGrid';
import { CluesList } from '../components/CluesList';
import { createPuzzle } from '../services/puzzleService';
import { useAuth } from '../hooks/useAuth';
import type { PuzzleData, ParseResponse } from '../types/puzzle';

type EditMode = 'none' | 'blackCells' | 'numbers';

export default function Verify() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [puzzleData, setPuzzleData] = useState<ParseResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>('none');

  useEffect(() => {
    const stored = sessionStorage.getItem('extractedPuzzle');
    if (stored) {
      setPuzzleData(JSON.parse(stored));
    } else {
      navigate('/capture');
    }
  }, [navigate]);

  const handleToggleBlackCell = useCallback((row: number, col: number) => {
    setPuzzleData(prev => {
      if (!prev) return prev;
      const cellIdx = prev.blackCells.findIndex(([r, c]) => r === row && c === col);
      let newBlackCells: [number, number][];
      let newClueNumbers = { ...prev.clueNumbers };
      if (cellIdx >= 0) {
        newBlackCells = prev.blackCells.filter((_, i) => i !== cellIdx);
      } else {
        newBlackCells = [...prev.blackCells, [row, col]];
        delete newClueNumbers[`${row},${col}`];
      }
      return { ...prev, blackCells: newBlackCells, clueNumbers: newClueNumbers };
    });
  }, []);

  const handleEditClueNumber = useCallback((row: number, col: number) => {
    const key = `${row},${col}`;
    const current = puzzleData?.clueNumbers[key];
    const input = prompt(
      `Clue number for cell (${row}, ${col}):`,
      current?.toString() ?? ''
    );
    if (input === null) return; // cancelled
    setPuzzleData(prev => {
      if (!prev) return prev;
      const newClueNumbers = { ...prev.clueNumbers };
      if (input.trim() === '') {
        delete newClueNumbers[key];
      } else {
        const num = parseInt(input.trim(), 10);
        if (!isNaN(num) && num > 0) {
          newClueNumbers[key] = num;
        }
      }
      return { ...prev, clueNumbers: newClueNumbers };
    });
  }, [puzzleData?.clueNumbers]);

  const handleConfirm = async () => {
    if (!puzzleData || !user) return;

    setSaving(true);
    try {
      const puzzleId = await createPuzzle(
        {
          ...puzzleData,
          createdBy: user.uid
        },
        user.uid
      );

      sessionStorage.removeItem('extractedPuzzle');
      navigate(`/solve/${puzzleId}`);
    } catch (error) {
      console.error('Error creating puzzle:', error);
      alert('Failed to create puzzle');
    } finally {
      setSaving(false);
    }
  };

  if (!puzzleData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const tempPuzzle: PuzzleData = {
    ...puzzleData,
    createdBy: user?.uid || '',
    createdAt: Date.now(),
    shareCode: '',
    id: 'temp'
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <h1 className="text-3xl font-bold mb-6">Verify Extracted Puzzle</h1>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-800">
            Review the extracted puzzle below. Use the edit buttons to correct black squares or clue numbers if needed.
          </p>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setEditMode(m => m === 'blackCells' ? 'none' : 'blackCells')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              editMode === 'blackCells'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}
          >
            {editMode === 'blackCells' ? 'Done Editing Squares' : 'Edit Black Squares'}
          </button>
          <button
            onClick={() => setEditMode(m => m === 'numbers' ? 'none' : 'numbers')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              editMode === 'numbers'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}
          >
            {editMode === 'numbers' ? 'Done Editing Numbers' : 'Edit Clue Numbers'}
          </button>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Grid ({tempPuzzle.gridSize[0]}x{tempPuzzle.gridSize[1]})</h2>
            <div className="flex justify-center overflow-auto">
              <CrosswordGrid
                puzzle={tempPuzzle}
                userId={user?.uid || ''}
                editable={false}
                editMode={editMode}
                onToggleBlackCell={handleToggleBlackCell}
                onEditClueNumber={handleEditClueNumber}
              />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Clues</h2>
            <CluesList puzzle={tempPuzzle} />
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => navigate('/capture')}
            className="px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-semibold transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-semibold transition-colors"
          >
            {saving ? 'Creating...' : 'Confirm & Start Solving'}
          </button>
        </div>
      </div>
    </div>
  );
}
