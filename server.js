import express from 'express';
import { MAX_EVIDENCE_CHARS, compactEvidence } from './src/core/evidence.js';
import path from 'path';
import { fileURLToPath } from 'url';

import { OcrAgent } from './src/agents/ocr-agent.js';
import { StructuringAgent } from './src/agents/structuring-agent.js';
import { OpenAiClient } from './src/core/openai-client.js';
import { buildMarcRecord } from './src/core/marc-builder.js';
import { cleanLlmOutput, validateMetadata } from './src/core/llm-parser.js';
import { cleanExtractedText } from './src/utils/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.5';
const openai = new OpenAiClient({
  apiKey: process.env.OPENAI_API_KEY,
  defaultModel: DEFAULT_OPENAI_MODEL
});

const ocrAgent = new OcrAgent(openai);
const structuringAgent = new StructuringAgent(openai);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(express.json({ limit: '100mb' }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowAll = allowedOrigins.includes('*');
  if (allowAll || (origin && allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', allowAll ? '*' : origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.static(path.join(__dirname)));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    provider: 'openai',
    model: DEFAULT_OPENAI_MODEL,
    hasApiKey: Boolean(process.env.OPENAI_API_KEY)
  });
});

app.post('/api/extract-metadata', async (req, res) => {
  try {
    const { text: rawText, standard, agency, format: formatType, catLang, pageCount, images } = req.body;
    if (!rawText && (!images || images.length === 0)) {
      return res.status(400).json({ error: 'Text or images are required' });
    }

    const text = cleanExtractedText(rawText || '');
    const imgs = Array.isArray(images) ? images.filter(i => i.data) : [];

    if (imgs.filter(i => Number.isInteger(i.page)).length > 10 || imgs.filter(i => !Number.isInteger(i.page)).length > 10) return res.status(400).json({ error: 'Máximo 10 imágenes adjuntas y 10 páginas PDF candidatas por solicitud.' });
    let sourceText = text.includes('[') ? text : '[Texto aportado]\n' + text;
    for (let i = 0; i < imgs.length; i += 3) {
      const batch = imgs.slice(i, i + 3);
      const ocr = await ocrAgent.process(batch, 'spa');
      sourceText += '\n\n' + ocr.rawText;
    }
    sourceText = compactEvidence(sourceText);
    const structured = await structuringAgent.structure(sourceText, {
      catLang: 'spa', formatType: formatType || 'book', pageCount, missing: req.body.missing || []
    });
    // A literal quote is checked in its claimed source, never inferred from fuzzy word matches.
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const segments = [...sourceText.matchAll(/\[([^\]\n]+)\]\s*([^]*?)(?=\[[^\]\n]+\]|$)/g)];
    for (const ev of Object.values(structured.metadata.evidence || {})) {
      if (!ev || typeof ev !== 'object') continue;
      const segment = segments.find(m => normalize(m[1]) === normalize(ev.source));
      ev.verified = ev.status === 'observed' && normalize(ev.quote).length >= 4 && !!segment && normalize(segment[2]).includes(normalize(ev.quote));
    }
    if (req.body.previous && Array.isArray(req.body.missing)) {
      const previous = req.body.previous;
      const fresh = structured.metadata;
      const merged = { ...previous, evidence: { ...(previous.evidence || {}) } };
      for (const key of req.body.missing.filter(k => Object.hasOwn(fresh, k) && !['__proto__','constructor','prototype','evidence'].includes(k))) {
        if (fresh[key]) { merged[key] = fresh[key]; merged.evidence[key] = fresh.evidence?.[key]; }
      }
      structured.metadata = merged;
    }

    const result = buildMarcRecord(structured.metadata, {
      agency: process.env.CATALOGING_AGENCY || '',
      formatType: formatType || 'book',
      catLang: 'spa',
      pageCount
    });

    res.json({ result, source: structured.metadata });

  } catch (error) {
    console.error('Error in /api/extract-metadata:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/format', (req, res) => {
  try {
    const { source, text, standard, agency, format: formatType, catLang, pageCount } = req.body;
    if (!source) return res.status(400).json({ error: 'Source metadata is required' });

    const validated = validateMetadata(source);
    const cleaned = cleanLlmOutput(validated, text || '', { pageCount, formatType });

    const result = buildMarcRecord(cleaned, {
      agency: process.env.CATALOGING_AGENCY || '',
      formatType: formatType || 'book',
      catLang: 'spa',
      pageCount
    });
    res.json({ result });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ocr', async (req, res) => {
  try {
    const { images, catLang } = req.body;
    if (!images || images.length === 0) {
      return res.status(400).json({ error: 'Images are required' });
    }

    if (!Array.isArray(images) || images.length > 10) return res.status(400).json({ error: 'Máximo 10 imágenes.' });
    const result = await ocrAgent.process(images, 'spa');
    res.json({ text: result.rawText, source: result.source });
  } catch (error) {
    console.error('Error in /api/ocr:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/structure', async (req, res) => {
  try {
    const { text, format: formatType, catLang, pageCount } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });

    const result = await structuringAgent.structure(text, {
      catLang: 'spa',
      formatType: formatType || 'book',
      pageCount
    });
    res.json({ metadata: result.metadata });
  } catch (error) {
    console.error('Error in /api/structure:', error);
    res.status(500).json({ error: error.message });
  }
});

export const server = app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`  OpenAI OCR Agent: ${process.env.OPENAI_OCR_MODEL || DEFAULT_OPENAI_MODEL}`);
  console.log(`  OpenAI Structuring Agent: ${process.env.OPENAI_STRUCTURING_MODEL || DEFAULT_OPENAI_MODEL}`);
});
