import { defineConfig, loadEnv } from 'vite'
import type { Plugin, ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'

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

          // Transform the response
          const puzzleData = transformLandingAIResponse(data as Record<string, unknown>)

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

  if (!gridChunk) {
    throw new Error('No crossword grid found in image')
  }

  // Parse grid data based on chunk type
  let gridData
  if (tableChunk) {
    gridData = parseTableMarkdown(tableChunk.markdown, grounding || {})
  } else {
    gridData = parseFigureDescription(figureChunk!.markdown)
  }

  const cluesData = parseCluesFromText(textChunks)

  // If no clue numbers were extracted from the grid, derive them from clues + grid structure
  if (Object.keys(gridData.clueNumbers).length === 0) {
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

  // Extract description text from <::...: table::> wrapper
  const descMatch = markdown.match(/<::(.+?):\s*table::>/s)
  const description = descMatch ? descMatch[1] : markdown

  // Extract grid size (e.g., "4x4 grid", "5 x 5 grid")
  const sizeMatch = description.match(/(\d+)\s*x\s*(\d+)/i)
  if (sizeMatch) {
    gridSize[0] = parseInt(sizeMatch[1]) // width
    gridSize[1] = parseInt(sizeMatch[2]) // height
  }

  // Detect black/dark cells from description
  const blackPattern = /(?:black|dark|filled|shaded)\s+cell[s]?\s+(?:at|in)\s+(?:row\s+(\d+).*?col(?:umn)?\s+(\d+))/gi
  let blackMatch
  while ((blackMatch = blackPattern.exec(description)) !== null) {
    blackCells.push([parseInt(blackMatch[1]) - 1, parseInt(blackMatch[2]) - 1])
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
