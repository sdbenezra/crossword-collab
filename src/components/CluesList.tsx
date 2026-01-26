import type { PuzzleData } from '../types/puzzle';

interface CluesListProps {
  puzzle: PuzzleData;
}

export function CluesList({ puzzle }: CluesListProps) {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div>
        <h3 className="text-lg font-bold mb-3">Across</h3>
        <div className="space-y-2">
          {Object.entries(puzzle.acrossClues || {})
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([num, clue]) => (
              <div key={`across-${num}`} className="flex gap-2">
                <span className="font-semibold text-gray-700 min-w-[2rem]">{num}.</span>
                <span className="text-gray-800">{clue}</span>
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
              <div key={`down-${num}`} className="flex gap-2">
                <span className="font-semibold text-gray-700 min-w-[2rem]">{num}.</span>
                <span className="text-gray-800">{clue}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
