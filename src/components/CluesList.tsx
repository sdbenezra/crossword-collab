import { useMemo } from 'react';
import type { PuzzleData } from '../types/puzzle';

interface CluesListProps {
  puzzle: PuzzleData;
  onClueClick?: (clueNum: string, direction: 'across' | 'down') => void;
}

export function CluesList({ puzzle, onClueClick }: CluesListProps) {
  // Find all cells for a given clue number and direction
  const getWordCells = (clueNum: string, direction: 'across' | 'down'): [number, number][] => {
    const [width, height] = puzzle.gridSize;

    // Find the cell that has this clue number
    const startKey = Object.entries(puzzle.clueNumbers || {}).find(
      ([_, num]) => num === Number(clueNum)
    )?.[0];

    if (!startKey) return [];

    const [startRow, startCol] = startKey.split(',').map(Number);
    const isBlackCell = (r: number, c: number) =>
      puzzle.blackCells.some(([br, bc]) => br === r && bc === c);

    const cells: [number, number][] = [];

    if (direction === 'across') {
      // Walk left to find word start
      let c = startCol;
      while (c > 0 && !isBlackCell(startRow, c - 1)) c--;
      // Walk right to collect all cells in the word
      while (c < width && !isBlackCell(startRow, c)) {
        cells.push([startRow, c]);
        c++;
      }
    } else {
      // Walk up to find word start
      let r = startRow;
      while (r > 0 && !isBlackCell(r - 1, startCol)) r--;
      // Walk down to collect all cells in the word
      while (r < height && !isBlackCell(r, startCol)) {
        cells.push([r, startCol]);
        r++;
      }
    }

    return cells;
  };

  // Check if a clue is fully answered
  const isClueAnswered = (clueNum: string, direction: 'across' | 'down'): boolean => {
    const cells = getWordCells(clueNum, direction);
    if (cells.length === 0) return false;

    // Check if all cells in the word have letters
    return cells.every(([r, c]) => {
      const cellKey = `${r},${c}`;
      const letter = puzzle.grid?.[cellKey]?.letter || puzzle.preFilledLetters?.[cellKey] || '';
      return letter !== '';
    });
  };

  // Memoize answered clues to avoid recalculating on every render
  const answeredAcross = useMemo(() => {
    const set = new Set<string>();
    Object.keys(puzzle.acrossClues || {}).forEach(num => {
      if (isClueAnswered(num, 'across')) {
        set.add(num);
      }
    });
    return set;
  }, [puzzle.grid, puzzle.acrossClues, puzzle.clueNumbers, puzzle.gridSize, puzzle.blackCells, puzzle.preFilledLetters]);

  const answeredDown = useMemo(() => {
    const set = new Set<string>();
    Object.keys(puzzle.downClues || {}).forEach(num => {
      if (isClueAnswered(num, 'down')) {
        set.add(num);
      }
    });
    return set;
  }, [puzzle.grid, puzzle.downClues, puzzle.clueNumbers, puzzle.gridSize, puzzle.blackCells, puzzle.preFilledLetters]);

  return (
    <div className="overflow-auto max-h-96 border border-gray-200 rounded-lg p-4">
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-bold mb-3">Across</h3>
          <div className="space-y-2">
            {Object.entries(puzzle.acrossClues || {})
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([num, clue]) => (
                <div
                  key={`across-${num}`}
                  onClick={() => onClueClick?.(num, 'across')}
                  className={`${answeredAcross.has(num) ? 'flex gap-2 opacity-60' : 'flex gap-2'} cursor-pointer hover:bg-blue-50 p-2 rounded transition-colors`}
                >
                  <span className="font-semibold text-gray-700 min-w-[2rem]">{num}.</span>
                  <span className={answeredAcross.has(num) ? 'text-gray-800 line-through' : 'text-gray-800'}>
                    {clue}
                  </span>
                </div>
              ))}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold mb-3">Down</h3>
          <div className="space-y-2">
            {Object.entries(puzzle.downClues || {})
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([num, clue]) => (
                <div
                  key={`down-${num}`}
                  onClick={() => onClueClick?.(num, 'down')}
                  className={`${answeredDown.has(num) ? 'flex gap-2 opacity-60' : 'flex gap-2'} cursor-pointer hover:bg-blue-50 p-2 rounded transition-colors`}
                >
                  <span className="font-semibold text-gray-700 min-w-[2rem]">{num}.</span>
                  <span className={answeredDown.has(num) ? 'text-gray-800 line-through' : 'text-gray-800'}>
                    {clue}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
