import type { VercelRequest, VercelResponse } from '@vercel/node';
import { del } from '@vercel/blob';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { blobUrl, useLocalFile } = req.body;

    let data;

    // If useLocalFile is true, read from local JSON file for debugging
    if (useLocalFile) {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(process.cwd(), 'landingai-response.json');
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      data = JSON.parse(fileContent);
      console.error('[debug] Using local landingai-response.json file');
    } else {
      if (!blobUrl) {
        return res.status(400).json({ error: 'No blobUrl provided' });
      }

      console.error('[dev-api] Fetching image from blob:', blobUrl);

      // Fetch image from Vercel Blob Storage
      const imageResponse = await fetch(blobUrl);
      if (!imageResponse.ok) {
        return res.status(400).json({ error: 'Failed to fetch image from blob storage' });
      }
      const buffer = Buffer.from(await imageResponse.arrayBuffer());

      console.error('[dev-api] Calling LandingAI API...');

      // Call LandingAI API
      const formData = new FormData();
      const blob = new Blob([buffer], { type: 'image/jpeg' });
      formData.append('document', blob, 'crossword.jpg');
      formData.append('model', 'dpt-2-latest');

      const response = await fetch('https://api.va.landing.ai/v1/ade/parse', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.LANDINGAI_API_KEY}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('LandingAI error:', errorText);
        return res.status(response.status).json({
          error: 'Failed to process image',
          details: errorText
        });
      }

      data = await response.json();
      console.error('[dev-api] LandingAI response received, transforming...');
    }

    // Clean up: delete the blob now that we've processed it (only if not using local file)
    if (!useLocalFile && blobUrl) {
      try {
        await del(blobUrl);
      } catch (delError) {
        console.warn('Failed to delete blob (non-critical):', delError);
      }
    }

    // Transform LandingAI response to our crossword format
    const puzzleData = transformLandingAIResponse(data);

    return res.status(200).json(puzzleData);

  } catch (error) {
    console.error('Parse error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

interface TransformedResponse {
  gridSize: number[];
  blackCells: [number, number][];
  clueNumbers: Record<string, number>;
  preFilledLetters: Record<string, string>;
  acrossClues: Record<string, string>;
  downClues: Record<string, string>;
}

function transformLandingAIResponse(data: Record<string, unknown>): TransformedResponse {
  const chunks = data.chunks as Array<{ type: string; markdown: string }> | undefined;
  const grounding = data.grounding as Record<string, {
    position?: { row: number; col: number };
  }> | undefined;

  // Find grid chunk - could be 'table' (HTML table) or 'figure' (natural language description)
  const tableChunk = chunks?.find((chunk) => chunk.type === 'table');
  const figureChunk = chunks?.find((chunk) => chunk.type === 'figure');
  const gridChunk = tableChunk || figureChunk;

  // Find the text chunks containing clues
  const textChunks = chunks?.filter((chunk) => chunk.type === 'text') || [];

  if (!gridChunk) {
    // If no grid found, use a default empty grid
    console.warn('[transformLandingAIResponse] No grid chunk found, using default grid');
  }

  // Parse grid data based on chunk type
  let gridData;
  if (tableChunk) {
    gridData = parseTableMarkdown(tableChunk.markdown, grounding || {});
  } else if (figureChunk) {
    gridData = parseFigureDescription(figureChunk.markdown);
  } else {
    // No grid found, use default empty grid
    gridData = {
      gridSize: [0, 0],
      blackCells: [],
      clueNumbers: {},
      preFilledLetters: {}
    };
  }

  // Parse clues from text chunks
  const cluesData = parseCluesFromText(textChunks);

  // If no clue numbers were extracted from the grid, derive them from clues + grid structure
  if (Object.keys(gridData.clueNumbers).length === 0) {
    gridData.clueNumbers = deriveCluePositions(
      gridData.gridSize,
      gridData.blackCells,
      cluesData.acrossClues,
      cluesData.downClues
    );
  }

  return {
    gridSize: gridData.gridSize,
    blackCells: gridData.blackCells,
    clueNumbers: gridData.clueNumbers,
    preFilledLetters: gridData.preFilledLetters,
    acrossClues: cluesData.acrossClues,
    downClues: cluesData.downClues
  };
}

function parseTableMarkdown(
  markdown: string,
  grounding: Record<string, { position?: { row: number; col: number } }>
): {
  gridSize: number[];
  blackCells: [number, number][];
  clueNumbers: Record<string, number>;
  preFilledLetters: Record<string, string>;
} {
  const gridSize = [0, 0]; // [width, height]
  const blackCells: [number, number][] = [];
  const clueNumbers: Record<string, number> = {};
  const preFilledLetters: Record<string, string> = {};

  // Parse table rows from markdown
  const rows = markdown.match(/<tr>(.*?)<\/tr>/gs) || [];
  gridSize[1] = rows.length;

  rows.forEach((row, rowIndex) => {
    const cells = row.match(/<td[^>]*>(.*?)<\/td>/gs) || [];
    if (gridSize[0] === 0) gridSize[0] = cells.length;

    cells.forEach((cell, colIndex) => {
      // Extract cell ID
      const idMatch = cell.match(/id="([^"]+)"/);
      if (!idMatch) return;

      const cellId = idMatch[1];
      const cellContent = cell.replace(/<[^>]+>/g, '').trim();

      // Use grounding to get cell position
      const cellGrounding = grounding[cellId];
      if (cellGrounding?.position) {
        const { row: r, col: c } = cellGrounding.position;

        // Check if it's a black/dark cell
        if (cellContent.includes('dark') || cellContent.includes('black')) {
          blackCells.push([r, c]);
        }

        // Extract clue number if present
        const clueNumMatch = cellContent.match(/^(\d+)/);
        if (clueNumMatch && !cellContent.includes('square')) {
          const clueNum = parseInt(clueNumMatch[1]);
          clueNumbers[`${r},${c}`] = clueNum;
        }

        // Check for pre-filled letters (single letter after number or alone)
        const letterMatch = cellContent.match(/\b([A-Z])\b/);
        if (letterMatch && !cellContent.includes('square')) {
          preFilledLetters[`${r},${c}`] = letterMatch[1];
        }
      } else {
        // Fallback: use rowIndex/colIndex if grounding doesn't have position
        if (cellContent.includes('dark') || cellContent.includes('black')) {
          blackCells.push([rowIndex, colIndex]);
        }

        const clueNumMatch = cellContent.match(/^(\d+)/);
        if (clueNumMatch && !cellContent.includes('square')) {
          clueNumbers[`${rowIndex},${colIndex}`] = parseInt(clueNumMatch[1]);
        }
      }
    });
  });

  return { gridSize, blackCells, clueNumbers, preFilledLetters };
}

function parseFigureDescription(markdown: string): {
  gridSize: number[];
  blackCells: [number, number][];
  clueNumbers: Record<string, number>;
  preFilledLetters: Record<string, string>;
} {
  const gridSize = [0, 0];
  const blackCells: [number, number][] = [];
  const clueNumbers: Record<string, number> = {};
  const preFilledLetters: Record<string, string> = {};

  // Extract description text from <::...: (table|figure)::> wrapper
  const descMatch = markdown.match(/<::(.+?):\s*(?:table|figure)::>/s);
  const description = descMatch ? descMatch[1] : markdown;

  // Try to parse structured row data (e.g., "Row 1: 1, 2, [black cell], ...")
  const rowPattern = /Row\s+(\d+):\s*(.+)/gi;
  let rowMatch;
  const parsedRows: { cells: string[] }[] = [];

  while ((rowMatch = rowPattern.exec(description)) !== null) {
    const cellsStr = rowMatch[2];
    const cells = cellsStr.split(',').map(c => c.trim());
    parsedRows.push({ cells });
  }

  if (parsedRows.length > 0) {
    const cols = parsedRows[0].cells.length;

    // Detect row doubling: LandingAI sometimes interprets each grid row as two
    // (top half with clue numbers, bottom half blank), roughly doubling the row count.
    const rowHasNumber = parsedRows.map(row =>
      row.cells.some(c => /^\s*\d+\s*$/.test(c))
    );
    const evenWithNums = rowHasNumber.filter((has, i) => i % 2 === 0 && has).length;
    const oddWithNums = rowHasNumber.filter((has, i) => i % 2 === 1 && has).length;
    const isDoubled = parsedRows.length >= cols * 1.8
      && evenWithNums > 0
      && oddWithNums === 0;

    let effectiveRows: { cells: string[] }[];
    if (isDoubled) {
      effectiveRows = parsedRows.filter((_, i) => i % 2 === 0);
    } else {
      effectiveRows = parsedRows;
    }

    gridSize[0] = effectiveRows[0].cells.length; // width
    gridSize[1] = effectiveRows.length; // height

    effectiveRows.forEach((row, rowIdx) => {
      row.cells.forEach((cell, colIdx) => {
        if (/black/i.test(cell)) {
          blackCells.push([rowIdx, colIdx]);
        }

        // Extract clue number from cells like "1", "14", etc.
        const numMatch = cell.match(/^\s*(\d+)\s*$/);
        if (numMatch) {
          clueNumbers[`${rowIdx},${colIdx}`] = parseInt(numMatch[1]);
        }
      });
    });
  } else {
    // Fallback: try "NxN" or "N cells wide by N cells high"
    const sizeMatch = description.match(/(\d+)\s*(?:x|cells?\s+wide\s+by)\s*(\d+)/i);
    if (sizeMatch) {
      gridSize[0] = parseInt(sizeMatch[1]);
      gridSize[1] = parseInt(sizeMatch[2]);
    }
  }

  return { gridSize, blackCells, clueNumbers, preFilledLetters };
}

function deriveCluePositions(
  gridSize: number[],
  blackCells: [number, number][],
  acrossClues: Record<string, string>,
  downClues: Record<string, string>
): Record<string, number> {
  const clueNumbers: Record<string, number> = {};
  const [width, height] = gridSize;

  if (width === 0 || height === 0) return clueNumbers;

  const isBlack = (r: number, c: number) =>
    blackCells.some(([br, bc]) => br === r && bc === c);

  // Find across word start cells (reading order: top-to-bottom, left-to-right)
  const acrossStarts: [number, number][] = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (isBlack(r, c)) continue;
      const leftIsEdgeOrBlack = c === 0 || isBlack(r, c - 1);
      const hasRight = c + 1 < width && !isBlack(r, c + 1);
      if (leftIsEdgeOrBlack && hasRight) {
        acrossStarts.push([r, c]);
      }
    }
  }

  // Find down word start cells (reading order)
  const downStarts: [number, number][] = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (isBlack(r, c)) continue;
      const topIsEdgeOrBlack = r === 0 || isBlack(r - 1, c);
      const hasBelow = r + 1 < height && !isBlack(r + 1, c);
      if (topIsEdgeOrBlack && hasBelow) {
        downStarts.push([r, c]);
      }
    }
  }

  // Get sorted clue numbers from parsed clues
  const acrossNums = Object.keys(acrossClues).map(Number).sort((a, b) => a - b);
  const downNums = Object.keys(downClues).map(Number).sort((a, b) => a - b);

  // Map across clue numbers to their starting cells
  acrossStarts.forEach(([r, c], i) => {
    if (i < acrossNums.length) {
      clueNumbers[`${r},${c}`] = acrossNums[i];
    }
  });

  // Map down clue numbers to their starting cells
  downStarts.forEach(([r, c], i) => {
    if (i < downNums.length) {
      // Only set if not already set by an across clue
      if (clueNumbers[`${r},${c}`] === undefined) {
        clueNumbers[`${r},${c}`] = downNums[i];
      }
    }
  });

  return clueNumbers;
}

function parseCluesFromText(textChunks: Array<{ markdown: string }>): {
  acrossClues: Record<string, string>;
  downClues: Record<string, string>;
} {
  const acrossClues: Record<string, string> = {};
  const downClues: Record<string, string> = {};

  let globalDirection: 'across' | 'down' | null = null;
  let lastClueNum: string | null = null;
  let lastClueDirection: 'across' | 'down' | null = null;

  textChunks.forEach((chunk, chunkIndex) => {
    const md = chunk.markdown || '';
    const lines = md.split('\n').filter((line: string) => line.trim());

    let currentDirection = globalDirection;

    lines.forEach((line: string) => {
      const trimmed = line.trim();

      // Check if this line indicates direction (handles "ACROSS", "## DOWN (↓)", etc.)
      if (/\bacross\b/i.test(trimmed) && !/^\d/.test(trimmed)) {
        console.log(`[parseCluesFromText] Detected direction switch to ACROSS at chunk ${chunkIndex}`);
        currentDirection = 'across';
        globalDirection = 'across';
        return;
      }
      if (/\bdown\b/i.test(trimmed) && !/^\d/.test(trimmed)) {
        console.log(`[parseCluesFromText] Detected direction switch to DOWN at chunk ${chunkIndex}`);
        currentDirection = 'down';
        globalDirection = 'down';
        return;
      }

      // Skip HTML anchor tags and empty lines
      if (trimmed.startsWith('<') || !trimmed) {
        return;
      }

      // Parse clue: "1 Clue text here" or "1. Clue text here"
      const clueMatch = trimmed.match(/^(\d+)\.?\s+(.+)$/);
      if (clueMatch) {
        // Only process if we have a direction
        if (!currentDirection && globalDirection) {
          currentDirection = globalDirection;
        }

        if (currentDirection) {
          const [, num, clueText] = clueMatch;
          if (currentDirection === 'across') {
            acrossClues[num] = clueText;
          } else {
            downClues[num] = clueText;
          }
          lastClueNum = num;
          lastClueDirection = currentDirection;
        }
      } else if (lastClueNum && lastClueDirection && !clueMatch) {
        // Handle multi-line clues: append to the last clue
        if (lastClueDirection === 'across') {
          acrossClues[lastClueNum] += ' ' + trimmed;
        } else {
          downClues[lastClueNum] += ' ' + trimmed;
        }
      }
    });
  });

  return { acrossClues, downClues };
}
