# Crossword Collab

A real-time collaborative crossword puzzle app. Upload a photo of a crossword, verify the AI-extracted grid, then solve it together with friends.

## How It Works

1. **Capture** -- Photograph or upload an image of a printed crossword puzzle
2. **Verify** -- Review the AI-extracted grid and clues; fix any misplaced black squares or clue numbers
3. **Solve** -- Fill in answers on an interactive grid with keyboard navigation and word highlighting
4. **Collaborate** -- Share a 6-character code so others can join and solve in real-time

All letter entries and cursor positions sync instantly between collaborators via Firebase.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Tailwind CSS |
| Build | Vite 7 |
| Database | Firebase Realtime Database |
| Auth | Firebase Anonymous Auth |
| Image Parsing | LandingAI Document Parser API |
| Hosting | Vercel (static + serverless functions) |

## Project Structure

```
crossword-collab/
├── api/
│   └── parse-crossword.ts         Vercel serverless function (LandingAI proxy)
├── src/
│   ├── components/
│   │   ├── CaptureUpload.tsx       Camera & file upload
│   │   ├── CrosswordGrid.tsx       Interactive grid with keyboard input
│   │   ├── CluesList.tsx           Across/down clue display
│   │   ├── ShareDialog.tsx         Share code dialog
│   │   └── CollaboratorsList.tsx   Active solver list
│   ├── config/
│   │   └── firebase.ts            Firebase initialization
│   ├── hooks/
│   │   ├── useAuth.ts             Auth state hook
│   │   └── usePuzzle.ts           Real-time puzzle subscription
│   ├── pages/
│   │   ├── Home.tsx               Landing page
│   │   ├── Capture.tsx            Image upload page
│   │   ├── Verify.tsx             Grid verification & editing
│   │   ├── Solve.tsx              Main solving interface
│   │   └── Join.tsx               Join by share code
│   ├── services/
│   │   ├── apiService.ts          Image parsing API client
│   │   ├── authService.ts         Firebase auth helpers
│   │   └── puzzleService.ts       Firebase CRUD & real-time sync
│   ├── types/
│   │   └── puzzle.ts              TypeScript interfaces
│   ├── App.tsx                    Route definitions
│   ├── main.tsx                   Entry point
│   └── index.css                  Tailwind imports
├── vercel.json                    Serverless function config
├── vite.config.ts                 Vite config + dev API middleware
└── .env.example                   Environment variable template
```

## Setup

### Prerequisites

- Node.js 18+
- A Firebase project with Realtime Database and Anonymous Auth enabled
- A LandingAI API key

### Install and Run

```bash
npm install
cp .env.example .env.local
# Fill in your credentials in .env.local
npm run dev
```

The dev server starts at `http://localhost:3000`. The Vite dev middleware proxies `/api/parse-crossword` requests to LandingAI so you don't need a separate backend during development.

### Environment Variables

Create a `.env.local` file with:

```
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-app.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://your-app.firebaseio.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-app.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=your-app-id
LANDINGAI_API_KEY=your_landingai_api_key
```

`VITE_`-prefixed variables are exposed to the browser (public Firebase config). `LANDINGAI_API_KEY` is server-only -- used by the dev middleware and the Vercel serverless function.

## Firebase Setup

1. Create a project at [Firebase Console](https://console.firebase.google.com/)
2. Enable **Realtime Database** (start in test mode or configure rules)
3. Enable **Authentication** with the **Anonymous** sign-in provider
4. Copy your web app config values into `.env.local`

### Database Structure

```
puzzles/
  {puzzleId}/
    gridSize: [width, height]
    blackCells: [[row, col], ...]
    clueNumbers: {"row,col": clueNumber}
    acrossClues: {"1": "Clue text", ...}
    downClues: {"1": "Clue text", ...}
    shareCode: "ABC123"
    createdBy: userId
    createdAt: timestamp
    grid/
      "row,col": { letter, timestamp, userId }
    cursors/
      userId: { row, col, timestamp }
    collaborators/
      userId: true
```

## Deploying to Vercel

1. Push the repo to GitHub
2. Import the repo at [vercel.com](https://vercel.com)
3. Vercel auto-detects Vite -- no build settings to change
4. Add all environment variables from `.env.local` in the Vercel dashboard under **Settings > Environment Variables**

Vercel hosts both pieces:
- **Frontend** -- Vite builds to static files served from Vercel's CDN
- **API** -- `api/parse-crossword.ts` deploys as a serverless function at `/api/parse-crossword`

The `vercel.json` configures the serverless function with 1024 MB memory and a 30-second timeout.

## Grid Editing (Verify Page)

After uploading an image, the Verify page lets you correct extraction errors before saving:

- **Edit Black Squares** -- Click any cell to toggle it between black and white
- **Edit Clue Numbers** -- Click a white cell to set or remove its clue number

## Solving Controls

| Input | Action |
|-------|--------|
| A-Z | Enter letter, auto-advance in current direction |
| Backspace | Clear letter, move backward |
| Delete | Clear letter, stay in place |
| Arrow keys | Move between cells (skips black cells) |
| Tab | Toggle between across and down |
| Click selected cell | Toggle direction |

The current word is highlighted in blue. The active direction is shown as a pill indicator below the grid.

## Scripts

```bash
npm run dev       # Start dev server with HMR + API middleware
npm run build     # TypeScript check + Vite production build
npm run preview   # Preview production build locally
npm run lint      # Run ESLint
```

## Image Parsing Pipeline

The LandingAI Document Parser extracts crossword data from photos:

1. Image is sent as base64 to `/api/parse-crossword`
2. Server forwards it to `api.va.landing.ai/v1/ade/parse` (model: `dpt-2-latest`)
3. Response contains `chunks` -- `figure` (grid description), `text` (clues)
4. Grid is parsed from structured `Row N:` descriptions in the figure chunk
5. Clues are parsed from `ACROSS` / `DOWN` sections in text chunks
6. Row-doubling detection corrects for LandingAI sometimes returning 2x the actual row count

During development, the raw LandingAI response is saved to `landingai-response.json` for debugging.

