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

    if (!rawText || !rawText.trim()) {
      throw new Error('No text provided for structuring');
    }

    const prompt = buildStructuringPrompt(rawText, catLang, formatType);
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const response = await this.llm.generate({
          model: STRUCTURING_MODEL,
          prompt,
          maxOutputTokens: 4096,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        const raw = response.response || '';
        const metadata = parseLLMResponse(raw);

        if (!metadata) {
          lastError = new Error('Failed to parse JSON from LLM response');
          continue;
        }

        const validated = validateMetadata(metadata);
        const cleaned = cleanLlmOutput(validated, rawText, { pageCount, formatType });

        if (!cleaned.title && !cleaned.author?.length && !cleaned.publisher) {
          lastError = new Error('Structuring produced empty metadata');
          continue;
        }

        return {
          metadata: cleaned,
          rawResponse: raw,
          model: STRUCTURING_MODEL
        };

      } catch (error) {
        lastError = error;
        if (attempt < MAX_RETRIES) {
          await sleep(1000 * (attempt + 1));
        }
      }
    }

    const isModelError = lastError.message && (lastError.message.includes('model') || lastError.message.includes('not found'));
    const hint = isModelError
      ? `. Verifica que tu cuenta de OpenAI tenga acceso al modelo ${STRUCTURING_MODEL} o define OPENAI_STRUCTURING_MODEL con otro modelo compatible.`
      : '';
    throw new Error(`Structuring Agent failed after ${MAX_RETRIES + 1} attempts: ${lastError.message}${hint}`);
  }
}
