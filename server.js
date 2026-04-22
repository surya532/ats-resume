const express  = require('express');
const multer   = require('multer');
const pdfParse = require('pdf-parse');
const mammoth  = require('mammoth');
const { Readable } = require('stream');
require('dotenv').config();

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.static('public'));

// ── File upload ──────────────────────────────────────────────────────────────
app.post('/api/upload', upload.single('resume'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { mimetype, buffer, originalname } = req.file;
  try {
    let text = '';
    if (mimetype === 'application/pdf' || originalname.endsWith('.pdf')) {
      const data = await pdfParse(buffer);
      text = data.text;
    } else if (
      mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      originalname.endsWith('.docx')
    ) {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      return res.status(400).json({ error: 'Please upload a PDF or DOCX file.' });
    }
    res.json({ text: text.trim() });
  } catch (err) {
    res.status(500).json({ error: `Could not parse file: ${err.message}` });
  }
});

const API_BASE = process.env.API_BASE_URL || 'https://api.cerebras.ai/v1';
const API_KEY  = process.env.API_KEY || process.env.GROQ_API_KEY;
const PROVIDER = new URL(API_BASE).hostname.split('.').slice(-2, -1)[0];

console.log(`Provider: ${PROVIDER} — ${API_BASE}`);

// ── LLM proxy ────────────────────────────────────────────────────────────────
app.post('/api/claude', express.json(), async (req, res) => {
  try {
    const response = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({ ...req.body, stream: true })
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`${PROVIDER} ${response.status}:`, text);
      return res.status(response.status).send(text);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    Readable.fromWeb(response.body).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('Running at http://localhost:3000'));
