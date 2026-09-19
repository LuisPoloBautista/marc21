import { MetricsStore, newUsage, usageContext } from './src/core/metrics.js';
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
export const metrics = new MetricsStore({
  file: process.env.METRICS_FILE || path.join(__dirname, '.data', 'metrics.json'),
  libraryId: process.env.LIBRARY_ID || 'demo',
  libraryName: process.env.LIBRARY_NAME || 'Biblioteca demo',
  limit: process.env.LIBRARY_RECORD_LIMIT ? Number(process.env.LIBRARY_RECORD_LIMIT) : null
});
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
// Do not expose the metrics database as a static download.
app.use('/.data', (req, res) => res.sendStatus(404));
app.use(express.static(path.join(__dirname)));
app.get('/api/metrics', (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({...metrics.snapshot(), storage: process.env.METRICS_FILE ? 'configured' : 'local-demo'}); });

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    provider: 'openai',
    model: DEFAULT_OPENAI_MODEL,
    hasApiKey: Boolean(process.env.OPENAI_API_KEY)
  });
});

app.post('/api/extract-metadata', async (req, res) => {
  const usage = newUsage();
  let recordId;
  let success = false;
  return usageContext.run(usage, async () => {
  try {
    const { text: rawText, standard, agency, format: formatType, catLang, pageCount, images } = req.body;
    if (!rawText && (!images || images.length === 0)) {
      return res.status(400).json({ error: 'Text or images are required' });
    }

    const text = cleanExtractedText(rawText || '');
    const imgs = Array.isArray(images) ? images.filter(i => i.data) : [];

    if (imgs.length > 5) return res.status(400).json({ error: 'Máximo 5 imágenes en total, incluidas las páginas PDF para OCR.' });
    if (!['book','article','chapter','thesis','proceedings'].includes(formatType || 'book')) return res.status(400).json({error:'Tipo documental inválido.'});
    if (req.body.previous || req.body.missing) return res.status(400).json({error:'La búsqueda adicional fue retirada.'});
    recordId = metrics.reserve();
    let sourceText = text.includes('[') ? text : '[Texto aportado]\n' + text;
    for (let i = 0; i < imgs.length; i += 3) {
      const batch = imgs.slice(i, i + 3);
      const ocr = await ocrAgent.process(batch, 'spa');
      sourceText += '\n\n' + ocr.rawText;
    }
    sourceText = compactEvidence(sourceText);
    const structured = await structuringAgent.structure(sourceText, {
      catLang: 'spa', formatType: formatType || 'book', pageCount
    });
    // A literal quote is checked in its claimed source, never inferred from fuzzy word matches.
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const segments = [...sourceText.matchAll(/\[([^\]\n]+)\]\s*([^]*?)(?=\[[^\]\n]+\]|$)/g)];
    for (const ev of Object.values(structured.metadata.evidence || {})) {
      if (!ev || typeof ev !== 'object') continue;
      const segment = segments.find(m => normalize(m[1]) === normalize(ev.source));
      ev.verified = ev.status === 'observed' && normalize(ev.quote).length >= 4 && !!segment && normalize(segment[2]).includes(normalize(ev.quote));
    }
    structured.metadata._provenance = { id: recordId, date: new Date().toISOString(), library: metrics.libraryId };

    const result = buildMarcRecord(structured.metadata, {
      agency: process.env.CATALOGING_AGENCY || '',
      formatType: formatType || 'book',
      catLang: 'spa',
      pageCount
    });

    metrics.finish(recordId, {success:true, format:formatType || 'book', usage});
    success = true;
    res.json({ result, source: structured.metadata, metrics: metrics.snapshot() });

  } catch (error) {
    if (!error.status) console.error('Error in /api/extract-metadata:', error);
    res.status(error.status || (error.code === 'NO_BIBLIOGRAPHIC_EVIDENCE' ? 422 : 500)).json({ error: error.message });
  } finally {
    if (recordId && !success) {
      try { metrics.finish(recordId, {success:false, format:req.body.format || 'book', usage}); }
      catch (error) { console.error('No se pudieron guardar métricas:', error.message); }
    }
  }
  });
});

app.post('/api/format', (req, res) => {
  try {
    const { source, text, standard, agency, format: formatType, catLang, pageCount } = req.body;
    if (!source) return res.status(400).json({ error: 'Source metadata is required' });

    const validated = validateMetadata(source);
    const cleaned = cleanLlmOutput(validated, text || '', { pageCount, formatType, preserveSummary: true });

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

// All billable processing goes through the quota-controlled endpoint.
app.post(['/api/ocr', '/api/structure'], (req, res) => res.status(410).json({error:'Usa /api/extract-metadata para contabilizar el procesamiento.'}));

export const server = app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`  OpenAI OCR Agent: ${process.env.OPENAI_OCR_MODEL || DEFAULT_OPENAI_MODEL}`);
  console.log(`  OpenAI Structuring Agent: ${process.env.OPENAI_STRUCTURING_MODEL || DEFAULT_OPENAI_MODEL}`);
});
