# ATS Resume Optimizer — Claude Code Guide

## Architecture

```
server.js          Express server — two endpoints:
                     POST /api/upload  file parsing (PDF/DOCX → plain text)
                     POST /api/claude  LLM API proxy (streams SSE back to browser)

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
3. Runs 6 sequential `callClaude()` calls (steps 3 and 5 each have two back-to-back calls with a 3s pause between)
4. Each step extracts `<resume>…</resume>` from the model output and passes it to the next step
5. Step 6 scores original vs final resume, outputs `<ats>{…}</ats>` JSON parsed by `extractAtsScore()`
6. Final resume shown in a scrollable copyable card with an ATS before/after score strip above it

### Rate limiting & model fallback
`callClaude()` retries up to 10 times on 429/413/400. Model fallback chain:
- `llama3.1-8b` (primary — 60k TPM, 30 req/min) → `qwen-3-235b-a22b-instruct-2507` (fallback)
- 429 TPM: waits `parseRetrySeconds(body) + 5s` (handles `22m10s` format), shows live countdown badge
- 429 TPD / 413 too large: adds model to `dailyExhausted` set, switches to next model immediately
- 400 decommissioned: switches to next model immediately
- 400 restricted: throws immediately with clear message — does not retry
- All models exhausted: throws "try again tomorrow" — does not loop

### Retry from step
`_state.inputs[stepId]` stores the resume text entering each step. On failure, a **Retry from this step** button calls `retryFromStep(id)`, which resets that step and all downstream steps, then calls `_execute(startIdx, savedInput)`. Both `modelIndex` and `dailyExhausted` are reset on each fresh run and retry.

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
| `pAtsScore` | ATS Score | Scores original vs optimized on 4 categories, outputs `<ats>` JSON |

Each prompt instructs the model to wrap resume output in `<resume>…</resume>` tags. `extractResume()` parses those tags; falls back to full text if absent.

All prompts enforce: same bullet count per role as input — rewrite to improve, never delete or merge.

## Environment

```
API_BASE_URL=   # OpenAI-compatible base URL (default: https://api.cerebras.ai/v1)
API_KEY=        # API key for the chosen provider
# GROQ_API_KEY= # legacy fallback — still works if API_KEY is not set
```

Supported providers (edit .env only — no code changes):

| Provider | API_BASE_URL |
|----------|-------------|
| Cerebras | `https://api.cerebras.ai/v1` |
| Together AI | `https://api.together.xyz/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| Groq | `https://api.groq.com/openai/v1` |

## Commands

```bash
npm start        # start server on :3000
```

## Constraints

- `max_tokens: 2000` per call — llama3.1-8b has an 8192 context window; resume + JD input consumes most of it
- Personal info is redacted client-side before leaving the browser — the server never sees it
- No build step, no bundler — edit and refresh
