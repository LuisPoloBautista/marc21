export function buildOcrPrompt(catLang) {
  const isp = catLang === 'eng' ? 'english' : 'spanish';
  return `Eres un asistente de vision especializado en documentos bibliograficos en ${isp}.

Analiza las imagenes de un documento (portada, contraportada, pagina legal/de creditos).

Extrae SOLO los datos que VEAS en las imagenes. NO inventes, NO interpretes.

Identifica y lista estos campos si aparecen:
- TITULO
- AUTOR
- EDITORIAL
- LUGAR
- ANIO
- ISBN
- EDICION
- PAGINAS
- SERIE

Devuelve solo los datos encontrados, cada campo en una linea, sin formato especial, sin markdown, sin JSON. Si un campo no aparece, omitelo.`;
}

export function buildStructuringPrompt(rawText, catLang, formatType) {
  const catLangName = catLang === 'eng' ? 'ingles' : 'espanol';
  const isp = catLang === 'eng' ? 'english' : 'spanish';

  const schema = {
    title: 'cadena',
    subtitle: 'cadena',
    author: ['arreglo de nombres'],
    authorRoles: { 'Nombre Apellido': 'rol' },
    corporate: 'cadena',
    publisher: 'cadena',
    place: 'cadena',
    year: 'cadena',
    pages: 'cadena (ej: 126 p.)',
    isbn: 'cadena (13 digitos)',
    issn: 'cadena',
    doi: 'cadena',
    edition: 'cadena',
    subjects: ['arreglo de materias'],
    language: 'cadena',
    series: 'cadena',
    notes: 'cadena (resumen breve)',
    hostTitle: 'cadena',
    volume: 'cadena',
    issue: 'cadena',
    degree: 'cadena',
    institution: 'cadena',
    advisor: 'cadena',
    meetingName: 'cadena',
    meetingDate: 'cadena',
    meetingPlace: 'cadena',
    dewey: 'cadena',
    lcClassification: 'cadena'
  };

  let extraRules = '';
  switch (formatType) {
    case 'thesis':
      extraRules = '\nReglas TESIS: usa "degree" para el programa academico. NO incluyas editorial ni ISBN. authorRoles jamas use "coordinador".';
      break;
    case 'proceedings':
      extraRules = '\nReglas PROCEEDINGS: todos los autores tienen rol "editor". Obligatorio incluir meetingName.';
      break;
    case 'article':
      extraRules = '\nReglas ARTICULO: hostTitle (nombre de la revista) es obligatorio. NO uses ISBN (usa ISSN en su lugar). No incluyas editorial.';
      break;
    case 'chapter':
      extraRules = '\nReglas CAPITULO: hostTitle (titulo del libro contenedor) es obligatorio. ISBN es del libro contenedor, no del capitulo.';
      break;
  }

  return `Eres un catalogador bibliografico experto en ${isp}. Tu tarea es estructurar el texto extraido de un documento en JSON.

IMPORTANTE: Extrae TODOS los datos que encuentres en el texto. Cada linea del texto puede contener informacion valiosa. No omitas nada.

Formato JSON requerido:
${JSON.stringify(schema, null, 2)}

INSTRUCCIONES DETALLADAS POR CAMPO:

- "title": SOLO el titulo principal. Si el texto dice "RDA - Recursos, Descripcion y Acceso: revision 2016", extrae "Recursos, Descripcion y Acceso" como title.
- "subtitle": subtitulo si existe despues de ":" o ";".
- "author": lista de nombres en orden directo (Nombre Apellido). Sin comas dentro del nombre. Ej: "Octavio G. Rojas L." NO "Rojas L., Octavio G." Si no hay autor, arreglo vacio [].
- "authorRoles": clave = nombre exacto del autor, valor = su rol. Detecta roles de estas formas:
  * "Coordinador/a NOMBRE" al inicio de linea → NOMBRE es "coordinador"
  * "bajo la coordinacion de NOMBRE" → NOMBRE es "coordinador"
  * "NOMBRE, coordinador/a" o "NOMBRE, coord." → NOMBRE es "coordinador"
  * "traductor principal NOMBRE" o "traduccion de NOMBRE" → NOMBRE es "traductor"
  * "prologo de NOMBRE" o "prologuista NOMBRE" → NOMBRE es "prologuista"
  * "ilustraciones de NOMBRE" o "ilustrador NOMBRE" → NOMBRE es "ilustrador"
  * "compilacion de NOMBRE" o "compilador NOMBRE" → NOMBRE es "compilador"
  * "edicion de NOMBRE" o "editor NOMBRE" → NOMBRE es "editor"
  * "asesor NOMBRE" → NOMBRE es "asesor"
  * Si una persona NO tiene rol explicito, NO la pongas en authorRoles. Solo lista en authorRoles a quienes tengan un rol definido.
- "corporate": entidad corporativa (comite, instituto, asociacion, universidad). Ej: "RDA Steering Committee (RSC)", "Comite Internacional de Revision".
- "publisher": editorial (sin las palabras "Editorial" o "Ediciones"). Puede estar al inicio del texto o despues de "publicado por".
- "place": ciudad de publicacion (NO el pais).
- "year": SOLO el año de publicacion del documento (formato YYYY). NO es el año del periodo historico. Busca años en la descripcion.${extraRules}
- "isbn": Busca "ISBN:" seguido de numeros. Limpia los guiones. Ej: "ISBN: 978-958-751-008-9" → "9789587510089".
- "subjects": LISTA de materias individuales. Cada materia va en un elemento SEPARADO del arreglo. NO juntes varias en uno solo.
  CORRECTO: ["Tecnologia de la informacion", "Practicas sociales", "Acceso a la informacion"]
  INCORRECTO: ["Tecnologia de la informacion, Practicas sociales, Acceso a la informacion"]
  Busca lineas como "1. Materia -- Submateria" o "1. Catalogacion - Normas". Usa " -- " (espacio-guion-espacio) para subdivision. Ignora numeracion al inicio.
- "language": idioma del documento (${isp}).
- "dewey": SOLO numero de Clasificacion Decimal Dewey puro (ej: "025.32", "620", "301.2"). NO confundas con "CDD 23" (es la edicion). NO tomes numeros que formen parte de una signatura LC como "T58.5" (eso NO es Dewey, es LC). Si hay duda, deja vacio.
- "lcClassification": signatura de Library of Congress. Busca patrones como "Z694.15.R47" o lineas como "T58.5 P73". Extrae SOLO la primera parte (ej: "T58.5" de "T58.5 P73", o "Z694.15.R47" de "Z694.15.R47 R47").
- "edition": mencion de edicion (ej: "revision 2016", "2a. ed.", "3rd ed.").
- "series": coleccion o serie del libro.
- "notes": resumen breve del contenido (max 3 oraciones).
- "pages": numero de paginas (ej: "300 p." o solo "300").
- "issn": solo para articulos de revista (formato XXXX-XXXX).
- "doi": identificador DOI si aparece.
- Campos sin informacion: dejar como cadena vacia "" o arreglo vacio [].

Texto extraido del documento:
${rawText}`;
}


