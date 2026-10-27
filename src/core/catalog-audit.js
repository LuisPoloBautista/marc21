const SEVERITY_PENALTY = { high: 18, medium: 9, low: 4 };

function add(issues, field, severity, message) {
  issues.push({ field, severity, message });
}

function entries(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

export function auditCatalogRecord(metadata = {}, record = {}, opts = {}) {
  const issues = [];
  const evidence = metadata.evidence || {};
  const format = opts.formatType || 'book';
  const required = format === 'article'
    ? ['title', 'author', 'hostTitle']
    : format === 'thesis'
      ? ['title', 'author', 'institution', 'year']
      : ['title', 'author', 'publisher', 'year'];

  const field040 = record['040'] || {};
  if (!field040.a || !field040.c) add(issues, '040', 'high', 'Falta la agencia catalogadora original y/o la agencia transcriptora.');
  if (record['856'] && !entries(record['856']).every(field => field?.u)) add(issues, '856', 'high', 'No se permite un 856 sin $u.');

  const language = String(metadata.language || '').trim().toLowerCase();
  if (language === 'mul') add(issues, '008/35-37', 'medium', '“mul” no identifica los idiomas específicos.');
  if (record['041']) {
    const codes = entries(record['041']).flatMap(field => String(field?.a || '').split(/[,;\s]+/)).filter(Boolean);
    if (codes.length < 2 || codes.includes('mul')) add(issues, '041', 'medium', '041 requiere al menos dos códigos de idioma específicos y sustentados.');
  }

  const authors = Array.isArray(metadata.author) ? metadata.author : [];
  if (authors.length > 1 && !metadata.responsibilityStatement) add(issues, '245', 'medium', 'La mención de responsabilidad no fue transcrita literalmente de la fuente preferida.');
  if (record['300'] && !evidence.pages?.verified) add(issues, '300', 'low', 'La extensión debe comprobarse en la manifestación; no se usa la cuenta técnica del PDF.');
  if (record['490'] && !evidence.series?.verified) add(issues, '490', 'medium', 'La serie no tiene evidencia literal verificada.');
  if (record['650']) add(issues, '650', 'medium', 'Materias propuestas sin vocabulario controlado consultado; requieren validación de autoridad.');
  if (record['082']) add(issues, '082', 'medium', 'Dewey es una propuesta temática y requiere validación en una fuente autorizada.');
  if (record['520']) add(issues, '520', 'low', 'Resumen generado: compruebe que todos los temas estén sustentados por la evidencia.');
  if (record['710'] && !metadata.corporateRole) add(issues, '710', 'medium', 'La función de la entidad corporativa no está explícitamente documentada.');

  const preferredSources = {
    title: /portada|portada sustituta/i,
    responsibilityStatement: /portada|portada sustituta/i,
    edition: /página legal|pagina legal|colofón|colofon/i,
    publisher: /página legal|pagina legal|colofón|colofon/i,
    place: /página legal|pagina legal|colofón|colofon/i,
    year: /página legal|pagina legal|colofón|colofon/i
  };
  for (const [key, preferred] of Object.entries(preferredSources)) {
    if (metadata[key] && evidence[key]?.sourceType && !preferred.test(evidence[key].sourceType)) {
      add(issues, key, 'medium', `El dato procede de “${evidence[key].sourceType}”, no de la fuente preferida prescrita.`);
    }
  }

  for (const key of required) {
    const value = metadata[key];
    const present = Array.isArray(value) ? value.some(Boolean) : Boolean(String(value || '').trim());
    if (!present) add(issues, key, 'high', `Falta un dato esencial para ${format}: ${key}.`);
    else if (key !== 'author' && evidence[key]?.status === 'observed' && evidence[key]?.verified !== true) add(issues, key, 'medium', 'El valor no pudo cotejarse literalmente en la fuente indicada.');
  }
  for (const [key, ev] of Object.entries(evidence)) {
    if (ev?.status === 'ambiguous') add(issues, key, 'medium', 'La extracción está marcada como ambigua.');
  }

  const unique = [...new Map(issues.map(issue => [`${issue.field}|${issue.message}`, issue])).values()];
  const score = Math.max(0, 100 - unique.reduce((sum, issue) => sum + SEVERITY_PENALTY[issue.severity], 0));
  return {
    score,
    label: score === 100 ? 'Sin observaciones automáticas' : score >= 80 ? 'Revisión menor' : score >= 60 ? 'Revisión necesaria' : 'Revisión prioritaria',
    issues: unique
  };
}
