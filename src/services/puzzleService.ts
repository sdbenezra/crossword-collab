import { ref, set, onValue, get, off } from 'firebase/database';
import { db } from '../config/firebase';
import type { PuzzleData, CellData } from '../types/puzzle';

export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export function generateShareCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export async function createPuzzle(
  puzzleData: Omit<PuzzleData, 'id' | 'createdAt' | 'shareCode' | 'grid' | 'cursors' | 'collaborators'>,
  userId: string
): Promise<string> {
  const puzzleId = generateId();
  const shareCode = generateShareCode();
  const puzzleRef = ref(db, `puzzles/${puzzleId}`);

  const newPuzzle: PuzzleData = {
    ...puzzleData,
    id: puzzleId,
    createdAt: Date.now(),
    shareCode,
    grid: {},
    cursors: {},
    collaborators: { [userId]: true }
  };

  await set(puzzleRef, newPuzzle);
  return puzzleId;
}

export function subscribeToPuzzle(
  puzzleId: string,
  callback: (data: PuzzleData | null) => void
): () => void {
  const puzzleRef = ref(db, `puzzles/${puzzleId}`);

  onValue(puzzleRef, (snapshot) => {
    callback(snapshot.val());
  });

  return () => off(puzzleRef);
}

export async function getPuzzleByShareCode(shareCode: string): Promise<PuzzleData | null> {
  const puzzlesRef = ref(db, 'puzzles');
  const snapshot = await get(puzzlesRef);

  if (!snapshot.exists()) return null;

  const puzzles = snapshot.val();
  const puzzleEntry = Object.entries(puzzles).find(
    ([, puzzle]) => (puzzle as PuzzleData).shareCode === shareCode
  );

  return puzzleEntry ? puzzleEntry[1] as PuzzleData : null;
}

export async function joinPuzzle(puzzleId: string, userId: string): Promise<void> {
  const collaboratorRef = ref(db, `puzzles/${puzzleId}/collaborators/${userId}`);
  await set(collaboratorRef, true);
}

export async function updateCell(
  puzzleId: string,
  row: number,
  col: number,
  letter: string,
  userId: string
): Promise<void> {
  const cellRef = ref(db, `puzzles/${puzzleId}/grid/${row},${col}`);
  const cellData: CellData = {
    letter: letter.toUpperCase(),
    timestamp: Date.now(),
    userId
  };
  await set(cellRef, cellData);
}

export async function updateCursor(
  puzzleId: string,
  userId: string,
  row: number,
  col: number
): Promise<void> {
  const cursorRef = ref(db, `puzzles/${puzzleId}/cursors/${userId}`);
  await set(cursorRef, {
    row,
    col,
    timestamp: Date.now()
  });
}

export async function removeCursor(puzzleId: string, userId: string): Promise<void> {
  const cursorRef = ref(db, `puzzles/${puzzleId}/cursors/${userId}`);
  await set(cursorRef, null);
}
