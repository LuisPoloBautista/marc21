import { buildOcrPrompt } from '../core/prompt-builder.js';
import { parseRawOcrText } from '../core/llm-parser.js';
import { sleep } from '../utils/helpers.js';

const OCR_MODEL = process.env.OPENAI_OCR_MODEL || process.env.OPENAI_MODEL || 'gpt-5.5';
const MAX_RETRIES = 2;
const TIMEOUT_MS = 120000;

export class OcrAgent {
  constructor(llm) {
    this.llm = llm;
  }

  async process(images, catLang = 'spa', existingText = '') {
    if (!images || images.length === 0) {
      return { rawText: existingText || '', source: 'text-input' };
    }

    const prompt = buildOcrPrompt(catLang);
    const imageData = images.map(i => i.data);

    let lastError = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const response = await this.llm.generate({
          model: OCR_MODEL,
          prompt,
          images: imageData,
          maxOutputTokens: 2500,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        const rawText = response.response || '';
        if (!rawText.trim()) {
          lastError = new Error('OCR agent returned empty response');
          continue;
        }

        const cleaned = parseRawOcrText(rawText);
        if (!cleaned || cleaned.length < 10) {
          lastError = new Error('OCR agent returned insufficient text');
          continue;
        }

        let combinedText = cleaned;
        if (existingText && existingText.trim()) {
          combinedText = cleaned + '\n\n--- TEXTO ADICIONAL ---\n\n' + existingText;
        }

        return {
          rawText: combinedText,
          ocrRaw: cleaned,
          source: 'ocr-vision',
          model: OCR_MODEL
        };

      } catch (error) {
        lastError = error;
        if (attempt < MAX_RETRIES) {
          await sleep(1000 * (attempt + 1));
        }
      }
    }

    if (existingText && existingText.trim()) {
      return {
        rawText: existingText,
        source: 'text-input-fallback',
        error: lastError.message
      };
    }

    const isModelError = lastError.message && (lastError.message.includes('model') || lastError.message.includes('not found'));
    const hint = isModelError
      ? `. Verifica que tu cuenta de OpenAI tenga acceso al modelo ${OCR_MODEL} o define OPENAI_OCR_MODEL con otro modelo compatible con vision.`
      : '';
    throw new Error(`OCR Agent failed after ${MAX_RETRIES + 1} attempts: ${lastError.message}${hint}`);
  }
}
