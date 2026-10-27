import { reportUsage } from './metrics.js';
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
export const MAX_IMAGES_PER_REQUEST = 5;
export const MAX_IMAGE_INPUT_TOKENS_PER_IMAGE = 3000;
export const MAX_IMAGE_INPUT_TOKENS = MAX_IMAGES_PER_REQUEST * MAX_IMAGE_INPUT_TOKENS_PER_IMAGE;

function createTimeoutSignal(signal, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  return { signal: controller.signal, clear: () => clearTimeout(timeoutId) };
}

function extractOutputText(data) {
  if (data.output_text) return data.output_text;

  const chunks = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) chunks.push(content.text);
      if (content.type === 'text' && content.text) chunks.push(content.text);
      if (content.type === 'refusal' && content.refusal) chunks.push(content.refusal);
    }
  }
  return chunks.join('\n').trim();
}

function retryDelay(response, attempt, baseMs) {
  const retryAfter = Number(response?.headers?.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(5000, retryAfter * 1000);
  return baseMs * (2 ** attempt) + Math.floor(Math.random() * 150);
}

function isRetryableStatus(status) {
  return [408, 409, 429].includes(status) || status >= 500;
}

async function fetchOpenAI(options, retryBaseMs) {
  const maxAttempts = 2;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(OPENAI_RESPONSES_URL, options);
      if (attempt + 1 < maxAttempts && isRetryableStatus(response.status)) {
        const delay = retryDelay(response, attempt, retryBaseMs);
        await response.body?.cancel().catch(() => {});
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      return response;
    } catch (error) {
      if (error?.name === 'AbortError' || options.signal?.aborted) throw new Error('La solicitud a OpenAI excedió el tiempo disponible.');
      if (attempt + 1 >= maxAttempts) {
        const cause = error?.cause?.code || error?.code || error?.message || 'error de red desconocido';
        throw new Error(`No se pudo conectar con la API de OpenAI (${cause}). Revisa la red saliente, DNS y certificados del servidor.`);
      }
      await new Promise(resolve => setTimeout(resolve, retryDelay(null, attempt, retryBaseMs)));
    }
  }
}

export class OpenAiClient {
  constructor({ apiKey, defaultModel, timeoutMs = 300000, retryBaseMs = 500 } = {}) {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
    this.timeoutMs = timeoutMs;
    this.retryBaseMs = retryBaseMs;
  }

  async generate({ model, prompt, images = [], maxOutputTokens = 4096, jsonMode = false, signal } = {}) {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is not configured on the server');
    }

    const timeout = createTimeoutSignal(signal, this.timeoutMs);
    if (images.length > MAX_IMAGES_PER_REQUEST) {
      throw new Error(`Máximo ${MAX_IMAGES_PER_REQUEST} imágenes por llamada (${MAX_IMAGE_INPUT_TOKENS} tokens visuales presupuestados).`);
    }
    const content = [{ type: 'input_text', text: prompt || '' }];

    for (const image of images) {
      content.push({
        type: 'input_image',
        image_url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`,
        // High detail preserves small bibliographic text; billing depends on the configured model.
        detail: 'high'
      });
    }

    let usageReported = false;
    try {
      const response = await fetchOpenAI({
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model || this.defaultModel,
          input: [{ role: 'user', content }],
          max_output_tokens: maxOutputTokens,
          ...(jsonMode ? { text: { format: { type: 'json_object' } } } : {}),
          store: false
        }),
        signal: timeout.signal
      }, this.retryBaseMs);

      const data = await response.json().catch(() => ({}));
      reportUsage(data.usage);
      usageReported = true;
      if (!response.ok) {
        const message = data.error?.message || `OpenAI request failed with status ${response.status}`;
        throw new Error(message);
      }
      if (data.status === 'incomplete') {
        throw new Error(`OpenAI devolvió una respuesta incompleta (${data.incomplete_details?.reason || 'motivo desconocido'}).`);
      }

      return { response: extractOutputText(data), raw: data };
    } finally {
      if (!usageReported) reportUsage(null);
      timeout.clear();
    }
  }
}
