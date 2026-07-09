export function parseLLMResponse(raw) {
  if (!raw) return null;
  const cleanRaw = raw
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/\s*```/g, '')
    .replace(/[\s\S]*?<\/think>/g, '')
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .trim();

  const braceStart = cleanRaw.indexOf('{');
  const braceEnd = cleanRaw.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    const jsonStr = cleanRaw.substring(braceStart, braceEnd + 1);
    try { return JSON.parse(jsonStr); }
    catch {
      const fixed = jsonStr
        .replace(/[\x00-\x1f\x7f-\x9f]/g, '')
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/\\['"]/g, '')
        .replace(/\\(?!["\\/bfnrt])/g, '');
      try { return JSON.parse(fixed); }
      catch { return null; }
    }
  }
  return null;
}

export function validateMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return metadata;
  for (const arrField of ['author', 'subjects']) {
    if (!Array.isArray(metadata[arrField])) {
      metadata[arrField] = metadata[arrField] ? [String(metadata[arrField])] : [];
    }
  }
  return metadata;
}

export function cleanLlmOutput(metadata, rawText, opts = {}) {
  if (!metadata || typeof metadata !== 'object') return metadata;
  const text = (rawText || '').replace(/\n\s*/g, ' ');
  const { pageCount, formatType } = opts;
  const isAnalytical = formatType === 'article' || formatType === 'chapter';

  function cleanName(name) {
    if (!name) return name;
    return name.replace(/^(Dr\.|Dra\.|Mtro\.|Mtra\.|Lic\.|Ing\.|PhD\.?|Ph\.?\s*D\.?|M\.?\s*(Sc|A|Ed|C)\.?|MC\.?|Arq\.|Biol\.|Q\.?F\.?[BZ]?\.?|M\.?\s*en\s+C\.?)\s+/i, '').trim();
  }

  const isbn13Match = text.match(/\b(?:ISBN[:\s-]*)?(97[89])[-\s]?(\d{1,5})[-\s]?(\d{1,7})[-\s]?(\d{1,7})[-\s]?([\dXx])\b/i);
  if (isbn13Match) {
    metadata.isbn = isbn13Match.slice(1).filter(Boolean).join('');
  } else {
    const isbn10Match = text.match(/\b(?:ISBN[:\s-]*)?(\d)[-\s]?(\d{1,7})[-\s]?(\d{1,7})[-\s]?([\dXx])\b/i);
    if (isbn10Match) {
      metadata.isbn = isbn10Match.slice(1).filter(Boolean).join('');
    }
  }

  if (!metadata.year) {
    const yearMatch = text.match(/\b(19[0-9]{2}|20[0-9]{2})\b/);
    if (yearMatch) metadata.year = yearMatch[1];
  }

  if (pageCount && !isAnalytical) {
    metadata.pages = String(pageCount);
  } else {
    const pagesMatch = text.match(/(\d+)\s*(?:p\.|pág\.|páginas?|pp\.|h\.)/i);
    if (pagesMatch) metadata.pages = pagesMatch[1];
  }

  const editionMatch = text.match(/(\d+)[a-záéíóú]?\s*(?:\.?\s*ed\.?|\.?\s*edici[oó]n|\.?\s*edição)/i);
  if (editionMatch) metadata.edition = editionMatch[1] + 'a.';

  const issnMatch = text.match(/\b(\d{4})[-\s]?(\d{3}[\dXx])\b/i);
  if (issnMatch) metadata.issn = issnMatch[1] + '-' + issnMatch[2];

  if (metadata.title) {
    let t = metadata.title;
    t = t.replace(/^(TESIS\s+(QUE\s+)?(PARA\s+)?(OBTENER\s+(EL\s+)?)?(EL\s+)?GRADO\s+DE\s+|MEMORIA\s+(PARA\s+)?(OPTAR\s+(AL\s+)?)?(EL\s+)?(GRADO\s+DE\s+|T[IÍ]TULO\s+DE\s+|DIPLOMA\s+DE\s+)?|TESIS\s+PRESENTADA\s+(POR|EN|A)\s+|TESIS\s+D[EI]\s+|THESIS\s+|DISSERTATION\s+|T[EÉ]SIS\s+)/i, '').trim();
    t = t.replace(/^[:\s,;.]+/, '').trim();
    const leadingNum = t.match(/^(\d{3,4})\s+(.*)$/);
    if (leadingNum && /^[a-záéíóú]/.test(leadingNum[2])) {
      t = leadingNum[2].charAt(0).toUpperCase() + leadingNum[2].slice(1);
    }
    const editionInTitle = t.match(/[,.:;]\s*(?:Revisi[oó]n|Edici[oó]n|Versi[oó]n|Update|Actualizaci[oó]n)\s*\d{4}\b/i);
    if (editionInTitle && !metadata.edition) {
      metadata.edition = editionInTitle[0].replace(/^[,.:;]\s*/, '').trim();
      t = t.replace(editionInTitle[0], '').trim();
    }
    if (t) metadata.title = t;
  }

  const rolePatterns = [
    { regex: /[Cc]oordinador[a]?\s+(.+?)(?:[.;]|$)/, role: 'coordinador' },
    { regex: /^[IVXLCDM]+\.\s*(.+),\s*[Cc]oordinador[a]?\s*\./m, role: 'coordinador' },
    { regex: /(.+?)(?:,|\s+)[Cc]oordinador[a]?\s*(?:\.|;|$)/, role: 'coordinador' },
    { regex: /[Tt]raductor[a]?\s+(?:principal\s+)?(.+?)(?:[.;]|$)/, role: 'traductor' },
    { regex: /(.+?)(?:,|\s+)[Tt]raductor[a]?\s*(?:\.|;|$)/, role: 'traductor' },
    { regex: /[Ee]ditor[a]?\s+(.+?)(?:[.;]|$)/, role: 'editor' },
    { regex: /(.+?)(?:,|\s+)[Ee]ditor[a]?\s*(?:\.|;|$)/, role: 'editor' },
    { regex: /[Ii]lustrador[a]?\s+(.+?)(?:[.;]|$)/, role: 'ilustrador' },
    { regex: /[Cc]ompilador[a]?\s+(.+?)(?:[.;]|$)/, role: 'compilador' },
    { regex: /[Pp]rologuista\s+(.+?)(?:[.;]|$)/, role: 'prologuista' },
  ];

  function extractNameCandidate(raw) {
    return raw.trim()
      .replace(/^(?:Dr\.|Dra\.|Mtro\.|Mtra\.|Lic\.|Ing\.|PhD\.?|Ph\.?\s*D\.?)\s*/i, '')
      .replace(/^[IVXLCDM]+\.\s*/, '')
      .replace(/\s+/g, ' ').trim();
  }

  if (metadata.dewey) {
    const deweyClean = String(metadata.dewey).replace(/[^0-9.]/g, '');
    if (deweyClean) {
      const escaped = deweyClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`[A-Z]${escaped}`).test(text)) {
        metadata.dewey = '';
      }
    }
  }

  if (Array.isArray(metadata.author)) {
    const cleaned = metadata.author.map(cleanName).filter(Boolean);
    if (!metadata.authorRoles || typeof metadata.authorRoles !== 'object') metadata.authorRoles = {};
    const remapped = {};
    for (const [name, role] of Object.entries(metadata.authorRoles)) {
      remapped[cleanName(name)] = role;
    }
    metadata.authorRoles = remapped;
    for (const author of cleaned) {
      const nameParts = author.split(/\s+/);
      const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0];
      for (const pattern of rolePatterns) {
        const match = text.match(pattern.regex);
        if (match) {
          const candidate = extractNameCandidate(match[1]);
          if (candidate.includes(lastName) || lastName.includes(candidate.split(/\s+/).pop() || '')) {
            metadata.authorRoles[author] = pattern.role;
            break;
          }
        }
      }
    }
    metadata.author = cleaned;
  } else if (typeof metadata.author === 'string' && metadata.author) {
    metadata.author = cleanName(metadata.author);
  }

  return metadata;
}

export function parseRawOcrText(raw) {
  if (!raw) return '';
  return raw
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .trim();
}
