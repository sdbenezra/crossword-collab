export interface PuzzleData {
  id?: string;
  gridSize: [number, number]; // [width, height]
  blackCells: [number, number][]; // [[row, col], ...]
  clueNumbers: Record<string, number>; // {"row,col": clueNumber}
  preFilledLetters: Record<string, string>; // {"row,col": "letter"}
  acrossClues: Record<string, string>; // {"1": "clue text"}
  downClues: Record<string, string>; // {"1": "clue text"}
  createdBy: string;
  createdAt: number;
  shareCode: string;
  grid?: Record<string, CellData>; // User input: {"row,col": {letter, timestamp}}
  cursors?: Record<string, CursorPosition>; // {"userId": {row, col, timestamp}}
  collaborators?: Record<string, boolean>; // {"userId": true}
}

export interface CellData {
  letter: string;
  timestamp: number;
  userId?: string;
}

export interface CursorPosition {
  row: number;
  col: number;
  timestamp: number;
}

export interface ParseResponse {
  gridSize: [number, number];
  blackCells: [number, number][];
  clueNumbers: Record<string, number>;
  preFilledLetters: Record<string, string>;
  acrossClues: Record<string, string>;
  downClues: Record<string, string>;
}
