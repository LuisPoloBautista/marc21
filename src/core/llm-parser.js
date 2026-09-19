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

  function cleanName(name) {
    if (!name) return name;
    return name.replace(/^(Dr\.|Dra\.|Mtro\.|Mtra\.|Lic\.|Ing\.|PhD\.?|Ph\.?\s*D\.?|M\.?\s*(Sc|A|Ed|C)\.?|MC\.?|Arq\.|Biol\.|Q\.?F\.?[BZ]?\.?|M\.?\s*en\s+C\.?)\s+/i, '').trim();
  }

  // Normalize identifiers without choosing another manifestation from a regex match.
  if (metadata.isbn) metadata.isbn = String(metadata.isbn).replace(/[^0-9X]/gi, '');
  if (metadata.issn) metadata.issn = String(metadata.issn).trim();
  // Dates, edition and extent must retain their bibliographic context.

  if (typeof metadata.title === 'string') metadata.title = metadata.title.trim();

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
