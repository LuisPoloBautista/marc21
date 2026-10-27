import dns from 'node:dns/promises';
import net from 'node:net';

const MAX_BYTES = 1_000_000;

function isPrivateIp(address) {
  if (net.isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const lower = address.toLowerCase();
  return lower === '::1' || lower === '::' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:');
}

function normalizeInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const doi = raw.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  if (/^10\.\d{4,9}\/\S+$/i.test(doi)) return { kind: 'doi', doi, url: `https://doi.org/${doi}` };
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error('La fuente externa debe usar HTTPS.');
  return { kind: 'url', url: url.href };
}

async function assertPublicUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('URL externa no permitida.');
  if (parsed.hostname === 'localhost' || parsed.hostname.endsWith('.local') || (net.isIP(parsed.hostname) && isPrivateIp(parsed.hostname))) throw new Error('No se permiten direcciones locales o privadas.');
  const addresses = await dns.lookup(parsed.hostname, { all: true });
  if (!addresses.length || addresses.some(item => isPrivateIp(item.address))) throw new Error('La URL resuelve a una red privada.');
}

function stripHtml(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<!--([\s\S]*?)-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

async function safeFetch(url, headers = {}, redirects = 0) {
  if (redirects > 3) throw new Error('Demasiadas redirecciones al consultar la fuente.');
  await assertPublicUrl(url);
  const response = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location');
    if (!location) throw new Error('Redirección externa sin destino.');
    return safeFetch(new URL(location, url).href, headers, redirects + 1);
  }
  if (!response.ok) throw new Error(`La fuente externa respondió ${response.status}.`);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > MAX_BYTES) throw new Error('La fuente externa supera 1 MB.');
  const body = (await response.text()).slice(0, MAX_BYTES);
  return { body, contentType: response.headers.get('content-type') || '', finalUrl: url };
}

export async function resolveExternalSource(value) {
  const input = normalizeInput(value);
  if (!input) return null;
  if (input.kind === 'doi') {
    const fetched = await safeFetch(input.url, { Accept: 'application/vnd.citationstyles.csl+json, application/json;q=0.9' });
    let data;
    try { data = JSON.parse(fetched.body); } catch { data = null; }
    const text = data ? JSON.stringify({ DOI: data.DOI || input.doi, title: data.title, author: data.author, editor: data.editor, publisher: data.publisher, issued: data.issued, language: data.language, ISBN: data.ISBN, ISSN: data.ISSN, containerTitle: data['container-title'], URL: data.URL || input.url, type: data.type }) : stripHtml(fetched.body);
    return { marker: 'Fuente DOI', text: text.slice(0, 12000), url: input.url, kind: 'doi' };
  }
  const fetched = await safeFetch(input.url, { Accept: 'text/html, application/xhtml+xml, application/json;q=0.9, text/plain;q=0.8' });
  const text = fetched.contentType.includes('json') ? fetched.body : stripHtml(fetched.body);
  return { marker: 'URL aportada', text: text.slice(0, 12000), url: fetched.finalUrl, kind: 'url' };
}
