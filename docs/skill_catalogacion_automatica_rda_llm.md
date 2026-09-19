# Skill: catalogación RDA con evidencia seleccionada

## Objetivo y prioridad
Usar el LLM como catalogador de evidencia, no como lector del documento completo. Prioridad: precisión, trazabilidad, economía de tokens y automatización. Esta skill define la política; `extraction-instructions.md` describe el algoritmo implementado, `document-templates.md` los campos por material y `master-prompt.md` el contrato del modelo. Los documentos se complementan y no se concatenan en cada petición.

## Fuentes
Identificar la función de la fuente por su contenido, nunca por su número de página. Preferir portada para título y responsabilidad; página legal para edición y publicación; cubierta, anteportada, portada de serie, colofón y otras partes como complemento. Conservar el número físico de página o el número de imagen cargada. Los metadatos internos del PDF son auxiliares, nunca superiores al recurso visible.

## Selección económica
Extraer localmente metadatos, número técnico de páginas y texto por página. Libros: ventana inicial de primeras 10 y últimas 3; artículos: primeras 2 y última. Buscar en el texto restante ISBN, ISSN, DOI, copyright, edición, editorial, serie, colofón e información temática. Esta ventana es una heurística, no una regla RDA.
Deduplicar, puntuar y seleccionar hasta 10 candidatas. Conservar bloques relevantes, evitar cuerpo y bibliografía extensa. Aplicar OCR solo si falta texto utilizable. Las imágenes aportadas (hasta 5) representan páginas del mismo recurso y siguen el mismo contrato de evidencia y estructuración.
No realizar segunda búsqueda. Generar con la evidencia de la selección inicial; mostrar campos faltantes para revisión. Límite total de 5 imágenes por solicitud (adjuntas y páginas PDF para OCR); no limita las páginas que aportan texto local. En escaneos sin texto fuera de la selección, no afirmar que se buscó visualmente todo el PDF.

## Descripción
Separar transcripción e interpretación. Transcribir títulos y nombres editoriales completos. Distinguir responsabilidades, título original y título de la manifestación, edición y reimpresión, fecha de publicación y copyright/impresión. No inventar autores, fechas, lugares, edición, identificadores, extensión o dimensiones. La cuenta técnica del PDF no sustituye paginación impresa. Campos ausentes: null o arrays vacíos; ambigüedades: revisión humana.
El idioma de catalogación es español; el idioma del contenido se identifica por evidencia. Se conservan los metadatos particulares de los cinco tipos documentales.

## Evidencia y revisión
Cada campo incluye fuente, cita literal breve y estado observado/ambiguo/propuesto. El servidor comprueba que la cita aparezca en la fuente indicada. Esta comprobación no certifica la exactitud del OCR ni la interpretación bibliográfica. No presentar puntuaciones de confianza inventadas como garantías.
Materias y resumen se proponen desde título, índice, resumen o introducción seleccionados: hasta 5 materias. Generar siempre un resumen en español de máximo estricto de 100 palabras, utilizando Abstract/Resumen como evidencia cuando exista. No atribuir un tesauro sin consultarlo. Proponer únicamente Dewey a partir de las materias, marcarlo como propuesta automática y revisar su pertinencia. No generar LC.

## Salida e integración
Evidencia → JSON bibliográfico → revisión → MARC21 local → MARCXML o formulario Koha. La integración no guarda automáticamente. El catalogador revisa autoridades, duplicados, descripción física y campos obligatorios antes de guardar. Las consultas externas, Z39.50/SRU, detección automática de duplicados e ISO2709 son ampliaciones posibles, no funciones implementadas.

## Reglas de año, resumen y revisión
Año: priorizar publicación; si falta, usar el año explícito de Copyright Year/Copyright/© de la manifestación, conservando su fuente y la indicación de copyright. No confundirlo con fechas de impresión.
Resumen: siempre generado (`notesKind=generated`), máximo 100 palabras contadas por espacios y limitado también en código. No transcribir íntegramente el Abstract. Dewey se propone con base en materias; LC se omite.
Las etiquetas «Sin evidencia literal» y «Cita localizada ✓» son texto fijo de la interfaz. El modelo devuelve fuentes, citas breves y estados compactos; el servidor verifica la coincidencia. El resumen generado no se presenta como cita literal.
