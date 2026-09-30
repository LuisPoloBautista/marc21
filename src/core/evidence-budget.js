import { getEncoding } from 'js-tiktoken';
import { compactEvidence, MAX_EVIDENCE_CHARS } from './evidence.js';

export const MAX_EVIDENCE_TOKENS = 4000;
// Text-only budget for the configured GPT-5 family; not an image/request estimate.
const tokenizer = getEncoding('o200k_base');

export function countEvidenceTokens(text) {
  // Document text may contain strings resembling special tokens. Treat them literally.
  return tokenizer.encode(text, [], []).length;
}

export function limitEvidenceTokens(text) {
  const original = String(text ?? '');
  let evidence = original.length > MAX_EVIDENCE_CHARS ? compactEvidence(original) : original;
  let tokens = countEvidenceTokens(evidence);
  let charLimit = evidence.length;
  while (tokens > MAX_EVIDENCE_TOKENS || evidence.length > MAX_EVIDENCE_CHARS) {
    if (tokens > MAX_EVIDENCE_TOKENS) {
      charLimit = Math.min(charLimit - 1, Math.floor(evidence.length * MAX_EVIDENCE_TOKENS / tokens));
    }
    // Reuse source-aware selection instead of dropping the last pages or OCR sources.
    evidence = compactEvidence(original, Math.max(0, charLimit));
    // Character selection can end between UTF-16 surrogate pairs.
    evidence = evidence.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
    tokens = countEvidenceTokens(evidence);
  }
  return evidence;
}
