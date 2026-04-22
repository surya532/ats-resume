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
3. Runs 5 sequential `callClaude()` calls (steps 3 and 5 each have two back-to-back calls with a 3s pause between)
4. Each step extracts `<resume>…</resume>` from the model output and passes it to the next step
5. Final resume shown in a scrollable copyable card

### Rate limiting & model fallback
`callClaude()` retries up to 10 times on 429/413/400. Model fallback chain:
- `llama-3.3-70b-versatile` → `meta-llama/llama-4-scout-17b-16e-instruct` → `llama-3.1-8b-instant`
- 429 TPM: waits `parseRetrySeconds(body) + 5s` (handles `22m10s` format), shows live countdown badge
- 429 TPD / 413 too large: switches to next model immediately
- 400 decommissioned: switches to next model immediately

### Retry from step
`_state.inputs[stepId]` stores the resume text entering each step. On failure, a **Retry from this step** button calls `retryFromStep(id)`, which resets that step and all downstream steps, then calls `_execute(startIdx, savedInput)`.

### Prompts
All prompt functions in `app.js` prefixed with `p`:

| Function | Framework | Key behaviour |
|----------|-----------|--------------|
| `pRisen` | RISEN | 7-step rewrite — keyword map, bullet reorder, summary rewrite. Never deletes bullets. |
| `pXyz` | XYZ | Rewrites weak/passive bullets only. Leaves strong bullets untouched. |
| `pKeywordAudit` | Keyword Gap (audit) | 4-column gap table + CRITICAL / OPTIONAL / FORMAT lists |
| `pKeywordFill` | Keyword Gap (fill) | Incorporates CRITICAL keywords, marks changes [UPDATED] |
| `pCar` | CAR | Rewrites 3 most narrative bullets using Challenge→Action→Result |
| `pRecruiterDraft` | Recruiter (draft) | 7-second screener persona, full tailored draft |
| `pRecruiterCritique` | Recruiter (critique) | Self-scores 0–100, rewrites 3 weakest bullets |

Each prompt instructs the model to wrap output in `<resume>…</resume>` tags. `extractResume()` parses those tags; falls back to full text if absent.

All prompts enforce: same bullet count per role as input — rewrite to improve, never delete or merge.

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
