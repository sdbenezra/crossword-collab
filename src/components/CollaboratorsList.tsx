import type { PuzzleData } from '../types/puzzle';

interface CollaboratorsListProps {
  puzzle: PuzzleData;
  currentUserId: string;
}

const COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-teal-500',
  'bg-red-500',
  'bg-yellow-500',
];

export function CollaboratorsList({ puzzle, currentUserId }: CollaboratorsListProps) {
  const collaborators = Object.keys(puzzle.collaborators || {});

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-500 mr-1">Solvers:</span>
      <div className="flex -space-x-2">
        {collaborators.map((id, index) => (
          <div
            key={id}
            className={`w-8 h-8 rounded-full ${COLORS[index % COLORS.length]} flex items-center justify-center text-white text-xs font-bold ring-2 ring-white`}
            title={id === currentUserId ? 'You' : `Player ${index + 1}`}
          >
            {id === currentUserId ? 'You' : `P${index + 1}`}
          </div>
        ))}
      </div>
    </div>
  );
}
