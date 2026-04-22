// ── Personal info redaction ──────────────────────────────────────────────────

function redact(text) {
  return text
    // Name: first non-empty line of a resume is always the name
    .replace(/^[^\n\r]+/, '[YOUR NAME]')
    // Email
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[YOUR EMAIL]')
    // Phone — handles +1, dashes, dots, spaces, parentheses
    .replace(/(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, '[YOUR PHONE]')
    // LinkedIn
    .replace(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+\/?/gi, '[YOUR LINKEDIN]');
}

// ── State ───────────────────────────────────────────────────────────────────

let uploadedText = '';

const voiceEl = document.getElementById('voice');
const jdEl    = document.getElementById('jd');

voiceEl.value = localStorage.getItem('ats-voice') || '';
voiceEl.addEventListener('input', () => localStorage.setItem('ats-voice', voiceEl.value));

// Restore saved paste text
const resumeEl = document.getElementById('resume');
resumeEl.value = localStorage.getItem('ats-resume') || '';
resumeEl.addEventListener('input', () => localStorage.setItem('ats-resume', resumeEl.value));

// ── Tab switching ────────────────────────────────────────────────────────────

function switchTab(tab) {
  document.getElementById('panelUpload').classList.toggle('active', tab === 'upload');
  document.getElementById('panelPaste').classList.toggle('active',  tab === 'paste');
  document.getElementById('tabUpload').classList.toggle('active',   tab === 'upload');
  document.getElementById('tabPaste').classList.toggle('active',    tab === 'paste');
  if (tab === 'paste') document.getElementById('resume').focus();
}

// ── File upload ──────────────────────────────────────────────────────────────

function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('uploadZone').classList.add('drag');
}
function handleDragLeave() {
  document.getElementById('uploadZone').classList.remove('drag');
}
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('uploadZone').classList.remove('drag');
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
}
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) processFile(file);
}

async function processFile(file) {
  const zone = document.getElementById('uploadZone');
  const card = document.getElementById('fileCard');

  zone.style.pointerEvents = 'none';
  zone.querySelector('p').innerHTML = '<span class="spinner"></span> Parsing…';

  const form = new FormData();
  form.append('resume', file);

  try {
    const res  = await fetch('/api/upload', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    uploadedText = data.text;

    zone.style.display = 'none';
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = (file.size / 1024).toFixed(0) + ' KB';
    card.classList.add('visible');

  } catch (err) {
    zone.style.pointerEvents = '';
    zone.querySelector('p').innerHTML = `<strong style="color:var(--error)">${err.message}</strong><br>Try another file.`;
  }
}

function clearFile() {
  uploadedText = '';
  document.getElementById('fileInput').value = '';
  document.getElementById('fileCard').classList.remove('visible');
  const zone = document.getElementById('uploadZone');
  zone.style.display = '';
  zone.style.pointerEvents = '';
  zone.querySelector('p').innerHTML = '<strong>Drop your resume here</strong><br>PDF or DOCX';
}

function getResumeText() {
  return uploadedText || document.getElementById('resume').value.trim();
}

// ── Generate bullets ─────────────────────────────────────────────────────────

function toggleGenForm() {
  const form   = document.getElementById('genForm');
  const toggle = document.getElementById('genToggle');
  const open   = form.classList.toggle('open');
  toggle.classList.toggle('open', open);
  if (open) document.getElementById('genDesc').focus();
}

async function generateBullets() {
  const desc   = document.getElementById('genDesc').value.trim();
  const count  = parseInt(document.getElementById('genCount').value) || 3;
  const resume = getResumeText();
  const voice  = voiceEl.value.trim();
  const jd     = jdEl.value.trim();

  if (!desc) { document.getElementById('genDesc').focus(); return; }

  const btn = document.getElementById('genBtn');
  btn.disabled = true;
  btn.textContent = 'Generating…';

  document.getElementById('emptyState')?.remove();

  const pipeline = document.getElementById('pipeline');
  const card = document.createElement('div');
  card.className = 'bullets-card';
  card.innerHTML = `
    <div class="bullets-header">
      <span>Generated Bullets</span>
      <small><span class="spinner"></span>Writing…</small>
    </div>
    <div class="bullets-streaming" id="bulletStream"></div>`;
  pipeline.appendChild(card);
  pipeline.scrollTo({ top: pipeline.scrollHeight, behavior: 'smooth' });

  const prompt = `You are a resume writer. Generate exactly ${count} resume bullet points for the experience described below.

Rules:
- Use the XYZ formula: "Accomplished [X], by doing [Y], which resulted in [Z]"
- Start each bullet with a strong past-tense action verb
- Each bullet must be 1–2 lines maximum
- Match the tone and style of the existing resume
- Optimize wording to match keywords in the target role
- Do not invent specific numbers — mark estimates with [VERIFY]
${voice ? `\nVoice preferences:\n${voice}` : ''}

Experience to write bullets for:
${desc}
${resume ? `\nExisting resume (style reference):\n${resume}` : ''}
${jd ? `\nTarget role context:\n${jd}` : ''}

Output ONLY the bullets, one per line. No numbering, no dashes, no extra commentary.`;

  let raw = '';
  try {
    raw = await callClaude(
      [{ role: 'user', content: prompt }],
      t => { document.getElementById('bulletStream').textContent += t; }
    );
  } catch (err) {
    card.querySelector('.bullets-header small').textContent = '✗ Error';
    document.getElementById('bulletStream').textContent += `\n\nError: ${err.message}`;
    btn.disabled = false;
    btn.textContent = 'Generate';
    return;
  }

  const bullets = raw.split('\n')
    .map(l => l.replace(/^[-•*\d.)\s]+/, '').trim())
    .filter(l => l.length > 10);

  card.innerHTML = `
    <div class="bullets-header">
      <span>Generated Bullets</span>
      <small>${bullets.length} bullet${bullets.length !== 1 ? 's' : ''}</small>
    </div>
    ${bullets.map((b, i) => `
      <div class="bullet-item">
        <div class="bullet-text">${escHtml(b)}</div>
        <button class="bullet-copy" onclick="copyBullet(this, ${i})">Copy</button>
      </div>`).join('')}`;
  card._bullets = bullets;
  pipeline.scrollTo({ top: pipeline.scrollHeight, behavior: 'smooth' });

  btn.disabled = false;
  btn.textContent = 'Generate';
}

function copyBullet(btn, index) {
  const card = btn.closest('.bullets-card');
  navigator.clipboard.writeText(card._bullets[index]).then(() => {
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
  });
}

// ── Step UI ──────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 'risen',       num: 1, name: 'RISEN',            sub: 'Full resume rewrite' },
  { id: 'xyz',         num: 2, name: 'XYZ',              sub: 'Bullet optimization' },
  { id: 'keyword-gap', num: 3, name: 'Keyword Gap',      sub: 'Audit + fill (2 passes)' },
  { id: 'car',         num: 4, name: 'CAR',              sub: 'Story compression' },
  { id: 'recruiter',   num: 5, name: 'Recruiter Review', sub: 'Draft + self-critique (2 phases)' },
  { id: 'ats-score',   num: 6, name: 'ATS Score',        sub: 'Before vs after scorecard' },
];

function buildUI() {
  const pipeline = document.getElementById('pipeline');
  document.getElementById('emptyState')?.remove();
  pipeline.innerHTML = '';

  for (const s of STEPS) {
    const card = document.createElement('div');
    card.className = 'step-card';
    card.id = `step-${s.id}`;
    card.innerHTML = `
      <div class="step-header" onclick="toggleStep('${s.id}')">
        <div class="step-num">${s.num}</div>
        <div>
          <div class="step-title">${s.name}</div>
          <div class="step-sub">${s.sub}</div>
        </div>
        <div class="step-badge" id="badge-${s.id}">Waiting</div>
        <svg class="step-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      <div class="step-body">
        <div class="step-output" id="out-${s.id}"></div>
      </div>`;
    pipeline.appendChild(card);
  }
}

function toggleStep(id) {
  const card = document.getElementById(`step-${id}`);
  // Only toggle if the step has content (running, done, or error)
  if (!card.classList.contains('running') &&
      !card.classList.contains('done') &&
      !card.classList.contains('error')) return;
  card.classList.toggle('open');
}

function setStatus(id, state) {
  const card  = document.getElementById(`step-${id}`);
  const badge = document.getElementById(`badge-${id}`);
  // Preserve open state when transitioning running → done
  const wasOpen = card.classList.contains('open');
  card.className = `step-card ${state}${(state === 'running' || wasOpen) ? ' open' : ''}`;
  if (state === 'running') badge.innerHTML = `<span class="spinner"></span>Running…`;
  else if (state === 'done')  badge.textContent = '✓ Done';
  else if (state === 'error') badge.textContent = '✗ Error';
}

function append(id, text) {
  const el = document.getElementById(`out-${id}`);
  el.textContent += text;
  el.scrollTop = el.scrollHeight;
}

// ── API ──────────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseRetrySeconds(body) {
  // Handles "22m10.56s", "1h5m3s", plain "38.7s"
  let secs = 0;
  const h = body.match(/(\d+)h/i);
  const m = body.match(/(\d+)m/i);
  const s = body.match(/([\d.]+)s/i);
  if (h) secs += parseInt(h[1]) * 3600;
  if (m) secs += parseInt(m[1]) * 60;
  if (s) secs += parseFloat(s[1]);
  // Add a 5s buffer; floor at 65s for TPM limits
  return secs > 0 ? Math.ceil(secs) + 5 : 65;
}

// Model list — works for Cerebras, Groq, and most OpenAI-compatible providers.
// Override by setting API_BASE_URL + API_KEY in .env and updating this list.
const MODELS = ['llama-3.3-70b', 'llama-3.1-70b', 'llama-3.1-8b'];
let modelIndex = 0;
const dailyExhausted = new Set(); // models that hit daily limit this session

async function callClaude(messages, onChunk) {
  for (let attempt = 0; attempt < 10; attempt++) {
    // Skip any model already at daily limit
    while (modelIndex < MODELS.length && dailyExhausted.has(MODELS[modelIndex])) modelIndex++;
    if (modelIndex >= MODELS.length) throw new Error('Daily token limit reached on all models. Try again tomorrow.');

    const model = MODELS[modelIndex];
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 4000, messages })
    });

    // 400: decommissioned → switch model; restricted → stop immediately
    if (res.status === 400) {
      const body = await res.text();
      if (body.includes('organization_restricted') || body.includes('restricted')) {
        throw new Error('API account restricted. Check your provider account status.');
      }
      if (body.includes('decommissioned') && modelIndex < MODELS.length - 1) {
        modelIndex++;
        const fallback = MODELS[modelIndex];
        onChunk(`\n⚡ ${model} decommissioned — switching to ${fallback}\n`);
        const badge = document.querySelector('.step-card.running .step-badge');
        if (badge) badge.innerHTML = `<span class="spinner"></span>Switching…`;
        continue;
      }
      throw new Error(`API 400: ${body}`);
    }

    if (res.status === 429 || res.status === 413) {
      const body    = await res.text();
      const isDaily = body.includes('TPD') || body.includes('per day');
      const badge   = document.querySelector('.step-card.running .step-badge');

      if (isDaily || res.status === 413) {
        // Mark this model as daily-exhausted and try next one immediately
        dailyExhausted.add(model);
        onChunk(`\n⚡ ${model} daily limit hit — trying next model\n`);
        if (badge) badge.innerHTML = `<span class="spinner"></span>Switching model…`;
        modelIndex++;
        if (modelIndex >= MODELS.length) throw new Error('Daily token limit reached on all models. Try again tomorrow.');
        continue;
      }

      // TPM limit — wait and retry same model
      const wait  = parseRetrySeconds(body);
      for (let s = wait; s > 0; s--) {
        const display = s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
        if (badge) badge.innerHTML = `⏳ ${display}`;
        onChunk(`\r⏳ Rate limited — retrying in ${display}…`);
        await sleep(1000);
      }
      if (badge) badge.innerHTML = `<span class="spinner"></span>Retrying…`;
      onChunk('\n');
      continue;
    }

    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    let buf  = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') continue;
        try {
          const ev   = JSON.parse(raw);
          const text = ev.choices?.[0]?.delta?.content;
          if (text) { full += text; onChunk(text); }
        } catch {}
      }
    }
    return full;
  }
  throw new Error('Max retries exceeded due to rate limiting.');
}

function extractResume(text) {
  const m = text.match(/<resume>([\s\S]*?)<\/resume>/i);
  return m ? m[1].trim() : text.trim();
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Prompts ──────────────────────────────────────────────────────────────────

function pRisen(resume, voice, jd) {
  return `You are a senior technical recruiter and Certified Professional Resume Writer with 15 years of experience screening software engineers at FAANG and Series B+ startups.

Tailor this software engineer resume for the job description below. Maintain 100% factual accuracy — do not invent any experience, metric, tool, or project that is not already in the resume.

Steps:
1. Extract all required hard skills, tools, and frameworks from the JD (explicit and implied).
2. Identify every keyword/phrase in the JD that is absent from the resume.
3. Map each missing keyword to the closest matching experience in the resume.
4. Rewrite bullet points to incorporate missing keywords using natural language.
5. Reorder experience bullets within each role to prioritize JD-relevant achievements first.
6. Rewrite the professional summary to directly mirror the JD's top 3 requirements.
7. Audit formatting: flag any tables, columns, or text boxes that would fail ATS parsing.

Voice constraints:
${voice || 'None specified.'}

Rules: Do not keyword-stuff. Do not invent metrics. Do not remove any quantified achievements from the original. Keep the same number of bullets per role — rewrite each bullet to be stronger, but never delete one. Keep the resume to 2 pages maximum.

Output the complete tailored resume in <resume>…</resume> tags, then list every keyword added and where it was placed.

--- RESUME ---
${resume}

--- JOB DESCRIPTION ---
${jd}`;
}

function pXyz(resume, jd) {
  return `Rewrite each weak or passive resume bullet using the XYZ formula:
"Accomplished [X], by doing [Y], which resulted in [Z]."

Rules:
- Only rewrite weak bullets (passive voice, vague, "responsible for", no metrics). Leave strong, already-quantified bullets untouched.
- Keep each bullet under 2 lines.
- Use past tense. No special characters or markdown formatting.
- Do not invent metrics — if no metric exists, suggest 2–3 plausible ranges marked [VERIFY].
- Never delete a bullet or merge two into one. The output must have the same bullet count per role as the input.
- Target role context: ${jd.slice(0, 300)}

Output the full updated resume in <resume>…</resume> tags, then list which bullets changed and why.

--- RESUME ---
${resume}`;
}

function pKeywordAudit(originalResume, currentResume, jd) {
  return `Analyze this job description and produce a structured keyword gap report.

Produce a table with 4 columns:
| JD Keyword | Present in Resume? | If Yes — Exact Phrase Used | If No — Closest Existing Experience |

Then separately list:
- CRITICAL missing keywords (appear 2+ times in JD or in "Requirements" section)
- OPTIONAL missing keywords (appear once, in "Nice to Have" section)
- FORMAT issues that would cause ATS parsing failure

--- RESUME ---
${currentResume}

--- JOB DESCRIPTION ---
${jd}`;
}

function pKeywordFill(currentResume, auditReport) {
  return `Using the keyword gap report below, rewrite resume bullets to naturally incorporate the CRITICAL missing keywords.

Constraints:
- Only use keywords where genuine experience exists (as shown in the resume).
- Keep all existing quantified metrics intact — only rephrase, never change numbers.
- Mark each changed bullet with [UPDATED] so it can be reviewed.
- Do not start more than 2 bullets in any role with the same action verb.
- Never delete a bullet or merge two into one. Same bullet count per role as input.

Output the full updated resume in <resume>…</resume> tags.

--- CURRENT RESUME ---
${currentResume}

--- KEYWORD GAP REPORT ---
${auditReport}`;
}

function pCar(currentResume, jd) {
  return `You are a resume writer. Apply the CAR method (Challenge → Action → Result) to compress the 3 most narrative or verbose bullets in this resume.

Identify the 3 bullets that are least concise — narrative, burying the result, or not leading with impact.

For each, convert it into a single ATS-optimized bullet:
Format: Past-tense action verb + Challenge (brief) + Specific Actions + Measurable Result
Length: Max 2 lines per bullet.
Only include a metric if it is already in the original bullet. If approximate, add [APPROX].

Target role context: ${jd.slice(0, 300)}

Output the full resume with those 3 bullets replaced in <resume>…</resume> tags. Mark changed bullets with [CAR].
Leave all other bullets exactly as-is. Never delete a bullet or merge two into one.

--- RESUME ---
${currentResume}`;
}

function pRecruiterDraft(currentResume, jd) {
  return `Act as a senior technical recruiter who screens 200 software engineer resumes per day. You have 7 seconds to decide whether to advance a candidate.

Review this resume against the job description. Your job right now is ONLY to produce a tailored draft resume. Do not add commentary yet.

Output a complete tailored resume in <resume>…</resume> tags.
Single-column format. No tables or graphics.
Keep the same number of bullets per role as the input resume — rewrite each bullet to maximize recruiter impact, but never delete or merge bullets.

--- RESUME ---
${currentResume}

--- JOB DESCRIPTION ---
${jd}`;
}

function pRecruiterCritique(draftResume, jd) {
  return `Now switch roles. You are the same recruiter, but you are reviewing the tailored resume you just produced as if you had never seen it before.

Score it 0–100 against the job description and answer:
1. Which 3 bullets are weakest and why?
2. Which keywords from the JD are STILL missing?
3. Are there any red flags a recruiter would notice?
4. What would make you stop reading before line 10?

Then rewrite those 3 weakest bullets based on your own critique.

Output the complete polished resume in <resume>…</resume> tags.
Keep the same bullet count per role — only the 3 weakest bullets change, all others stay exactly as-is.

--- RESUME ---
${draftResume}

--- JOB DESCRIPTION ---
${jd}`;
}


function pAtsScore(originalResume, finalResume, jd) {
  return `You are an ATS scoring engine. Score two versions of a resume against the job description across 4 categories.

Categories (each 0–100):
- keywords:   Percentage of critical JD keywords present in the resume
- bullets:    Quality of bullets — quantified achievements, XYZ/CAR format, strong action verbs
- formatting: ATS-safe structure — no tables, columns, or graphics; clean standard sections
- relevance:  How well the overall experience narrative matches the target role

Overall score = weighted average (keywords 35%, bullets 30%, formatting 15%, relevance 20%).

Score the ORIGINAL resume first, then the OPTIMIZED resume.

Output this exact JSON inside <ats> tags — no text before or after the tags:
<ats>{"before":{"overall":0,"keywords":0,"bullets":0,"formatting":0,"relevance":0},"after":{"overall":0,"keywords":0,"bullets":0,"formatting":0,"relevance":0}}</ats>

After the closing </ats> tag, write 3–5 bullet points explaining the key improvements and what still needs work.

--- ORIGINAL RESUME ---
${originalResume}

--- OPTIMIZED RESUME ---
${finalResume}

--- JOB DESCRIPTION ---
${jd}`;
}

function extractAtsScore(text) {
  const m = text.match(/<ats>([\s\S]*?)<\/ats>/i);
  if (!m) return null;
  try { return JSON.parse(m[1].trim()); } catch { return null; }
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

const STEP_IDS = ['risen', 'xyz', 'keyword-gap', 'car', 'recruiter', 'ats-score'];

// Persists between runs so retry can resume mid-pipeline
let _state = { safeResume: '', voice: '', jd: '', inputs: {} };

async function runPipeline() {
  const resume = getResumeText();
  const voice  = voiceEl.value.trim();
  const jd     = jdEl.value.trim();

  if (!resume) { alert('Please upload a resume or paste your resume text.'); return; }
  if (!jd)     { alert('Please paste the job description.'); return; }

  modelIndex = 0;
  dailyExhausted.clear();
  buildUI();

  const safeResume = redact(resume);
  _state = { safeResume, voice, jd, inputs: {} };

  await _execute(0, safeResume);
}

async function retryFromStep(id) {
  const startIdx = STEP_IDS.indexOf(id);
  if (startIdx < 0 || !_state.inputs[id]) return;

  // Reset this step and every step after it
  for (let i = startIdx; i < STEP_IDS.length; i++) {
    const sid  = STEP_IDS[i];
    const card = document.getElementById(`step-${sid}`);
    card.className = 'step-card';
    document.getElementById(`badge-${sid}`).textContent = 'Waiting';
    document.getElementById(`out-${sid}`).textContent = '';
  }
  document.querySelector('.final-card')?.remove();
  modelIndex = 0;
  dailyExhausted.clear();

  await _execute(startIdx, _state.inputs[id]);
}

async function _execute(startIdx, initialCur) {
  const { safeResume, voice, jd } = _state;
  const btn = document.getElementById('runBtn');
  btn.disabled = true;
  btn.textContent = 'Running…';

  let cur = initialCur;

  try {
    if (startIdx <= 0) {
      _state.inputs['risen'] = cur;
      setStatus('risen', 'running');
      cur = extractResume(await callClaude(
        [{ role: 'user', content: pRisen(safeResume, voice, jd) }],
        t => append('risen', t)
      ));
      setStatus('risen', 'done');
    }

    if (startIdx <= 1) {
      _state.inputs['xyz'] = cur;
      setStatus('xyz', 'running');
      cur = extractResume(await callClaude(
        [{ role: 'user', content: pXyz(cur, jd) }],
        t => append('xyz', t)
      ));
      setStatus('xyz', 'done');
    }

    if (startIdx <= 2) {
      _state.inputs['keyword-gap'] = cur;
      setStatus('keyword-gap', 'running');
      const audit = await callClaude(
        [{ role: 'user', content: pKeywordAudit(safeResume, cur, jd) }],
        t => append('keyword-gap', t)
      );
      append('keyword-gap', '\n\n── Rewriting with gap findings ──\n\n');
      await sleep(3000);
      cur = extractResume(await callClaude(
        [{ role: 'user', content: pKeywordFill(cur, audit) }],
        t => append('keyword-gap', t)
      ));
      setStatus('keyword-gap', 'done');
    }

    if (startIdx <= 3) {
      _state.inputs['car'] = cur;
      setStatus('car', 'running');
      cur = extractResume(await callClaude(
        [{ role: 'user', content: pCar(cur, jd) }],
        t => append('car', t)
      ));
      setStatus('car', 'done');
    }

    if (startIdx <= 4) {
      _state.inputs['recruiter'] = cur;
      setStatus('recruiter', 'running');
      const draft = extractResume(await callClaude(
        [{ role: 'user', content: pRecruiterDraft(cur, jd) }],
        t => append('recruiter', t)
      ));
      append('recruiter', '\n\n── Self-critique phase ──\n\n');
      await sleep(3000);
      cur = extractResume(await callClaude(
        [{ role: 'user', content: pRecruiterCritique(draft, jd) }],
        t => append('recruiter', t)
      ));
      setStatus('recruiter', 'done');
    }

    let atsScores = null;
    if (startIdx <= 5) {
      _state.inputs['ats-score'] = cur;
      setStatus('ats-score', 'running');
      const scoreText = await callClaude(
        [{ role: 'user', content: pAtsScore(_state.safeResume, cur, jd) }],
        t => append('ats-score', t)
      );
      setStatus('ats-score', 'done');
      atsScores = extractAtsScore(scoreText);
    }

    showFinal(cur, atsScores);

  } catch (err) {
    console.error(err);
    const running = document.querySelector('.step-card.running');
    if (running) {
      const id = running.id.replace('step-', '');
      setStatus(id, 'error');
      append(id, `\n\nError: ${err.message}`);
      // Show retry button inside the failed step
      const outEl = document.getElementById(`out-${id}`);
      const btn2  = document.createElement('button');
      btn2.className   = 'retry-step-btn';
      btn2.textContent = '↺ Retry from this step';
      btn2.onclick     = () => retryFromStep(id);
      outEl.after(btn2);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run All 6 Steps';
  }
}

function scoreColor(n) {
  return n >= 80 ? 'sc-green' : n >= 60 ? 'sc-yellow' : 'sc-red';
}

function renderScoreCard(scores) {
  if (!scores) return '';
  const { before: b, after: a } = scores;
  const delta = a.overall - b.overall;
  const sign  = delta >= 0 ? '+' : '';
  const cats  = [
    ['Keyword Match', b.keywords,   a.keywords],
    ['Bullet Quality', b.bullets,    a.bullets],
    ['Formatting',    b.formatting, a.formatting],
    ['Relevance',     b.relevance,  a.relevance],
  ];
  return `
    <div class="score-card">
      <div class="score-overall">
        <div class="score-col">
          <div class="score-lbl">Before</div>
          <div class="score-num ${scoreColor(b.overall)}">${b.overall}</div>
        </div>
        <div class="score-arrow">→</div>
        <div class="score-col">
          <div class="score-lbl">After</div>
          <div class="score-num ${scoreColor(a.overall)}">${a.overall}</div>
        </div>
        <div class="score-delta ${delta >= 0 ? 'sc-green' : 'sc-red'}">${sign}${delta}</div>
      </div>
      <div class="score-breakdown">
        ${cats.map(([label, bv, av]) => `
          <div class="score-item">
            <span class="score-item-lbl">${label}</span>
            <span class="score-item-val">
              <span class="${scoreColor(bv)}">${bv}</span>
              <span class="sc-muted"> → </span>
              <span class="${scoreColor(av)}">${av}</span>
            </span>
          </div>`).join('')}
      </div>
    </div>`;
}

function showFinal(text, scores) {
  const pipeline = document.getElementById('pipeline');
  const div = document.createElement('div');
  div.className = 'final-card';
  div.innerHTML = `
    <div class="final-header">
      <span>Final Resume</span>
      <button class="copy-btn" id="copyFinalBtn">Copy to clipboard</button>
    </div>
    ${renderScoreCard(scores)}
    <div class="final-text" id="finalText">${escHtml(text)}</div>`;
  pipeline.appendChild(div);
  pipeline.scrollTo({ top: pipeline.scrollHeight, behavior: 'smooth' });
  document.getElementById('copyFinalBtn').onclick = () => {
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('copyFinalBtn');
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy to clipboard', 2000);
    });
  };
}
