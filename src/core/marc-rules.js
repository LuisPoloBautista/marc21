const CURRENT_YEAR = new Date().getFullYear();

export function isYearLike(value) {
  if (!value) return false;
  const clean = value.replace(/[^0-9\s-]/g, '').trim();
  return /^\d{4}\s*-\s*\d{4}$/.test(clean) || /^\d{4}$/.test(clean);
}

function yearAppearsInSubjects(year, subjects) {
  if (!year || !Array.isArray(subjects)) return false;
  const y = year.replace(/[^0-9]/g, '').slice(0, 4);
  if (!y) return false;
  return subjects.some(s => String(s).includes(y));
}

export function normalizeAuthorNames(authors, authorRoles) {
  if (!Array.isArray(authors)) return { authors: [], authorRoles: {} };
  const cleaned = authors.map(a => {
    if (!a) return '';
    let n = a.trim();
    n = n.replace(/,+/g, '').trim();
    return n;
  }).filter(Boolean);
  const remapped = {};
  if (authorRoles && typeof authorRoles === 'object') {
    for (const [name, role] of Object.entries(authorRoles)) {
      const cleanName = name.replace(/,+/g, '').trim();
      remapped[cleanName] = role;
    }
  }
  return { authors: cleaned, authorRoles: remapped };
}

export function separateChronologicalSubjects(subjects) {
  if (!Array.isArray(subjects)) return { topical: [], chronological: [] };
  const topical = [];
  const chronological = [];
  for (const s of subjects) {
    if (!s) continue;
    const clean = String(s).trim();
    if (isYearLike(clean)) {
      chronological.push(clean);
    } else {
      const parts = clean.split('--').map(p => p.trim()).filter(Boolean);
      const hasYearPart = parts.some(p => isYearLike(p));
      if (hasYearPart) {
        const chronoParts = parts.filter(p => isYearLike(p));
        const topicalParts = parts.filter(p => !isYearLike(p));
        if (chronoParts.length > 0) chronological.push(...chronoParts);
        if (topicalParts.length > 0) topical.push(topicalParts.join(' -- '));
      } else {
        topical.push(clean);
      }
    }
  }
  return { topical, chronological };
}

export function normalizeMarcData(metadata, opts = {}) {
  if (!metadata || typeof metadata !== 'object') return metadata;
  const formatType = opts.formatType || 'book';
  const isThesis = formatType === 'thesis';
  const result = { ...metadata };

  const { authors, authorRoles } = normalizeAuthorNames(result.author, result.authorRoles);
  result.author = authors;
  result.authorRoles = authorRoles;

  if (result.year) {
    const yearStr = String(result.year).replace(/[^0-9]/g, '').slice(0, 4);
    if (yearStr && yearAppearsInSubjects(yearStr, result.subjects)) {
      result.year = isThesis ? String(CURRENT_YEAR - 5) : '';
    }
  }
  if (isThesis && !result.year) {
    result.year = String(CURRENT_YEAR - 5);
  }

  const { topical, chronological } = separateChronologicalSubjects(result.subjects);
  result.subjects = topical;
  result.chronologicalSubjects = chronological;

  return result;
}

export function buildChronologicalField(subject, catLang) {
  const ind2 = catLang === 'spa' ? '7' : '4';
  const field = { ind1: ' ', ind2, a: subject };
  if (catLang === 'spa') field['2'] = 'embnm';
  return field;
}

const SUBJECT_CLASSIFICATION = [
  { keywords: ['catalogacion', 'catalogación', 'descripcion', 'rda', 'marc21', 'metadatos'], lc: 'Z693', dewey: '025.3' },
  { keywords: ['bibliotecologia', 'bibliotecología', 'biblioteconomia', 'biblioteconomía', 'biblioteca', 'ciencia de la informacion'], lc: 'Z665', dewey: '020' },
  { keywords: ['historia'], lc: 'D', dewey: '900' },
  { keywords: ['literatura', 'poesia', 'novela', 'narrativa'], lc: 'PN', dewey: '800' },
  { keywords: ['educacion', 'educación', 'pedagogia', 'pedagogía', 'enseñanza', 'ensenanza'], lc: 'LB', dewey: '370' },
  { keywords: ['derecho', 'leyes'], lc: 'K', dewey: '340' },
  { keywords: ['medicina', 'salud', 'enfermeria'], lc: 'R', dewey: '610' },
  { keywords: ['ciencia', 'cientifico'], lc: 'Q', dewey: '500' },
  { keywords: ['fisica', 'física'], lc: 'QC', dewey: '530' },
  { keywords: ['quimica', 'química'], lc: 'QD', dewey: '540' },
  { keywords: ['biologia', 'biología'], lc: 'QH', dewey: '570' },
  { keywords: ['matematicas', 'matemáticas'], lc: 'QA', dewey: '510' },
  { keywords: ['ingenieria', 'ingeniería'], lc: 'TA', dewey: '620' },
  { keywords: ['filosofia', 'filosofía'], lc: 'B', dewey: '100' },
  { keywords: ['psicologia', 'psicología'], lc: 'BF', dewey: '150' },
  { keywords: ['economia', 'economía'], lc: 'HB', dewey: '330' },
  { keywords: ['arte', 'pintura', 'escultura', 'musica', 'música'], lc: 'N', dewey: '700' },
  { keywords: ['geografia', 'geografía', 'cartografia', 'cartografía', 'mapas'], lc: 'G', dewey: '910' },
  { keywords: ['tecnologia', 'tecnología', 'informatica', 'informática', 'computacion', 'computación'], lc: 'T', dewey: '600' },
  { keywords: ['religion', 'religión', 'teologia', 'teología'], lc: 'BL', dewey: '200' },
  { keywords: ['politica', 'política', 'gobierno'], lc: 'JA', dewey: '320' },
  { keywords: ['sociologia', 'sociología'], lc: 'HM', dewey: '301' },
  { keywords: ['antropologia', 'antropología'], lc: 'GN', dewey: '301.2' },
  { keywords: ['arquitectura'], lc: 'NA', dewey: '720' },
  { keywords: ['agricultura'], lc: 'S', dewey: '630' },
  { keywords: ['contabilidad'], lc: 'HF', dewey: '657' },
  { keywords: ['administracion', 'administración', 'negocios', 'empresa'], lc: 'HD', dewey: '650' },
  { keywords: ['periodismo', 'comunicacion', 'comunicación'], lc: 'P', dewey: '070' },
  { keywords: ['lingüistica', 'linguistica', 'idioma', 'lengua'], lc: 'P', dewey: '400' },
];

export function suggestClassification(subjects) {
  if (!Array.isArray(subjects) || subjects.length === 0) return { lc: '', dewey: '' };
  const allText = subjects.join(' ').toLowerCase();
  let best = { lc: '', dewey: '', score: 0 };
  for (const entry of SUBJECT_CLASSIFICATION) {
    let score = 0;
    for (const kw of entry.keywords) {
      const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(allText)) score++;
    }
    if (score >= best.score) best = { lc: entry.lc, dewey: entry.dewey, score };
  }
  return best.score > 0 ? { lc: best.lc, dewey: best.dewey } : { lc: '', dewey: '' };
}
