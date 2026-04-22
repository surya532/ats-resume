# ATS Resume Optimizer

A local web app that runs your resume through 5 sequential AI-powered prompts to maximize ATS pass rate for a specific job description.

## Pipeline

| Step | Framework | What it does |
|------|-----------|-------------|
| 1 | RISEN | Full 7-step rewrite by a FAANG-level recruiter persona — keyword mapping, bullet reordering, summary rewrite |
| 2 | XYZ | Rewrites weak/passive bullets using "Accomplished X by doing Y resulting in Z" — leaves strong bullets untouched |
| 3 | Keyword Gap | 4-column audit of missing JD keywords, then rewrites to fill CRITICAL gaps with [UPDATED] markers |
| 4 | CAR | Compresses the 3 most narrative bullets using Challenge → Action → Result into tight impact statements |
| 5 | Recruiter Review | Draft pass (7-second screener) + self-critique scoring 0–100 to fix the 3 weakest bullets |

All steps preserve every bullet from every role — none are deleted or merged.

Personal info (name, email, phone, LinkedIn) is stripped client-side before any text is sent to the API.

## Setup

### 1. Get a Groq API key

Sign up at [console.groq.com](https://console.groq.com) — free tier, no card required.

### 2. Install dependencies

```bash
npm install
```

### 3. Add your API key

```bash
echo "GROQ_API_KEY=your_key_here" > .env
```

### 4. Start the server

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

1. **Upload** a PDF/DOCX resume or **paste** text in the Resume field
2. Optionally add voice preferences (words to avoid, preferred verbs, example bullets)
3. Paste the job description
4. Click **Run All 5 Steps** and wait — each step streams output live
5. Copy the final resume from the scrollable card at the bottom

Each completed step can be expanded/collapsed. If a step fails, a **Retry from this step** button appears — no need to rerun the full pipeline.

### Generate bullets

Click **Generate bullets to fill space** to create XYZ/CAR-formatted bullets for any experience you describe. Each bullet has its own copy button.

## Rate limits

Groq free tier allows 12,000 tokens/minute. If a step hits the limit, a live countdown badge appears on that step and it retries automatically. The pipeline completes without intervention — it just takes longer.

If the daily token limit is hit, the app automatically falls back through a model chain:
1. `llama-3.3-70b-versatile` (primary)
2. `meta-llama/llama-4-scout-17b-16e-instruct`
3. `llama-3.1-8b-instant`

## Stack

- Node.js + Express — API proxy and file parsing
- `pdf-parse` — PDF text extraction
- `mammoth` — DOCX text extraction
- `llama-3.3-70b-versatile` via Groq — all AI calls
- Vanilla JS — no frontend framework
