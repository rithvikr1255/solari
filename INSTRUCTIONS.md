# Solari AI Workflow Instructions

This document explains how to build, run, and manually verify Solari’s core AI features (contextual autocorrect + natural-language-to-markdown), including the optional “PDF reference context” integration.

## Overview

Solari is an Electron + React + CodeMirror app.

The renderer edits markdown. Two AI-assisted paths call the local server on port `3001`:

1. Autocorrect (`/api/correct`)
   - Input: `{ text, context }`
   - `context` is the local note text before the cursor span, optionally prefixed with extracted text from a reference PDF.
2. Natural-language shorthand to markdown (`/api/nl-to-markdown`)
   - Input: `{ text, context? }`
   - `context` is optional reference text extracted from a reference PDF.

The server also exposes:

- PDF extraction (`/api/extract-pdf`)
  - Input: raw `application/pdf` bytes
  - Output: `{ text }` extracted from the PDF

## Prerequisites

- Node.js (any modern Node 18+ should work)
- An Anthropic API key

## Environment Variables

1. Create/edit `server/.env`
   - This repo includes `server/.env` already. Ensure it contains a valid key:

     `ANTHROPIC_API_KEY=...`
     `PORT=3001`

Notes:
- Do not commit secrets.
- `.env` files are ignored by git via the repo `.gitignore`.

## Install & Run (Development)

Open two terminals.

### 1) Start the server

```bash
cd /Users/jeshalpatel/Documents/solari/server
npm install
npm run dev
```

The server listens on `http://localhost:3001`.

### 2) Start the Electron app

```bash
cd /Users/jeshalpatel/Documents/solari/app
npm install
npm run dev
```

## Build (Optional)

### Server

```bash
cd /Users/jeshalpatel/Documents/solari/server
npm run build
```

### App

```bash
cd /Users/jeshalpatel/Documents/solari/app
npm run build
```

## API Reference (AI Workflow Endpoints)

All endpoints are served under `/api` on port `3001`.

### POST `/api/extract-pdf`

Purpose: extract text from a reference PDF to be used as LLM “context”.

Request:
- `Content-Type: application/pdf`
- Body: raw PDF bytes

Response:
- `200`: `{ "text": "<extracted text>" }`
- `400`: if no text could be extracted or the input is invalid

Limitations:
- Text extraction depends on the PDF having a readable text layer.
- Scanned/image-only PDFs may produce empty output (no OCR is performed).

### POST `/api/correct`

Purpose: contextual autocorrect for a selected text span.

Request JSON:
```json
{
  "text": "the exact span to correct",
  "context": "local preceding note text, optionally prefixed by extracted reference PDF text"
}
```

Response JSON:
```json
{ "corrected": "the corrected span" }
```

### POST `/api/nl-to-markdown`

Purpose: convert natural-language shorthand into markdown.

Request JSON:
```json
{
  "text": "shorthand line(s) to convert",
  "context": "optional reference PDF extracted text"
}
```

Response JSON:
```json
{ "markdown": "converted markdown" }
```

## PDF Reference Context Integration (How it Works)

1. UI: In the app header, use **Reference PDF** to pick a PDF file.
2. Renderer uploads it to `POST /api/extract-pdf`.
3. The extracted PDF text is stored in a small in-memory renderer module.
4. When the LLM calls run:
   - `/api/correct`: the stored extracted text is prepended to the local `context` string (before the cursor span).
   - `/api/nl-to-markdown`: the stored extracted text is sent as `context` so the LLM can follow terminology/intent without copying verbatim.

## Manual Verification Checklist (No Automated Tests)

After both server and app are running:

1. Reference PDF test
   - Upload a PDF that includes terminology you want the LLM to recognize.
   - Confirm you see the attached filename and character count in the app header.
2. Markdown shorthand test
   - Type a shorthand line like `create a task for fix the login bug`
   - Confirm it becomes a markdown checklist item.
3. Autocorrect with PDF context
   - Type a sentence containing a misspelling or shorthand term from the PDF.
   - Confirm the corrected output aligns with terminology from the PDF.
4. Clear test
   - Click **Clear** and verify the reference context indicators disappear.

## Key Source Files

- Server:
  - `server/src/index.ts` (mounts routers)
  - `server/src/routes/llm.ts` (`/api/correct`, `/api/correct-word`, `/api/nl-to-markdown`)
  - `server/src/routes/pdf.ts` (`/api/extract-pdf`)
- Renderer:
  - `app/src/renderer/src/extensions/autocorrect.ts` (calls `/api/correct` and builds `context`)
  - `app/src/renderer/src/extensions/nlMarkdown.ts` (calls `/api/nl-to-markdown`)
  - `app/src/renderer/src/referenceContext.ts` (in-memory extracted PDF context store)
  - `app/src/renderer/src/App.tsx` (PDF upload UI + state display)

