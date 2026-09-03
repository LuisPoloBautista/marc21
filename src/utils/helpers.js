export function cleanExtractedText(text) {
  if (!text) return text;
  let t = text;
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

export function normalizeName(name) {
  if (!name) return name;
  const upper = (name.match(/[A-ZÁÉÍÓÚÜÑ]/g) || []).length;
  const lower = (name.match(/[a-záéíóúüñ]/g) || []).length;
  const total = upper + lower;
  if (total > 3 && upper / total > 0.85) {
    return name.split(/\s+/).map(w => {
      if (w.length <= 2) return w.toLowerCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }).join(' ');
  }
  return name;
}

export function invertName(name) {
  if (!name) return name;
  let n = name.trim();
  if (!n) return name;
  if (n.includes(',')) {
    const parts = n.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const before = parts[0];
      const after = parts.slice(1).join(' ');
      if (/[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]*(?:ez|oz|az|is|es|án|ón|ín|ero|ado|ido|iego|uste|ales|egui)\b/i.test(before)) {
        n = after + ' ' + before;
      } else {
        n = before + ' ' + after;
      }
    } else {
      n = n.replace(/,/g, '').trim();
    }
  }
  n = n.replace(/\s+/g, ' ').trim();
  const normalized = normalizeName(n);
  const words = normalized.trim().split(/\s+/);
  if (words.length === 1) return normalized;
  if (words.length === 2) return `${words[1]}, ${words[0]}`;
  if (words.length === 3) {
    const lastIsSurname = /[ezozazisesánóníneroadoidiegoustealesegui]+$/i.test(words[2]);
    if (lastIsSurname) return `${words[2]}, ${words[0]} ${words[1]}`;
    return `${words[1]} ${words[2]}, ${words[0]}`;
  }
  const surname = words.slice(-2).join(' ');
  const given = words.slice(0, -2).join(' ');
  return `${surname}, ${given}`;
}

export function normalizeCase(text) {
  if (!text) return text;
  const upper = (text.match(/[A-ZÁÉÍÓÚÜÑ]/g) || []).length;
  const lower = (text.match(/[a-záéíóúüñ]/g) || []).length;
  const total = upper + lower;
  if (total > 5 && upper / total > 0.9) {
    const result = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    return result.replace(/:([a-z])/g, (_, c) => ':' + c.toUpperCase());
  }
  return text;
}

export function detectDates(yearStr) {
  if (yearStr == null || typeof yearStr === 'object') return { type: 's', date1: '    ', date2: '    ' };
  yearStr = String(yearStr);
  const clean = yearStr.replace(/[‑–—\u2010-\u2015]/g, '-');
  const parts = clean.split('-').map(s => s.trim()).filter(s => s);
  if (parts.length >= 2) {
    const d1 = parts[0].replace(/[^0-9]/g, '').slice(0, 4);
    const d2 = parts[1].replace(/[^0-9]/g, '').slice(0, 4);
    if (d1 && d2 && d1 !== d2 && d1.length === 4 && d2.length === 4) {
      return { type: 'm', date1: d1, date2: d2 };
    }
  }
  const single = yearStr.replace(/[^0-9]/g, '').slice(0, 4);
  return { type: 's', date1: single.padStart(4, '0'), date2: '    ' };
}

export function detectCountry(place) {
  if (!place) return 'mx ';
  const p = place.toLowerCase();
  if (p.includes('méxico') || p.includes('mexico') || p.includes('cdmx') || p.includes('ciudad de méxico') || p.includes('ciudad de mexico')) return 'mx ';
  if (p.includes('españa') || p.includes('spain') || p.includes('madrid')) return 'sp ';
  if (p.includes('suiza') || p.includes('switzerland') || p.includes('zürich') || p.includes('zurich')) return 'sz ';
  if (p.includes('alemania') || p.includes('germany') || p.includes('berlín') || p.includes('berlin')) return 'gw ';
  if (p.includes('francia') || p.includes('france') || p.includes('parís') || p.includes('paris')) return 'fr ';
  if (p.includes('inglaterra') || p.includes('england') || p.includes('londres') || p.includes('london')) return 'enk';
  if (p.includes('argentina') || p.includes('buenos aires')) return 'ag ';
  if (p.includes('colombia') || p.includes('bogotá')) return 'ck ';
  if (p.includes('estados unidos') || p.includes('eeuu') || p.includes('usa') || p.includes('united states') || p.includes('new york')) return 'xxu';
  return 'mx ';
}

export function splitTitle(title) {
  const idx = title.indexOf(':');
  if (idx > 0) {
    return { main: title.substring(0, idx).trim(), sub: title.substring(idx + 1).trim() };
  }
  return { main: title, sub: '' };
}

export function normalizeGeo(value) {
  const map = {
    'Mexico': 'México',
    'mexico': 'México',
    'Mexico City': 'Ciudad de México',
    'Ciudad de Mexico': 'Ciudad de México'
  };
  return map[value] || value;
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
