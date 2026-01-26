import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Crossword Collab
          </h1>
          <p className="text-xl text-gray-600">
            Solve crossword puzzles together, in real-time
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-4">
          <Link
            to="/capture"
            className="block w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white text-center font-semibold rounded-lg transition-colors"
          >
            Create New Puzzle
          </Link>

          <Link
            to="/join"
            className="block w-full py-4 px-6 bg-green-600 hover:bg-green-700 text-white text-center font-semibold rounded-lg transition-colors"
          >
            Join Existing Puzzle
          </Link>
        </div>

        <div className="mt-8 text-center text-gray-600">
          <p className="text-sm">
            Take a photo or upload a crossword puzzle, then solve it with friends!
          </p>
        </div>
      </div>
    </div>
  );
}
