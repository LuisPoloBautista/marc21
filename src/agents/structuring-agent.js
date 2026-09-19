import { COMMON_FIELDS, TYPE_FIELDS } from '../core/evidence.js';
import { buildStructuringPrompt } from '../core/prompt-builder.js';
import { parseLLMResponse, validateMetadata, cleanLlmOutput } from '../core/llm-parser.js';
import { sleep } from '../utils/helpers.js';

const STRUCTURING_MODEL = process.env.OPENAI_STRUCTURING_MODEL || process.env.OPENAI_MODEL || 'gpt-5.5';
const MAX_RETRIES = 2;
const TIMEOUT_MS = 180000;

export class StructuringAgent {
  constructor(llm) {
    this.llm = llm;
  }

  async structure(rawText, opts = {}) {
    const catLang = opts.catLang || 'spa';
    const formatType = opts.formatType || 'book';
    const pageCount = opts.pageCount;
    const fields = [...COMMON_FIELDS, ...(TYPE_FIELDS[formatType] || TYPE_FIELDS.book)];

    if (!rawText || !rawText.trim()) {
      throw new Error('No text provided for structuring');
    }

    const prompt = buildStructuringPrompt(rawText, catLang, formatType);
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let timeoutId;
      try {
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const response = await this.llm.generate({
          model: STRUCTURING_MODEL,
          prompt,
          maxOutputTokens: 4096,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        const raw = response.response || '';
        const metadata = parseLLMResponse(raw);

        if (!metadata || Array.isArray(metadata) || Object.keys(metadata).some(key => ![...fields, 'evidence'].includes(key))) {
          lastError = new Error('Failed to parse JSON from LLM response');
          continue;
        }

        const validated = validateMetadata(metadata);
        const cleaned = cleanLlmOutput(validated, rawText, { pageCount, formatType });

        const hasData = fields.some(key => {
          const value = cleaned[key];
          return typeof value === 'string' ? Boolean(value.trim()) : Array.isArray(value) && value.some(v => typeof v === 'string' && v.trim());
        });
        if (!hasData) {
          lastError = new Error('No se encontraron datos bibliográficos en la evidencia seleccionada. Añade la portada o la página legal con texto legible y vuelve a generar.');
          lastError.code = 'NO_BIBLIOGRAPHIC_EVIDENCE';
          break;
        }

        return {
          metadata: cleaned,
          rawResponse: raw,
          model: STRUCTURING_MODEL,
          empty: !hasData
        };

      } catch (error) {
        lastError = error;
        if (attempt < MAX_RETRIES) {
          await sleep(1000 * (attempt + 1));
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    if (lastError.code === 'NO_BIBLIOGRAPHIC_EVIDENCE') throw lastError;
    const isModelError = lastError.message && (lastError.message.includes('model') || lastError.message.includes('not found'));
    const hint = isModelError
      ? `. Verifica que tu cuenta de OpenAI tenga acceso al modelo ${STRUCTURING_MODEL} o define OPENAI_STRUCTURING_MODEL con otro modelo compatible.`
      : '';
    throw new Error(`Structuring Agent failed after ${MAX_RETRIES + 1} attempts: ${lastError.message}${hint}`);
  }
}
