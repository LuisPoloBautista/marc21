// Shared deterministic evidence selection; no model calls here.
export const MAX_EVIDENCE_CHARS = 18000;
const signals = /ISBN|ISSN|10\.\d{4,9}\/|copyright|©|edici[oó]n|edition|editorial|publisher|published by|colof[oó]n|serie|colecci[oó]n|dep[oó]sito legal|resumen|abstract|contenido|[íi]ndice|tesis|grado|congreso/ig;
export function usableText(text = '') {
  const letters = text.match(/\p{L}/gu) || [];
  return letters.length >= 60 && !text.includes('�');
}
export function scorePage(page, total, format = 'book') {
  const initial = format === 'article' ? page.page <= 2 || page.page === total : page.page <= 10 || page.page > total - 3;
  return (initial ? 4 : 0) + (page.page > total - 3 ? 2 : 0) + (page.page <= 2 ? 5 : 0) + Math.min(30, (page.text.match(signals) || []).length * 3);
}
export function reduceText(text, limit = 2600) {
  const lines = [...new Set(String(text).split(/\n+/).map(s => s.trim()).filter(Boolean))];
  let inSummary = false;
  const useful = lines.filter((s, i) => {
    if (/^(?:abstract|resumen)\b/i.test(s)) inSummary = true;
    else if (/^(?:keywords|palabras clave|introducci[oó]n|introduction)\b/i.test(s)) inSummary = false;
    return inSummary || i < 12 || /ISBN|ISSN|copyright|©|edici[oó]n|edition|editorial|publisher|serie|colof[oó]n|10\.\d{4,9}/i.test(s); });
  return useful.join('\n').slice(0, limit);
}
export function selectEvidence(pages, format = 'book') {
  const total = pages.length;
  let budget = MAX_EVIDENCE_CHARS;
  const seen = new Set();
  return pages
    .map(p => ({ ...p, score: scorePage(p, total, format) }))
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score || a.page - b.page)
    .filter(p => { const key = p.text.trim(); if (!key) return true; if (seen.has(key)) return false; seen.add(key); return true; })
    .slice(0, 10)
    .map(p => { const text = reduceText(p.text, Math.min(2600, budget)); budget -= text.length; return { ...p, text }; })
    .filter(p => p.text || !usableText(pages.find(o => o.page === p.page)?.text));
}
export function evidenceText(pages) {
  return pages.filter(p => p.text).map(p => `[Página ${p.page}]\n${p.text}`).join('\n\n');
}
export const TYPE_FIELDS = {
  book: ['publisher','place','year','pages','isbn','edition','series','corporate'],
  article: ['hostTitle','volume','issue','pages','issn','publisher','place','year'],
  chapter: ['hostTitle','publisher','place','year','pages','isbn','edition','corporate'],
  thesis: ['degree','institution','advisor','place','year','pages','corporate'],
  proceedings: ['meetingName','meetingDate','meetingPlace','publisher','place','year','pages','isbn','edition','series','corporate']
};
export const COMMON_FIELDS = ['title','subtitle','author','authorRoles','language','doi','subjects','notes','notesKind','copyrightYear','dewey'];

// Share the budget across sources so later OCR batches cannot be silently discarded.
export function compactEvidence(text, limit = MAX_EVIDENCE_CHARS) {
  const parts = String(text).split(/(?=\[(?:Página \d+|Imagen \d+|Texto aportado|Metadatos PDF)\])/).filter(s => s.trim());
  if (!parts.length) return '';
  let remaining = Math.max(0, limit - parts.length * 2);
  const sizes = parts.map(p => Math.min(p.length, 1000));
  const baseTotal = sizes.reduce((a, b) => a + b, 0);
  if (baseTotal > remaining) {
    const quota = Math.floor(remaining / parts.length);
    return parts.map(p => p.slice(0, quota)).join('\n\n').slice(0, limit);
  }
  remaining -= baseTotal;
  const order = parts.map((p, i) => i).sort((a, b) => Number(/\b(?:abstract|resumen)\b/i.test(parts[b])) - Number(/\b(?:abstract|resumen)\b/i.test(parts[a])));
  for (const i of order) { const extra = Math.min(remaining, parts[i].length - sizes[i]); sizes[i] += extra; remaining -= extra; }
  return parts.map((p, i) => p.slice(0, sizes[i])).join('\n\n').slice(0, limit);
}
