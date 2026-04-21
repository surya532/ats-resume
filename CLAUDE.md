# ATS Resume Optimizer — Claude Code Guide

## Architecture

```
server.js          Express server — two endpoints:
                     POST /api/upload  file parsing (PDF/DOCX → plain text)
                     POST /api/claude  Groq API proxy (streams SSE back to browser)

public/
  index.html       All CSS + HTML shell (no build step)
  app.js           All client-side logic — pipeline, UI, prompts
```

## Key flows

### File upload
`/api/upload` receives a multipart file, parses it with `pdf-parse` (PDF) or `mammoth` (DOCX), returns `{ text }`. The browser stores the extracted text in `uploadedText`.

### Pipeline
`runPipeline()` in app.js:
1. Calls `getResumeText()` — returns `uploadedText` or textarea value
2. Calls `redact(text)` — strips name (first line), email, phone, LinkedIn before any API call
3. Runs 5 sequential `callClaude()` calls (steps 3 and 5 each have two back-to-back calls)
4. Each step extracts `<resume>…</resume>` from the model output and passes it to the next step
5. Final resume shown in a copyable card

### Rate limiting
`callClaude()` retries up to 8 times on 429. Each retry waits `max(groq_suggested_wait + 2, 65)` seconds to ensure the 60s rolling TPM window clears. Groq free tier = 12,000 TPM.

### Prompts
All prompt functions are in `app.js` prefixed with `p` — `pRisen`, `pXyz`, `pKeywordAudit`, `pKeywordFill`, `pCar`, `pRecruiterDraft`, `pRecruiterCritique`.

Each prompt asks the model to wrap the resume output in `<resume>…</resume>` tags. `extractResume()` parses those tags; falls back to full text if tags are absent.

## Environment

```
GROQ_API_KEY=   # required — get from console.groq.com
```

## Commands

```bash
npm start        # start server on :3000
```

## Constraints

- `max_tokens: 4000` per call — keeps total tokens (input + output) under the 12k TPM limit
- Personal info is redacted client-side before leaving the browser — the server never sees it
- No build step, no bundler — edit and refresh
