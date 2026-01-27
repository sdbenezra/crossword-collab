import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { updateCell, updateCursor, removeCursor } from '../services/puzzleService';
import type { PuzzleData } from '../types/puzzle';

type EditMode = 'none' | 'blackCells' | 'numbers';

interface CrosswordGridProps {
  puzzle: PuzzleData;
  userId: string;
  editable?: boolean;
  editMode?: EditMode;
  onToggleBlackCell?: (row: number, col: number) => void;
  onEditClueNumber?: (row: number, col: number) => void;
}

export function CrosswordGrid({ puzzle, userId, editable = true, editMode = 'none', onToggleBlackCell, onEditClueNumber }: CrosswordGridProps) {
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [direction, setDirection] = useState<'across' | 'down'>('across');
  const gridRef = useRef<HTMLDivElement>(null);

  const isBlackCell = useCallback((row: number, col: number) => {
    return puzzle.blackCells?.some(([r, c]) => r === row && c === col);
  }, [puzzle.blackCells]);

  useEffect(() => {
    if (selectedCell && editable && puzzle.id) {
      updateCursor(puzzle.id, userId, selectedCell.row, selectedCell.col);
    }

    return () => {
      if (editable && puzzle.id) {
        removeCursor(puzzle.id, userId);
      }
    };
  }, [selectedCell, puzzle.id, userId, editable]);

  const moveCell = useCallback((rowDelta: number, colDelta: number) => {
    if (!selectedCell) return;

    let newRow = selectedCell.row + rowDelta;
    let newCol = selectedCell.col + colDelta;

    // Clamp to grid bounds
    newRow = Math.max(0, Math.min(puzzle.gridSize[1] - 1, newRow));
    newCol = Math.max(0, Math.min(puzzle.gridSize[0] - 1, newCol));

    // Skip black cells
    while (isBlackCell(newRow, newCol)) {
      newRow += rowDelta;
      newCol += colDelta;

      if (newRow < 0 || newRow >= puzzle.gridSize[1] || newCol < 0 || newCol >= puzzle.gridSize[0]) {
        return;
      }
    }

    setSelectedCell({ row: newRow, col: newCol });
  }, [selectedCell, puzzle.gridSize, isBlackCell]);

  const handleCellClick = (row: number, col: number) => {
    if (editMode === 'blackCells') {
      onToggleBlackCell?.(row, col);
      return;
    }
    if (editMode === 'numbers') {
      if (!isBlackCell(row, col)) {
        onEditClueNumber?.(row, col);
      }
      return;
    }

    if (!editable) return;
    if (isBlackCell(row, col)) return;

    if (selectedCell?.row === row && selectedCell?.col === col) {
      setDirection(d => d === 'across' ? 'down' : 'across');
    } else {
      setSelectedCell({ row, col });
    }
  };

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (!selectedCell || !editable || !puzzle.id) return;

    const { row, col } = selectedCell;

    if (e.key.match(/^[a-zA-Z]$/)) {
      updateCell(puzzle.id, row, col, e.key.toUpperCase(), userId);
      if (direction === 'across') {
        moveCell(0, 1);
      } else {
        moveCell(1, 0);
      }
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      updateCell(puzzle.id, row, col, '', userId);
      if (e.key === 'Backspace') {
        if (direction === 'across') {
          moveCell(0, -1);
        } else {
          moveCell(-1, 0);
        }
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveCell(-1, 0);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveCell(1, 0);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      moveCell(0, -1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      moveCell(0, 1);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      setDirection(d => d === 'across' ? 'down' : 'across');
    }
  }, [selectedCell, editable, puzzle.id, userId, direction, moveCell]);

  const [width, height] = puzzle.gridSize;

  // Compute cells belonging to the current word (for highlighting)
  const wordCells = useMemo(() => {
    const cells = new Set<string>();
    if (!selectedCell || editMode !== 'none') return cells;
    const { row, col } = selectedCell;
    if (isBlackCell(row, col)) return cells;

    if (direction === 'across') {
      // Walk left to find word start
      let c = col;
      while (c > 0 && !isBlackCell(row, c - 1)) c--;
      // Walk right to collect all cells in the word
      while (c < width && !isBlackCell(row, c)) {
        cells.add(`${row},${c}`);
        c++;
      }
    } else {
      // Walk up to find word start
      let r = row;
      while (r > 0 && !isBlackCell(r - 1, col)) r--;
      // Walk down to collect all cells in the word
      while (r < height && !isBlackCell(r, col)) {
        cells.add(`${r},${col}`);
        r++;
      }
    }
    return cells;
  }, [selectedCell, direction, isBlackCell, width, height, editMode]);

  return (
    <div
      ref={gridRef}
      className="inline-block focus:outline-none"
      tabIndex={0}
      onKeyDown={handleKeyPress}
    >
      <div
        className="grid gap-0.5 bg-gray-800 p-0.5"
        style={{
          gridTemplateColumns: `repeat(${width}, 40px)`,
          gridTemplateRows: `repeat(${height}, 40px)`
        }}
      >
        {Array.from({ length: height }).map((_, row) =>
          Array.from({ length: width }).map((_, col) => {
            const black = isBlackCell(row, col);
            const cellKey = `${row},${col}`;
            const letter = puzzle.grid?.[cellKey]?.letter || '';
            const clueNum = puzzle.clueNumbers?.[cellKey];
            const isSelected = selectedCell?.row === row && selectedCell?.col === col;

            const otherCursors = Object.entries(puzzle.cursors || {})
              .filter(([id, cursor]) =>
                id !== userId && cursor.row === row && cursor.col === col
              );

            const hasOtherCursor = otherCursors.length > 0;

            const isInWord = wordCells.has(cellKey);

            const editCellClass =
              editMode === 'blackCells'
                ? (black ? 'bg-black cursor-pointer hover:bg-gray-700' : 'bg-white cursor-pointer hover:bg-red-100')
                : editMode === 'numbers'
                  ? (black ? 'bg-black cursor-default' : 'bg-white cursor-pointer hover:bg-yellow-100')
                  : '';

            const normalCellClass = editMode === 'none'
              ? (black
                  ? 'bg-black cursor-default'
                  : isSelected
                    ? 'bg-blue-200 cursor-pointer'
                    : isInWord
                      ? 'bg-blue-100 cursor-pointer hover:bg-blue-150'
                      : 'bg-white cursor-pointer hover:bg-gray-50')
              : editCellClass;

            return (
              <div
                key={cellKey}
                onClick={() => handleCellClick(row, col)}
                className={`
                  relative flex items-center justify-center text-2xl font-bold
                  transition-colors
                  ${normalCellClass}
                  ${isSelected && editMode === 'none'
                    ? 'ring-2 ring-blue-500 z-10'
                    : ''
                  }
                  ${hasOtherCursor
                    ? 'ring-2 ring-red-400'
                    : ''
                  }
                `}
                style={{ width: '40px', height: '40px' }}
              >
                {clueNum && !black && (
                  <span className="absolute top-0.5 left-1 text-[10px] font-normal text-gray-600 leading-none">
                    {clueNum}
                  </span>
                )}
                {!black && (
                  <span className="text-gray-900">{letter}</span>
                )}
              </div>
            );
          })
        )}
      </div>
      {editMode === 'blackCells' && (
        <div className="mt-2 text-xs text-amber-700 text-center font-medium">
          Click any cell to toggle black/white
        </div>
      )}
      {editMode === 'numbers' && (
        <div className="mt-2 text-xs text-amber-700 text-center font-medium">
          Click a white cell to set or remove its clue number
        </div>
      )}
      {editable && editMode === 'none' && (
        <div className="mt-3 flex items-center justify-center gap-3">
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
            direction === 'across'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-500'
          }`}>
            Across →
          </span>
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
            direction === 'down'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-500'
          }`}>
            Down ↓
          </span>
          <span className="text-xs text-gray-400 ml-1">(Tab to switch)</span>
        </div>
      )}
    </div>
  );
}
