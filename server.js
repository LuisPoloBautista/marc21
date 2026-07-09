import express from 'express';
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

    let ocrResult = null;

    if (imgs.length > 0) {
      const batchSize = 3;
      const batches = [];
      for (let i = 0; i < imgs.length; i += batchSize) {
        batches.push(imgs.slice(i, i + batchSize));
      }

      let combinedText = text;
      for (const batch of batches) {
        const result = await ocrAgent.process(batch, catLang || 'spa', combinedText);
        combinedText = result.rawText;
        if (!ocrResult) ocrResult = result;
      }
    }

    const sourceText = ocrResult ? ocrResult.rawText : text;
    const structured = await structuringAgent.structure(sourceText, {
      catLang: catLang || 'spa',
      formatType: formatType || 'book',
      pageCount
    });

    const result = buildMarcRecord(structured.metadata, {
      agency: agency || 'IGN',
      formatType: formatType || 'book',
      catLang: catLang || 'spa',
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
      agency: agency || 'IGN',
      formatType: formatType || 'book',
      catLang: catLang || 'spa',
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

    const result = await ocrAgent.process(images, catLang || 'spa');
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
      catLang: catLang || 'spa',
      formatType: formatType || 'book',
      pageCount
    });
    res.json({ metadata: result.metadata });
  } catch (error) {
    console.error('Error in /api/structure:', error);
    res.status(500).json({ error: error.message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`  OpenAI OCR Agent: ${process.env.OPENAI_OCR_MODEL || DEFAULT_OPENAI_MODEL}`);
  console.log(`  OpenAI Structuring Agent: ${process.env.OPENAI_STRUCTURING_MODEL || DEFAULT_OPENAI_MODEL}`);
});
