import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CrosswordGrid } from '../components/CrosswordGrid';
import { CluesList } from '../components/CluesList';
import { createPuzzle } from '../services/puzzleService';
import { useAuth } from '../hooks/useAuth';
import type { PuzzleData, ParseResponse } from '../types/puzzle';

type EditMode = 'none' | 'blackCells' | 'numbers' | 'gridSize';

export default function Verify() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [puzzleData, setPuzzleData] = useState<ParseResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>('none');
  const gridRef = useRef<{ focusClue: (clueNum: string, direction: 'across' | 'down') => void }>(null);

  const handleClueClick = (clueNum: string, direction: 'across' | 'down') => {
    gridRef.current?.focusClue(clueNum, direction);
  };

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

  const handleGridSizeChange = useCallback((width: number, height: number) => {
    setPuzzleData(prev => {
      if (!prev) return prev;
      // Filter out blackCells that are outside the new grid bounds
      const newBlackCells = prev.blackCells.filter(
        ([row, col]) => row < height && col < width
      );
      // Filter out clueNumbers that are outside the new grid bounds
      const newClueNumbers: Record<string, number> = {};
      Object.entries(prev.clueNumbers).forEach(([key, num]) => {
        const [row, col] = key.split(',').map(Number);
        if (row < height && col < width) {
          newClueNumbers[key] = num;
        }
      });
      return {
        ...prev,
        gridSize: [width, height],
        blackCells: newBlackCells,
        clueNumbers: newClueNumbers
      };
    });
  }, []);

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
            Review the extracted puzzle below. Use the edit buttons to correct the grid size, black squares, or clue numbers if needed.
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
          <button
            onClick={() => setEditMode(m => m === 'gridSize' ? 'none' : 'gridSize')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              editMode === 'gridSize'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}
          >
            {editMode === 'gridSize' ? 'Done Editing Grid' : 'Edit Grid Size'}
          </button>
        </div>

        {editMode === 'gridSize' && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4">Set Grid Dimensions</h3>
            <div className="flex gap-4 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Width (columns)
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={puzzleData.gridSize[0]}
                  onChange={(e) => {
                    const newWidth = Math.max(1, parseInt(e.target.value) || 1);
                    handleGridSizeChange(newWidth, puzzleData.gridSize[1]);
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-24"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Height (rows)
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={puzzleData.gridSize[1]}
                  onChange={(e) => {
                    const newHeight = Math.max(1, parseInt(e.target.value) || 1);
                    handleGridSizeChange(puzzleData.gridSize[0], newHeight);
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-24"
                />
              </div>
              <button
                onClick={() => setEditMode('none')}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}

        <div className="mb-8">
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-bold mb-4">Grid ({tempPuzzle.gridSize[0]}x{tempPuzzle.gridSize[1]})</h2>
            <div className="overflow-auto max-h-96 border border-gray-200 rounded-lg" style={{ minHeight: '400px' }}>
              <div className="inline-flex p-4">
                <CrosswordGrid
                  ref={gridRef}
                  puzzle={tempPuzzle}
                  userId={user?.uid || ''}
                  editable={false}
                  editMode={editMode}
                  onToggleBlackCell={handleToggleBlackCell}
                  onEditClueNumber={handleEditClueNumber}
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Clues</h2>
            <CluesList puzzle={tempPuzzle} onClueClick={handleClueClick} />
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
