# Skill: catalogación RDA con evidencia seleccionada

## Objetivo y prioridad
Usar el LLM como catalogador de evidencia, no como lector del documento completo. Prioridad: precisión, trazabilidad, economía de tokens y automatización. Esta skill define la política; `extraction-instructions.md` describe el algoritmo implementado, `document-templates.md` los campos por material y `master-prompt.md` el contrato del modelo. Los documentos se complementan y no se concatenan en cada petición.

## Fuentes
Identificar la función de la fuente por su contenido, nunca por su número de página. Preferir portada para título y responsabilidad; página legal para edición y publicación; cubierta, anteportada, portada de serie, colofón y otras partes como complemento. Conservar el número físico de página o el número de imagen cargada. Los metadatos internos del PDF son auxiliares, nunca superiores al recurso visible.

## Selección económica
Extraer localmente metadatos, número técnico de páginas y texto por página. Libros: ventana inicial de primeras 10 y últimas 3; artículos: primeras 2 y última. Buscar en el texto restante ISBN, ISSN, DOI, copyright, edición, editorial, serie, colofón e información temática. Esta ventana es una heurística, no una regla RDA.
Deduplicar, puntuar y seleccionar hasta 10 candidatas. Conservar bloques relevantes, evitar cuerpo y bibliografía extensa. Aplicar OCR solo si falta texto utilizable. Las imágenes aportadas (hasta 10) representan páginas del mismo recurso y siguen el mismo contrato de evidencia y estructuración.
Una segunda búsqueda dirigida puede aportar hasta 3 páginas nuevas si faltan título, fecha, editorial, contenedor o datos esenciales de tesis. No reprocesar todo el documento. En escaneos sin texto fuera de la ventana inicial, pedir al catalogador imágenes adicionales de las fuentes faltantes; no afirmar que se buscó visualmente todo el PDF.

## Descripción
Separar transcripción e interpretación. Transcribir títulos y nombres editoriales completos. Distinguir responsabilidades, título original y título de la manifestación, edición y reimpresión, fecha de publicación y copyright/impresión. No inventar autores, fechas, lugares, edición, identificadores, extensión o dimensiones. La cuenta técnica del PDF no sustituye paginación impresa. Campos ausentes: null o arrays vacíos; ambigüedades: revisión humana.
El idioma de catalogación es español; el idioma del contenido se identifica por evidencia. Se conservan los metadatos particulares de los cinco tipos documentales.

## Evidencia y revisión
Cada campo incluye fuente, cita literal breve y estado observado/ambiguo/propuesto. El servidor comprueba que la cita aparezca en la fuente indicada. Esta comprobación no certifica la exactitud del OCR ni la interpretación bibliográfica. No presentar puntuaciones de confianza inventadas como garantías.
Materias y resumen se proponen desde título, índice, resumen o introducción seleccionados: hasta 5 materias y 2 oraciones. No atribuir un tesauro sin consultarlo. Clasificación solo si consta explícitamente; revisar su pertinencia.

## Salida e integración
Evidencia → JSON bibliográfico → revisión → MARC21 local → MARCXML o formulario Koha. La integración no guarda automáticamente. El catalogador revisa autoridades, duplicados, descripción física y campos obligatorios antes de guardar. Las consultas externas, Z39.50/SRU, detección automática de duplicados e ISO2709 son ampliaciones posibles, no funciones implementadas.
