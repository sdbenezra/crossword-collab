import { defineConfig, loadEnv } from 'vite'
import type { Plugin, ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync } from 'node:fs'

function devApiPlugin(): Plugin {
  let landingaiApiKey: string | undefined

  return {
    name: 'dev-api-middleware',
    configResolved(config) {
      // Load all env vars (not just VITE_-prefixed ones)
      const env = loadEnv(config.mode, process.cwd(), '')
      landingaiApiKey = env.LANDINGAI_API_KEY
    },
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/parse-crossword', async (req, res) => {
        if (req.method === 'OPTIONS') {
          res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          })
          res.end()
          return
        }

        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        // Read request body
        const body = await new Promise<string>((resolve) => {
          let data = ''
          req.on('data', (chunk: Buffer) => { data += chunk.toString() })
          req.on('end', () => resolve(data))
        })

        let parsed: { imageBase64?: string }
        try {
          parsed = JSON.parse(body)
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid JSON body' }))
          return
        }

        const { imageBase64 } = parsed

        if (!imageBase64) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'No image provided' }))
          return
        }

        if (!landingaiApiKey) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            error: 'LANDINGAI_API_KEY not configured',
            message: 'Add LANDINGAI_API_KEY to your .env.local file'
          }))
          return
        }

        try {
          // Convert base64 to buffer
          const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
          const buffer = Buffer.from(base64Data, 'base64')

          // Call LandingAI API
          const formData = new FormData()
          const blob = new Blob([buffer], { type: 'image/jpeg' })
          formData.append('document', blob, 'crossword.jpg')
          formData.append('model', 'dpt-2-latest')

          console.log('[dev-api] Calling LandingAI API...')
          const response = await fetch('https://api.va.landing.ai/v1/ade/parse', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${landingaiApiKey}`
              // 'apiKey':`${landingaiApiKey}`
            },
            body: formData
          })

          if (!response.ok) {
            const errorText = await response.text()
            console.error('[dev-api] LandingAI error:', errorText)
            res.writeHead(response.status, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({
              error: 'Failed to process image',
              details: errorText
            }))
            return
          }

          const data = await response.json()
          console.log('[dev-api] LandingAI response received, transforming...')

          // Save raw response for debugging
          try {
            writeFileSync('landingai-response.json', JSON.stringify(data, null, 2))
            console.log('[dev-api] Raw response saved to landingai-response.json')
          } catch (e) {
            console.warn('[dev-api] Could not save response file:', e)
          }

          // Transform the response
          const puzzleData = transformLandingAIResponse(data as Record<string, unknown>)

          console.log('[dev-api] Final puzzle data:', JSON.stringify(puzzleData, null, 2))

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(puzzleData))
        } catch (error) {
          console.error('[dev-api] Parse error:', error)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error'
          }))
        }
      })
    }
  }
}

// --- Transform logic (mirrors api/parse-crossword.ts) ---

interface TransformedResponse {
  gridSize: number[]
  blackCells: [number, number][]
  clueNumbers: Record<string, number>
  preFilledLetters: Record<string, string>
  acrossClues: Record<string, string>
  downClues: Record<string, string>
}

function transformLandingAIResponse(data: Record<string, unknown>): TransformedResponse {
  const chunks = data.chunks as Array<{ type: string; markdown: string }> | undefined
  const grounding = data.grounding as Record<string, {
    position?: { row: number; col: number }
  }> | undefined

  // Find grid chunk - could be 'table' (HTML table) or 'figure' (natural language description)
  const tableChunk = chunks?.find((chunk) => chunk.type === 'table')
  const figureChunk = chunks?.find((chunk) => chunk.type === 'figure')
  const gridChunk = tableChunk || figureChunk

  const textChunks = chunks?.filter((chunk) => chunk.type === 'text') || []

  console.log('[dev-api] Chunk types found:', chunks?.map(c => c.type))
  console.log('[dev-api] Using grid chunk type:', tableChunk ? 'table' : figureChunk ? 'figure' : 'NONE')

  if (!gridChunk) {
    throw new Error('No crossword grid found in image')
  }

  // Parse grid data based on chunk type
  let gridData
  if (tableChunk) {
    gridData = parseTableMarkdown(tableChunk.markdown, grounding || {})
  } else {
    console.log('[dev-api] Figure markdown:', figureChunk!.markdown)
    gridData = parseFigureDescription(figureChunk!.markdown)
  }

  console.log('[dev-api] Parsed grid data:', JSON.stringify(gridData))

  const cluesData = parseCluesFromText(textChunks)
  console.log('[dev-api] Parsed clues - across:', Object.keys(cluesData.acrossClues), 'down:', Object.keys(cluesData.downClues))

  // If no clue numbers were extracted from the grid, derive them from clues + grid structure
  if (Object.keys(gridData.clueNumbers).length === 0) {
    console.log('[dev-api] No clue numbers from grid, deriving from clues + structure...')
    gridData.clueNumbers = deriveCluePositions(
      gridData.gridSize,
      gridData.blackCells,
      cluesData.acrossClues,
      cluesData.downClues
    )
  }

  return {
    gridSize: gridData.gridSize,
    blackCells: gridData.blackCells,
    clueNumbers: gridData.clueNumbers,
    preFilledLetters: gridData.preFilledLetters,
    acrossClues: cluesData.acrossClues,
    downClues: cluesData.downClues
  }
}

function parseTableMarkdown(
  markdown: string,
  grounding: Record<string, { position?: { row: number; col: number } }>
) {
  const gridSize = [0, 0]
  const blackCells: [number, number][] = []
  const clueNumbers: Record<string, number> = {}
  const preFilledLetters: Record<string, string> = {}

  const rows = markdown.match(/<tr>(.*?)<\/tr>/gs) || []
  gridSize[1] = rows.length

  rows.forEach((row, rowIndex) => {
    const cells = row.match(/<td[^>]*>(.*?)<\/td>/gs) || []
    if (gridSize[0] === 0) gridSize[0] = cells.length

    cells.forEach((cell, colIndex) => {
      const idMatch = cell.match(/id="([^"]+)"/)
      if (!idMatch) return

      const cellId = idMatch[1]
      const cellContent = cell.replace(/<[^>]+>/g, '').trim()
      const cellGrounding = grounding[cellId]

      if (cellGrounding?.position) {
        const { row: r, col: c } = cellGrounding.position

        if (cellContent.includes('dark') || cellContent.includes('black')) {
          blackCells.push([r, c])
        }

        const clueNumMatch = cellContent.match(/^(\d+)/)
        if (clueNumMatch && !cellContent.includes('square')) {
          clueNumbers[`${r},${c}`] = parseInt(clueNumMatch[1])
        }

        const letterMatch = cellContent.match(/\b([A-Z])\b/)
        if (letterMatch && !cellContent.includes('square')) {
          preFilledLetters[`${r},${c}`] = letterMatch[1]
        }
      } else {
        if (cellContent.includes('dark') || cellContent.includes('black')) {
          blackCells.push([rowIndex, colIndex])
        }

        const clueNumMatch = cellContent.match(/^(\d+)/)
        if (clueNumMatch && !cellContent.includes('square')) {
          clueNumbers[`${rowIndex},${colIndex}`] = parseInt(clueNumMatch[1])
        }
      }
    })
  })

  return { gridSize, blackCells, clueNumbers, preFilledLetters }
}

function parseFigureDescription(markdown: string) {
  const gridSize = [0, 0]
  const blackCells: [number, number][] = []
  const clueNumbers: Record<string, number> = {}
  const preFilledLetters: Record<string, string> = {}

  // Extract description text from <::...: (table|figure)::> wrapper
  const descMatch = markdown.match(/<::(.+?):\s*(?:table|figure)::>/s)
  const description = descMatch ? descMatch[1] : markdown

  console.log('[dev-api] Figure description wrapper matched:', !!descMatch)

  // Try to parse structured row data (e.g., "Row 1: 1, 2, [black cell], ...")
  const rowPattern = /Row\s+(\d+):\s*(.+)/gi
  let rowMatch
  const parsedRows: { cells: string[] }[] = []

  while ((rowMatch = rowPattern.exec(description)) !== null) {
    const cellsStr = rowMatch[2]
    const cells = cellsStr.split(',').map(c => c.trim())
    parsedRows.push({ cells })
  }

  if (parsedRows.length > 0) {
    const cols = parsedRows[0].cells.length

    // Detect row doubling: LandingAI sometimes interprets each grid row as two
    // (top half with clue numbers, bottom half blank), roughly doubling the row count.
    // Detection: numbered cells appear only on even-indexed rows, and total rows ≈ 2× columns.
    const rowHasNumber = parsedRows.map(row =>
      row.cells.some(c => /^\s*\d+\s*$/.test(c))
    )
    const evenWithNums = rowHasNumber.filter((has, i) => i % 2 === 0 && has).length
    const oddWithNums = rowHasNumber.filter((has, i) => i % 2 === 1 && has).length
    const isDoubled = parsedRows.length >= cols * 1.8
      && evenWithNums > 0
      && oddWithNums === 0

    console.log('[dev-api] Row doubling detection:', { totalRows: parsedRows.length, cols, evenWithNums, oddWithNums, isDoubled })

    let effectiveRows: { cells: string[] }[]
    if (isDoubled) {
      effectiveRows = parsedRows.filter((_, i) => i % 2 === 0)
      console.log('[dev-api] Corrected row doubling:', parsedRows.length, '→', effectiveRows.length, 'rows')
    } else {
      effectiveRows = parsedRows
    }

    gridSize[0] = effectiveRows[0].cells.length // width
    gridSize[1] = effectiveRows.length // height

    console.log('[dev-api] Grid dimensions:', gridSize[0], 'x', gridSize[1])

    effectiveRows.forEach((row, rowIdx) => {
      row.cells.forEach((cell, colIdx) => {
        if (/black/i.test(cell)) {
          blackCells.push([rowIdx, colIdx])
        }

        // Extract clue number from cells like "1", "14", etc.
        const numMatch = cell.match(/^\s*(\d+)\s*$/)
        if (numMatch) {
          clueNumbers[`${rowIdx},${colIdx}`] = parseInt(numMatch[1])
        }
      })
    })

    console.log('[dev-api] Found', blackCells.length, 'black cells and', Object.keys(clueNumbers).length, 'numbered cells')
  } else {
    // Fallback: try "NxN" or "N cells wide by N cells high"
    const sizeMatch = description.match(/(\d+)\s*(?:x|cells?\s+wide\s+by)\s*(\d+)/i)
    if (sizeMatch) {
      gridSize[0] = parseInt(sizeMatch[1])
      gridSize[1] = parseInt(sizeMatch[2])
    }
    console.log('[dev-api] No row data found, fallback grid size:', gridSize)
  }

  return { gridSize, blackCells, clueNumbers, preFilledLetters }
}

function deriveCluePositions(
  gridSize: number[],
  blackCells: [number, number][],
  acrossClues: Record<string, string>,
  downClues: Record<string, string>
): Record<string, number> {
  const clueNumbers: Record<string, number> = {}
  const [width, height] = gridSize

  if (width === 0 || height === 0) return clueNumbers

  const isBlack = (r: number, c: number) =>
    blackCells.some(([br, bc]) => br === r && bc === c)

  // Find across word start cells (reading order: top-to-bottom, left-to-right)
  const acrossStarts: [number, number][] = []
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (isBlack(r, c)) continue
      const leftIsEdgeOrBlack = c === 0 || isBlack(r, c - 1)
      const hasRight = c + 1 < width && !isBlack(r, c + 1)
      if (leftIsEdgeOrBlack && hasRight) {
        acrossStarts.push([r, c])
      }
    }
  }

  // Find down word start cells (reading order)
  const downStarts: [number, number][] = []
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (isBlack(r, c)) continue
      const topIsEdgeOrBlack = r === 0 || isBlack(r - 1, c)
      const hasBelow = r + 1 < height && !isBlack(r + 1, c)
      if (topIsEdgeOrBlack && hasBelow) {
        downStarts.push([r, c])
      }
    }
  }

  // Get sorted clue numbers from parsed clues
  const acrossNums = Object.keys(acrossClues).map(Number).sort((a, b) => a - b)
  const downNums = Object.keys(downClues).map(Number).sort((a, b) => a - b)

  console.log('[dev-api] deriveCluePositions: gridSize:', gridSize, 'acrossStarts:', acrossStarts, 'downStarts:', downStarts)
  console.log('[dev-api] deriveCluePositions: acrossNums:', acrossNums, 'downNums:', downNums)

  // Map across clue numbers to their starting cells
  acrossStarts.forEach(([r, c], i) => {
    if (i < acrossNums.length) {
      clueNumbers[`${r},${c}`] = acrossNums[i]
    }
  })

  // Map down clue numbers to their starting cells
  downStarts.forEach(([r, c], i) => {
    if (i < downNums.length) {
      // Only set if not already set by an across clue
      if (clueNumbers[`${r},${c}`] === undefined) {
        clueNumbers[`${r},${c}`] = downNums[i]
      }
    }
  })

  console.log('[dev-api] deriveCluePositions result:', clueNumbers)
  return clueNumbers
}

function parseCluesFromText(textChunks: Array<{ markdown: string }>) {
  const acrossClues: Record<string, string> = {}
  const downClues: Record<string, string> = {}

  textChunks.forEach(chunk => {
    const md = chunk.markdown || ''
    const lines = md.split('\n').filter((line: string) => line.trim())

    let currentDirection: 'across' | 'down' | null = null
    let lastClueNum: string | null = null
    let lastClueDirection: 'across' | 'down' | null = null

    lines.forEach((line: string) => {
      const trimmed = line.trim()

      // Check if this line indicates direction (handles "ACROSS", "## DOWN (↓)", etc.)
      if (/\bacross\b/i.test(trimmed) && !/^\d/.test(trimmed)) {
        currentDirection = 'across'
        return
      }
      if (/\bdown\b/i.test(trimmed) && !/^\d/.test(trimmed)) {
        currentDirection = 'down'
        return
      }

      if (trimmed.startsWith('<') || !trimmed) return

      // Parse clue: "1 Clue text here" or "1. Clue text here"
      const clueMatch = trimmed.match(/^(\d+)\.?\s+(.+)$/)
      if (clueMatch && currentDirection) {
        const [, num, clueText] = clueMatch
        if (currentDirection === 'across') {
          acrossClues[num] = clueText
        } else {
          downClues[num] = clueText
        }
        lastClueNum = num
        lastClueDirection = currentDirection
      } else if (lastClueNum && lastClueDirection && !clueMatch) {
        if (lastClueDirection === 'across') {
          acrossClues[lastClueNum] += ' ' + trimmed
        } else {
          downClues[lastClueNum] += ' ' + trimmed
        }
      }
    })
  })

  return { acrossClues, downClues }
}

// --- Vite config ---

export default defineConfig({
  plugins: [react(), devApiPlugin()],
  server: {
    port: 3000
  }
})
