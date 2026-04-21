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
  card.scrollIntoView({ behavior: 'smooth' });

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
  card.scrollIntoView({ behavior: 'smooth' });

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
  const m = body.match(/try again in ([\d.]+)s/i);
  // Always wait at least 65s so the 60s rolling TPM window fully resets
  return Math.max(m ? Math.ceil(parseFloat(m[1])) + 2 : 65, 65);
}

async function callClaude(messages, onChunk) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 4000, messages })
    });

    if (res.status === 429) {
      const body = await res.text();
      const wait = parseRetrySeconds(body);
      for (let s = wait; s > 0; s--) {
        onChunk(`\r⏳ Rate limited — retrying in ${s}s…`);
        await sleep(1000);
      }
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
  return `You are a senior technical recruiter and Certified Professional Resume Writer with 15 years of experience.

Tailor the resume for the job description. Maintain 100% factual accuracy — do not invent experience, metrics, tools, or projects.

Steps:
1. Extract all required hard skills, tools, and frameworks from the JD (explicit and implied).
2. Identify every keyword/phrase in the JD absent from the resume.
3. Map each missing keyword to the closest matching experience.
4. Rewrite bullets to incorporate missing keywords naturally.
5. Reorder bullets within each role to front-load JD-relevant achievements.
6. Rewrite the professional summary to mirror the JD's top 3 requirements.
7. Keep the resume to ONE PAGE maximum.

Voice constraints:
${voice || 'None specified.'}

Rules: No keyword-stuffing. No invented metrics. Preserve all existing quantified achievements.

Output the complete tailored resume wrapped in <resume>…</resume> tags, then list every keyword added and where it was placed.

--- RESUME ---
${resume}

--- JOB DESCRIPTION ---
${jd}`;
}

function pXyz(resume, jd) {
  return `You are a resume writer specializing in quantified achievement bullets.

Rewrite every weak or passive bullet using the XYZ formula:
"Accomplished [X], by doing [Y], which resulted in [Z]."

Rules:
- Only rewrite weak bullets (passive voice, vague, "responsible for", no metrics).
- Leave strong, already-quantified bullets untouched.
- Use past tense. No special characters or markdown.
- Do not invent metrics — suggest 2–3 plausible ranges marked [VERIFY] if none exist.
- Keep total resume to ONE PAGE.

Output the full updated resume in <resume>…</resume> tags, then list which bullets changed and why.

--- RESUME ---
${resume}

--- TARGET ROLE CONTEXT ---
${jd}`;
}

function pKeywordAudit(originalResume, currentResume, jd) {
  return `Analyze the job description and produce a keyword gap report.

Output a table:
| JD Keyword | Present? | Phrase Used | Closest Existing Experience |

Then list:
- CRITICAL missing keywords (2+ times in JD, or in Requirements)
- OPTIONAL missing keywords (once, or in Nice-to-Have)
- FORMAT issues that would cause ATS parsing failure

--- ORIGINAL RESUME ---
${originalResume}

--- CURRENT RESUME ---
${currentResume}

--- JOB DESCRIPTION ---
${jd}`;
}

function pKeywordFill(currentResume, auditReport) {
  return `Using the keyword gap report, rewrite bullets to naturally incorporate every CRITICAL missing keyword.

Constraints:
- Only add a keyword where genuine matching experience exists.
- Preserve all existing quantified metrics exactly — rephrase only, never change numbers.
- Mark each changed bullet with [UPDATED].
- No more than 2 bullets in any role may start with the same action verb.
- Keep total resume to ONE PAGE.

Output the full updated resume in <resume>…</resume> tags.

--- CURRENT RESUME ---
${currentResume}

--- KEYWORD GAP REPORT ---
${auditReport}`;
}

function pCar(currentResume, jd) {
  return `You are a resume writer applying the CAR method (Challenge → Action → Result).

Identify the 3 bullets that are least concise — narrative, burying the result, or not leading with impact.

For each, write a single ATS-optimized bullet:
Format: Past-tense action verb + Brief challenge + Specific actions + Measurable result
Length: Max 2 lines per bullet

Output the full resume with those 3 bullets replaced in <resume>…</resume> tags. Mark changed bullets with [CAR].
Keep total resume to ONE PAGE.

--- RESUME ---
${currentResume}

--- TARGET ROLE CONTEXT ---
${jd}`;
}

function pRecruiterDraft(currentResume, jd) {
  return `Act as a senior technical recruiter screening 200 resumes per day. You have 7 seconds per resume.

Produce the best possible final tailored version of this resume. No commentary — resume only.
Single-column format. No tables, no graphics. ONE PAGE maximum.

Output the resume in <resume>…</resume> tags.

--- RESUME ---
${currentResume}

--- JOB DESCRIPTION ---
${jd}`;
}

function pRecruiterCritique(draftResume, jd) {
  return `You are the same recruiter, reviewing the resume you just produced as if seeing it for the first time.

Score it 0–100 and answer:
1. Which 3 bullets are weakest and why?
2. Which keywords from the JD are still missing?
3. Any red flags a recruiter would notice?
4. What would make you stop reading before line 10?

Rewrite the 3 weakest bullets.

Output the complete polished resume in <resume>…</resume> tags. ONE PAGE maximum.

--- RESUME ---
${draftResume}

--- JOB DESCRIPTION ---
${jd}`;
}


// ── Pipeline ─────────────────────────────────────────────────────────────────

async function runPipeline() {
  const resume = getResumeText();
  const voice  = voiceEl.value.trim();
  const jd     = jdEl.value.trim();

  if (!resume) { alert('Please upload a resume or paste your resume text.'); return; }
  if (!jd)     { alert('Please paste the job description.'); return; }

  const btn = document.getElementById('runBtn');
  btn.disabled = true;
  btn.textContent = 'Running…';

  buildUI();

  // Redact personal info before anything leaves the browser
  const safeResume = redact(resume);
  let cur = safeResume;

  try {
    // 1 — RISEN
    setStatus('risen', 'running');
    cur = extractResume(await callClaude(
      [{ role: 'user', content: pRisen(safeResume, voice, jd) }],
      t => append('risen', t)
    ));
    setStatus('risen', 'done');

    // 2 — XYZ
    setStatus('xyz', 'running');
    cur = extractResume(await callClaude(
      [{ role: 'user', content: pXyz(cur, jd) }],
      t => append('xyz', t)
    ));
    setStatus('xyz', 'done');

    // 3 — Keyword Gap (audit then fill, small pause between the two back-to-back calls)
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

    // 4 — CAR
    setStatus('car', 'running');
    cur = extractResume(await callClaude(
      [{ role: 'user', content: pCar(cur, jd) }],
      t => append('car', t)
    ));
    setStatus('car', 'done');

    // 5 — Recruiter Review (draft then critique, small pause between)
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

    showFinal(cur);

  } catch (err) {
    console.error(err);
    const running = document.querySelector('.step-card.running');
    if (running) {
      const id = running.id.replace('step-', '');
      setStatus(id, 'error');
      append(id, `\n\nError: ${err.message}`);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run All 5 Steps';
  }
}

function showFinal(text) {
  const pipeline = document.getElementById('pipeline');
  const div = document.createElement('div');
  div.className = 'final-card';
  div.innerHTML = `
    <div class="final-header">
      <span>Final Resume</span>
      <button class="copy-btn" id="copyFinalBtn">Copy to clipboard</button>
    </div>
    <div class="final-text" id="finalText">${escHtml(text)}</div>`;
  pipeline.appendChild(div);
  div.scrollIntoView({ behavior: 'smooth' });
  document.getElementById('copyFinalBtn').onclick = () => {
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('copyFinalBtn');
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy to clipboard', 2000);
    });
  };
}
