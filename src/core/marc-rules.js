export function isYearLike(value) {
  if (!value) return false;
  const clean = value.replace(/[^0-9\s-]/g, '').trim();
  return /^\d{4}\s*-\s*\d{4}$/.test(clean) || /^\d{4}$/.test(clean);
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
  const result = { ...metadata };

  const { authors, authorRoles } = normalizeAuthorNames(result.author, result.authorRoles);
  result.author = authors;
  result.authorRoles = authorRoles;

  const { topical, chronological } = separateChronologicalSubjects(result.subjects);
  result.subjects = topical;
  result.chronologicalSubjects = chronological;

  return result;
}

export function buildChronologicalField(subject, catLang) {
  const ind2 = '4';
  const field = { ind1: ' ', ind2, a: subject };
  return field;
}
