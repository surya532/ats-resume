# ATS Resume Optimizer — Claude Code Guide

## Architecture

```
server.js          Express server — two endpoints:
                     POST /api/upload  file parsing (PDF/DOCX → plain text)
                     POST /api/claude  LLM API proxy (streams SSE back to browser)

public/
  index.html       All CSS + HTML shell (no build step) — Inter font via Google Fonts
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
| `pCoverLetter` | — | 3-paragraph tailored cover letter, 200–250 words, no filler phrases |
| `pInterviewPrep` | — | 8 questions with talking points (behavioral, technical, deep-dive, why-us) |
| `pLinkedIn` | — | LinkedIn About (~1500 chars, 3 paras) + 3 headline variants (role-targeted, achievement-led, broad identity) |

Each pipeline prompt instructs the model to wrap resume output in `<resume>…</resume>` tags. `extractResume()` parses those tags; falls back to full text if absent.

All pipeline prompts enforce: same bullet count per role as input — rewrite to improve, never delete or merge.

### Post-pipeline features

**Layout** — No left panel. Top section (`.top-section`) has two equal `.input-card` columns (Resume left, JD right) plus a `.actions-row` with three buttons: `.act-primary` (Run Pipeline, `id="runBtn"`), `.act-btn` (`id="quickCoverBtn"`), `.act-btn` (`id="quickInterviewBtn"`). Below: `.steps-pane` (`id="stepsPane"`) is always in the DOM and fills remaining height — empty state, step cards, and final card all render here. `buildUI()` clears `stepsPane.innerHTML` and appends step cards directly; `showFinal()` appends the final card to `stepsPane`.

**Voice field** — collapsible toggle inside the Resume input card body. `#voiceToggle` / `#voiceInner`.

**Step UI** — Each step in the `STEPS` array has `tag` and `tagCls` fields rendered as colored framework badges in `buildUI()`. Tag classes: `tag-blue` (RISEN), `tag-blue` (XYZ), `tag-teal` (Keyword Gap), `tag-orange` (CAR), `tag-pink` (Recruiter), `tag-green` (ATS Score). `setStatus()` swaps the number circle to a checkmark SVG (`CHECK_SVG`) on done, restores it on retry/error. A CSS `::after` spinning ring animates the circle when running. Header progress uses labeled `.hp-step` + `.hp-connector` structure; `:has()` CSS colors labels by dot state.

**Color theme** — Deep Slate + Indigo: near-black backgrounds with cool indigo undertone (`--bg: #0d0d12`), indigo accent (`--accent: #6366f1`, `--accent2: #818cf8`, `--accent3: #4f46e5`), emerald green kept only for success states (`--success: #34d399`). All CSS custom properties in `:root` — no hardcoded color values outside the tag badge classes.

**Diff view** — `computeLineDiff(a, b)` runs an LCS DP on both resumes split into lines, producing `{ type: 'same'|'added'|'removed', text }` entries. `renderDiffView()` renders two side-by-side panels: left shows original (removed lines in red), right shows optimized (added lines in green). `toggleDiff()` switches `#resumeView` / `#diffView` visibility and toggles `.active` on `#diffBtn`.

**Cover letter / Interview prep / LinkedIn** — `_streamToOutputCard(cardId, title, bodyId, messages)` creates an `.output-card` in `stepsPane`, streams a `callClaude()` response into it, and disables all `.action-btn, .act-primary, .act-btn` elements during generation. `generateCoverLetter()`, `generateInterviewPrep()`, and `generateLinkedIn()` are triggered from the action bar (always accessible, `id="quickCoverBtn"` / `id="quickInterviewBtn"` / `id="quickLinkedInBtn"`) or from the final card. All three resolve the resume as `_finalResume || redact(getResumeText())` and JD as `_state.jd || jdEl.value.trim()` — the pipeline is not required.

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
