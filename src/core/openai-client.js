const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

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

export class OpenAiClient {
  constructor({ apiKey, defaultModel, timeoutMs = 300000 } = {}) {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
    this.timeoutMs = timeoutMs;
  }

  async generate({ model, prompt, images = [], maxOutputTokens = 4096, signal } = {}) {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is not configured on the server');
    }

    const timeout = createTimeoutSignal(signal, this.timeoutMs);
    const content = [{ type: 'input_text', text: prompt || '' }];

    for (const image of images) {
      content.push({
        type: 'input_image',
        image_url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`
      });
    }

    try {
      const response = await fetch(OPENAI_RESPONSES_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model || this.defaultModel,
          input: [{ role: 'user', content }],
          max_output_tokens: maxOutputTokens,
          store: false
        }),
        signal: timeout.signal
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data.error?.message || `OpenAI request failed with status ${response.status}`;
        throw new Error(message);
      }

      return { response: extractOutputText(data), raw: data };
    } finally {
      timeout.clear();
    }
  }
}
