import test from 'node:test';
import assert from 'node:assert/strict';
import { getEncoding } from 'js-tiktoken';
import { limitEvidenceTokens, MAX_EVIDENCE_TOKENS } from '../src/core/evidence-budget.js';
import { buildStructuringPrompt } from '../src/core/prompt-builder.js';
import { StructuringAgent } from '../src/agents/structuring-agent.js';

const encoder = getEncoding('o200k_base');
const count = text => encoder.encode(text, [], []).length;

test('short evidence is preserved including literal special-token strings', () => {
  for (const text of ['', '[Texto aportado]\nHistoria de México © 2026 ISBN 9781234567897', '<|endoftext|>']) {
    assert.equal(limitEvidenceTokens(text), text);
  }
});

test('exactly 4000 tokens remain intact; overflowing evidence is capped', () => {
  const text = ' libro'.repeat(4000);
  // Use a fixture under the separate character guard.
  const boundary = ' a'.repeat(4000);
  assert.equal(count(boundary), MAX_EVIDENCE_TOKENS);
  assert.equal(limitEvidenceTokens(boundary), boundary);
  assert.ok(count(limitEvidenceTokens(boundary + ' a')) <= MAX_EVIDENCE_TOKENS);
  assert.ok(count(limitEvidenceTokens(text)) <= MAX_EVIDENCE_TOKENS);
});

test('caps dense multilingual text and retains all ten source markers', () => {
  const text = Array.from({length: 10}, (_, i) => `[Página ${i + 1}]\n` + '数学📚 edición © 978-123-456-7897 '.repeat(100)).join('\n\n');
  const limited = limitEvidenceTokens(text);
  assert.ok(count(limited) <= MAX_EVIDENCE_TOKENS);
  for (let i = 1; i <= 10; i++) assert.ok(limited.includes(`[Página ${i}]`));
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(limited));
  assert.equal(limitEvidenceTokens(limited), limited);
});

test('prompt instructions do not consume the document budget for any material', () => {
  const text = '[Texto aportado]\n' + 'ISBN © 数学 '.repeat(3000) + '\n[Imagen 5]\nEditorial de prueba';
  for (const format of ['book', 'article', 'chapter', 'thesis', 'proceedings']) {
    const prompt = buildStructuringPrompt(text, 'spa', format);
    const [instructions, evidence] = prompt.split('EVIDENCIA:\n');
    assert.equal(instructions, buildStructuringPrompt('', 'spa', format).split('EVIDENCIA:\n')[0]);
    assert.ok(count(evidence) <= MAX_EVIDENCE_TOKENS);
    assert.ok(evidence.includes('[Imagen 5]\nEditorial de prueba'));
  }
});

test('structuring enforces the budget on the outgoing model call', async () => {
  let calls = 0;
  const agent = new StructuringAgent({generate: async ({prompt}) => {
    calls++;
    assert.ok(count(prompt.split('EVIDENCIA:\n')[1]) <= MAX_EVIDENCE_TOKENS);
    return {response: JSON.stringify({title: 'Prueba', author: []})};
  }});
  const result = await agent.structure('[Texto aportado]\n' + 'Datos 数学 1234 '.repeat(3000));
  assert.equal(result.metadata.title, 'Prueba');
  assert.equal(calls, 1);
});
