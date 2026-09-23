import { buildOcrPrompt } from '../core/prompt-builder.js';
import { parseRawOcrText } from '../core/llm-parser.js';

const OCR_MODEL = process.env.OPENAI_OCR_MODEL || process.env.OPENAI_MODEL || 'gpt-5.5';
const TIMEOUT_MS = 120000;

export class OcrAgent {
  constructor(llm) {
    this.llm = llm;
  }

  async process(images, catLang = 'spa', existingText = '') {
    if (!images || images.length === 0) {
      return { rawText: existingText || '', source: 'text-input' };
    }

    const prompt = buildOcrPrompt(catLang) + '\nImágenes en orden: ' + images.map((i, n) => '[' + (i.label || `Imagen ${n + 1}`) + ']').join(', ');
    const imageData = images.map(i => i.data);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await this.llm.generate({
          model: OCR_MODEL,
          prompt,
          images: imageData,
          maxOutputTokens: 2500,
          signal: controller.signal
        });

        const rawText = response.response || '';
        if (!rawText.trim()) {
          throw new Error('OCR agent returned empty response');
        }

        const cleaned = parseRawOcrText(rawText);
        if (!cleaned || cleaned.length < 10) {
          throw new Error('OCR agent returned insufficient text');
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
    if (existingText && existingText.trim()) {
      return {
        rawText: existingText,
        source: 'text-input-fallback',
        error: error.message
      };
    }

    const isModelError = error.message && (error.message.includes('model') || error.message.includes('not found'));
    const hint = isModelError
      ? `. Verifica que tu cuenta de OpenAI tenga acceso al modelo ${OCR_MODEL} o define OPENAI_OCR_MODEL con otro modelo compatible con vision.`
      : '';
    throw new Error(`OCR Agent failed: ${error.message}${hint}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
