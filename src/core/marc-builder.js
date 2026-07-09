import {
  invertName, normalizeName, normalizeCase,
  detectDates, detectCountry, splitTitle, normalizeGeo
} from '../utils/helpers.js';
import {
  normalizeMarcData, buildChronologicalField, suggestClassification
} from './marc-rules.js';

export function buildMarcRecord(metadata, opts = {}) {
  const formatType = opts.formatType || 'book';
  const isArticle = formatType === 'article';
  const isChapter = formatType === 'chapter';
  const isThesis = formatType === 'thesis';
  const isProceedings = formatType === 'proceedings';
  const isAnalytical = isArticle || isChapter;
  const agency = opts.agency || 'IGN';
  const catLang = opts.catLang || 'spa';
  const subjectInd2 = catLang === 'spa' ? '7' : '4';
  const now = new Date();
  const data = {};

  metadata = normalizeMarcData(metadata, opts);

  const pad2 = (n) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}${pad2(now.getMonth()+1)}${pad2(now.getDate())}${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}.0`;
  const yyMMdd = now.toISOString().slice(2, 10).replace(/-/g, '');

  const isCorporateName = (name) => {
    const corp = ['comité', 'committee', 'comission', 'comisión', 'consejo', 'council',
      'instituto', 'institute', 'universidad', 'university', 'facultad', 'faculty',
      'secretaría', 'secretaria', 'ministerio', 'ministry', 'departamento', 'department',
      'sociedad', 'society', 'asociación', 'association', 'fundación', 'foundation',
      'grupo', 'group', 'compañía', 'company', 'corporación', 'corporation',
      'biblioteca', 'library', 'archivo', 'archive', 'the ', 'american ', 'international ',
      'national ', 'national', 'rda steering', 'the library of congress'];
    const lower = name.toLowerCase();
    return corp.some(c => lower.startsWith(c) || lower.includes(' ' + c));
  };

  const asStr = (v) => Array.isArray(v) ? v.join(', ') : (v == null ? '' : String(v));
  const authorsRaw = Array.isArray(metadata.author) ? metadata.author.filter(Boolean) : [];
  const authors = authorsRaw.length > 0 ? authorsRaw : (asStr(metadata.author) ? [asStr(metadata.author)] : []);
  const authorRoles = metadata.authorRoles || {};
  const validRoles = ['autor', 'coordinador', 'compilador', 'editor', 'traductor', 'prologuista', 'ilustrador', 'asesor'];
  const getRole = (name) => {
    const role = authorRoles[name] || '';
    return validRoles.includes(role) ? role : '';
  };
  const corporate = asStr(metadata.corporate);
  const title = asStr(metadata.title);
  const subtitle = asStr(metadata.subtitle);
  const publisher = asStr(metadata.publisher);
  const place = asStr(metadata.place);
  const year = asStr(metadata.year);
  const pages = asStr(metadata.pages);
  const isbn = asStr(metadata.isbn);
  const issn = asStr(metadata.issn);
  const edition = asStr(metadata.edition);
  const subjects = Array.isArray(metadata.subjects) ? metadata.subjects : [];
  const language = asStr(metadata.language) || 'spa';
  const series = asStr(metadata.series);
  const notes = asStr(metadata.notes);
  const hostTitle = asStr(metadata.hostTitle);
  const volume = asStr(metadata.volume);
  const issue = asStr(metadata.issue);
  const doi = asStr(metadata.doi);
  const degree = asStr(metadata.degree);
  const institution = asStr(metadata.institution);
  const advisor = asStr(metadata.advisor);
  const meetingName = asStr(metadata.meetingName);
  const meetingDate = asStr(metadata.meetingDate);
  const meetingPlace = asStr(metadata.meetingPlace);
  const dewey = asStr(metadata.dewey);
  const lcClassification = asStr(metadata.lcClassification);

  const leaderType = 'i';
  const bibliographicLevel = isAnalytical ? 'a' : 'm';
  const encLevel = ' ';
  data.leader = `${'01850'}na${bibliographicLevel} a2200000${encLevel}${leaderType} 4500`;

  const cleanIsbn = isbn.replace(/[^0-9X]/gi, '');
  const validIsbn = /^(97[89]\d{10}|\d{9}[\dXx])$/.test(cleanIsbn) ? cleanIsbn : '';
  data['001'] = { value: validIsbn || '000001' };
  data['005'] = ts;

  const langMap = { esp: 'spa', ing: 'eng', por: 'por', fre: 'fre', ger: 'ger', ita: 'ita', rus: 'rus' };
  const rawLang = language.toLowerCase().slice(0, 3).replace(/[^a-z]/g, '');
  const langCode = langMap[rawLang] || rawLang || 'spa';
  const { type: dateType, date1, date2 } = detectDates(year);
  const placePub = detectCountry(place);
  const fict = ' ';
  const conf = '0';
  const index = '0';
  const bio = ' ';
  const mod = ' ';
  const src = 'd';

  data['008'] = yyMMdd + dateType + date1 + date2 + placePub +
    '    ' + ' ' + ' ' + '    ' +     ' ' + conf + ' ' + index + ' ' + fict + bio +
    langCode + mod + src;

  if (validIsbn && !isArticle) data['020'] = { ind1: ' ', ind2: ' ', a: validIsbn };
  if (issn && isArticle) data['022'] = { ind1: ' ', ind2: ' ', a: issn };
  if (doi) data['024'] = { ind1: '7', ind2: ' ', a: doi, '2': 'doi' };

  data['040'] = { ind1: ' ', ind2: ' ', a: agency, b: catLang, c: agency, e: 'rda' };

  if (language && langCode !== 'spa' && langCode !== '') {
    data['041'] = { ind1: '0', ind2: ' ', a: langCode };
  }

  const personalAuthors = authors.filter(a => !isCorporateName(a));
  const corpFromAuthors = authors.filter(a => isCorporateName(a));
  const effectiveCorporate = corporate || (corpFromAuthors.length > 0 ? corpFromAuthors.join('; ') : '');

  const defaultRole = isProceedings ? 'editor' : 'autor';
  if (personalAuthors.length > 0) {
    const authorWithPunct = (name, role) => {
      const r = role || defaultRole;
      return { a: r ? invertName(name) + ',' : invertName(name), e: r ? r + '.' : undefined };
    };
    if (isProceedings && meetingName) {
      data['700'] = [];
      for (const author of authors) {
        data['700'].push({ ind1: '1', ind2: ' ', ...authorWithPunct(author, getRole(author) || 'editor') });
      }
    } else {
      data['100'] = { ind1: '1', ind2: ' ', ...authorWithPunct(authors[0], getRole(authors[0]) || defaultRole) };
      if (authors.length > 1) {
        data['700'] = [];
        for (let i = 1; i < authors.length; i++) {
          data['700'].push({ ind1: '1', ind2: ' ', ...authorWithPunct(authors[i], getRole(authors[i]) || defaultRole) });
        }
      }
    }
  }

  if (effectiveCorporate) {
    if (isThesis && institution) {
      const dotParts = effectiveCorporate.split(/\.\s*/).filter(Boolean);
      if (dotParts.length >= 2 && dotParts[0].length < 15) {
        data['710'] = { ind1: '1', ind2: ' ', a: dotParts[0] + '.', b: dotParts.slice(1).join(' ') + ',', e: 'organismo otorgante.' };
      } else {
        const parts = effectiveCorporate.split(/\s+(?=SECRETARÍA|SECRETARIA|MINISTERIO|INSTITUTO|ESCUELA|FACULTAD|UNIVERSIDAD)/i);
        if (parts.length >= 2) {
          data['710'] = { ind1: '1', ind2: ' ', a: parts[0] + ',', b: parts.slice(1).join(' '), e: 'organismo otorgante.' };
        } else {
          data['710'] = { ind1: '2', ind2: ' ', a: effectiveCorporate + ',', e: 'organismo otorgante.' };
        }
      }
    } else if (!isAnalytical) {
      const corps = effectiveCorporate.split(/\s*[;,\/]+\s*|\s+y\s+|\s+and\s+/i).filter(Boolean);
      if (corps.length > 1) {
        data['710'] = corps.map(c => ({ ind1: '2', ind2: ' ', a: c.replace(/,$/, '') + ',', e: 'editor.' }));
      } else {
        data['710'] = { ind1: '2', ind2: ' ', a: effectiveCorporate.replace(/,$/, '') + ',', e: 'editor.' };
      }
    }
  }

  if (isProceedings && meetingName) {
    data['111'] = { ind1: '2', ind2: ' ', a: meetingName };
    if (meetingDate) data['111'].d = meetingDate;
    if (meetingPlace) data['111'].c = meetingPlace;
  }

  let useTitle = title;
  if (!useTitle) {
    if (authors.length > 0) {
      useTitle = 'Obra de ' + authors[0];
    } else if (subjects.length > 0) {
      useTitle = 'Obra sobre ' + String(subjects[0]).split('--')[0];
    } else {
      useTitle = '[Sin titulo]';
    }
  }

  {
    const normalized = normalizeCase(useTitle);
    let { main, sub } = splitTitle(normalized);
    if (!sub && subtitle) sub = subtitle;
      const autorList = personalAuthors.map(normalizeName).join(', ');

    const articleMatch = main.match(/^(El |La |Los |Las |Un |Una |The |A |An )/i);
    const ind2 = articleMatch ? (articleMatch[1].trim().length === 2 ? '2' : '3') : '0';

    let a = main;
    let b = sub || '';
    let c = autorList ? autorList + '.' : '';

    if (sub) a += ' :';
    if (c) {
      if (b) b += ' / ';
      else a += ' / ';
    }

    const titleField = { ind1: '1', ind2: ind2, a: a };
    if (b) titleField.b = b;
    if (c) titleField.c = c;
    data['245'] = titleField;
  }

  if (edition && !isThesis && !isChapter) {
    const cleanEdition = edition.replace(/^ed\.?\s*/i, '').trim();
    data['250'] = { ind1: ' ', ind2: ' ', a: cleanEdition + ' ed.' };
  }

  if (isThesis) {
    const thesis502 = { ind1: ' ', ind2: ' ' };
    if (degree) thesis502.b = degree;
    if (institution) thesis502.c = institution;
    if (year) thesis502.d = year + '.';
    if (thesis502.b || thesis502.c || thesis502.d) data['502'] = thesis502;

    if (advisor) {
      if (!data['700']) data['700'] = [];
      if (!Array.isArray(data['700'])) data['700'] = [data['700']];
      const advisors = advisor.split(/[,;]\s*/).map(a => a.trim()).filter(Boolean);
      for (const adv of advisors) {
        const cleanName = adv.replace(/^(Dr\.|Dra\.|Mtro\.|Mtra\.|Lic\.|Ing\.|PhD\.?)\s*/i, '').trim();
        data['700'].push({ ind1: '1', ind2: ' ', a: invertName(cleanName) + ',', e: 'asesor academico.' });
      }
    }
  }

  if (!isArticle && !isChapter) {
    const pubField = { ind1: ' ', ind2: isThesis ? '0' : '1' };
    if (isThesis) {
      pubField.a = (normalizeCase(place) || '[Lugar de publicacion no identificado]') + ' : ';
      pubField.b = (institution || publisher || '[editor no identificado]') + ', ';
      pubField.c = (year || '[fecha de publicacion no identificada]') + '.';
    } else {
      const placeNorm = normalizeCase(place);
      let pubNorm = publisher ? normalizeCase(publisher) : '';
      if (pubNorm && placeNorm && pubNorm.toLowerCase() === placeNorm.toLowerCase()) {
        pubNorm = '[editor no identificado]';
      }
      pubField.a = (placeNorm || '[Lugar de publicacion no identificado]') + ' : ';
      pubField.b = (pubNorm || '[editor no identificado]') + ', ';
      pubField.c = (year || '[fecha de publicacion no identificada]') + '.';
    }
    data['264'] = pubField;
  }

  const actualPageCount = !isAnalytical && opts.pageCount ? parseInt(opts.pageCount) : null;
  const pagesSource = actualPageCount ? String(actualPageCount) : pages;
  if (pagesSource) {
    const pagesField = { ind1: ' ', ind2: ' ' };
    if (isChapter || isArticle) {
      const rangeMatch = pagesSource.match(/(\d+)\s*-?\s*(\d+)/);
      if (rangeMatch) {
        pagesField.a = 'paginas ' + rangeMatch[1] + '-' + rangeMatch[2];
      } else {
        pagesField.a = 'paginas ' + pagesSource.replace(/[^0-9]/g, '');
      }
    } else {
      const match = pagesSource.match(/(\d+)/);
      const pagesNum = match ? match[1] : pagesSource;
      const unit = catLang === 'spa' ? ' paginas' : ' p.';
      let a = pagesNum + unit;
      const hasIllustrations = pagesSource.toLowerCase().includes('il') || pagesSource.toLowerCase().includes('fig');
      if (hasIllustrations) a += ' :';
      pagesField.a = a + '.';
      if (hasIllustrations) pagesField.b = 'il.';
    }
    data['300'] = pagesField;
  }

  if (!isArticle) {
    if (catLang === 'eng') {
      data['336'] = { ind1: ' ', ind2: ' ', a: 'text', b: 'txt', '2': 'rdacontent' };
      data['337'] = { ind1: ' ', ind2: ' ', a: 'unmediated', b: 'n', '2': 'rdamedia' };
      data['338'] = { ind1: ' ', ind2: ' ', a: 'volume', b: 'nc', '2': 'rdacarrier' };
    } else {
      data['336'] = { ind1: ' ', ind2: ' ', a: 'texto', b: 'txt', '2': 'rdacontent' };
      data['337'] = { ind1: ' ', ind2: ' ', a: 'sin mediación', b: 'n', '2': 'rdamedia' };
      data['338'] = { ind1: ' ', ind2: ' ', a: 'volumen', b: 'nc', '2': 'rdacarrier' };
    }
  }

  if (series) data['490'] = { ind1: '0', ind2: ' ', a: normalizeCase(series) };

  if (isAnalytical && hostTitle) {
    const hostField = { ind1: '0', ind2: ' ' };
    if (isAnalytical) hostField['7'] = 'nnas';
    hostField.t = hostTitle;
    if (isChapter && edition) {
      hostField.b = edition.replace(/^ed\.?\s*/i, '').trim() + ' ed.';
    }
    if (place || publisher) {
      const dParts = [];
      if (place) dParts.push(normalizeCase(place));
      if (publisher) dParts.push(normalizeCase(publisher));
      hostField.d = dParts.join(' : ');
    }
    if (year) {
      hostField.d = (hostField.d ? hostField.d + ', ' : '') + year.replace(/[^0-9-]/g, '');
    }
    if (isChapter && pages) {
      const rangeMatch = pages.match(/(\d+)\s*-?\s*(\d+)/);
      if (rangeMatch) hostField.g = 'Paginas ' + rangeMatch[1] + '-' + rangeMatch[2];
    } else if (!isChapter && pages) {
      const pageMatch = pages.match(/(\d+)\s*-?\s*(\d+)/);
      if (pageMatch) hostField.h = 'p. ' + pageMatch[1] + '-' + pageMatch[2];
    }
    if (isbn) hostField.z = isbn;
    if (issn && isArticle) hostField.x = 'ISSN ' + issn;
    data['773'] = hostField;
  }

  if (isProceedings && meetingName) {
    data['711'] = { ind1: '2', ind2: ' ', a: meetingName };
    if (meetingDate) data['711'].d = meetingDate;
    if (meetingPlace) data['711'].c = meetingPlace;
  }

  if (notes) data['520'] = { ind1: ' ', ind2: ' ', a: notes.endsWith('.') ? notes : notes + '.' };

  function isPlace(part) {
    return /^(México|Mexico|España|Spain|Estados Unidos|USA|Francia|France|Alemania|Germany|Inglaterra|England|Europa|Asia|África|América Latina|Sudamérica|Centroamérica|Argentina|Colombia|Perú|Chile|Venezuela|Cuba|Puerto Rico|Brasil|Canadá|China|Japón|India|Rusia|Australia|Nueva Zelanda|Londres|Madrid|París|Berlín|Roma|Buenos Aires|Bogotá|Lima|Santiago|Caracas|La Habana|Ciudad de México|CDMX|Oaxaca|Puebla|Veracruz|Jalisco|Yucatán|Nuevo León|Guanajuato|Michoacán)/i.test(part);
  }
  function isCentury(part) {
    return /^(Siglo|18th|19th|20th|21st|1st|2nd|3rd)/i.test(part);
  }

  const subjectsFields = [];
  for (const subject of subjects) {
    if (!subject) continue;
    const s = String(subject).trim();
    if (!s) continue;

    const parts = s.split('--').map(p => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      let mainIdx = 0;
      if (isPlace(parts[0])) {
        mainIdx = 1;
      }
      const field = { ind1: ' ', ind2: subjectInd2, a: parts[mainIdx] };
      if (catLang === 'spa') field['2'] = 'embnm';
      for (let i = 0; i < parts.length; i++) {
        if (i === mainIdx) continue;
        if (isCentury(parts[i])) {
          field.y = field.y ? field.y + ', ' + parts[i] : parts[i];
        } else if (isPlace(parts[i])) {
          field.z = normalizeGeo(parts[i]);
        } else {
          field.x = field.x ? field.x + ', ' + parts[i] : parts[i];
        }
      }
      subjectsFields.push(field);
    } else {
      const sf = { ind1: ' ', ind2: subjectInd2, a: s };
      if (catLang === 'spa') sf['2'] = 'embnm';
      subjectsFields.push(sf);
    }
  }
  if (subjectsFields.length > 0) data['650'] = subjectsFields;

  const chronological = metadata.chronologicalSubjects || [];
  if (chronological.length > 0) {
    const chronFields = chronological.map(s => buildChronologicalField(s, catLang));
    if (chronFields.length > 0) data['648'] = chronFields;
  }

  data['856'] = { ind1: ' ', ind2: ' ', a: '' };

  let effectiveLc = lcClassification;
  let effectiveDewey = dewey;
  const suggested = suggestClassification(subjects);
  if (!effectiveLc && suggested.lc) effectiveLc = suggested.lc;
  if (effectiveDewey) {
    const deweyClean = effectiveDewey.replace(/[^0-9.]/g, '').trim();
    if (!/^\d{1,4}(\.\d+)?$/.test(deweyClean)) effectiveDewey = '';
  }
  if (effectiveDewey && !lcClassification && suggested.lc && suggested.dewey) {
    const deweyStr = effectiveDewey.replace(/[^0-9.]/g, '');
    const lcStr = suggested.lc.replace(/[^0-9.A-Za-z]/g, '');
    if (lcStr.includes(deweyStr) || (!/\d/.test(lcStr) && /^\d{1,3}(\.\d+)?$/.test(deweyStr))) {
      effectiveDewey = suggested.dewey;
    }
  }
  if (effectiveDewey && effectiveLc) {
    const deweyDigits = effectiveDewey.replace(/[^0-9]/g, '');
    const lcDigits = effectiveLc.replace(/[^0-9]/g, '');
    if (lcDigits && deweyDigits && lcDigits.startsWith(deweyDigits)) effectiveDewey = '';
  }
  if (!effectiveDewey && suggested.dewey) effectiveDewey = suggested.dewey;

  if (effectiveLc) {
    data['050'] = { ind1: ' ', ind2: ' ', a: effectiveLc };
  }

  if (effectiveDewey) {
    const deweyClean = effectiveDewey.replace(/[^0-9.]/g, '').trim();
    if (deweyClean) {
      data['082'] = { ind1: '0', ind2: '4', a: deweyClean };
    }
  }

  return data;
}
