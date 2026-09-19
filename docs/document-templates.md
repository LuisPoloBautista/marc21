# Metadatos por tipo documental

Campos comunes: `title`, `subtitle`, `author`, `authorRoles`, `language`, `doi`, `subjects`, `notes`, `dewey`, `copyrightYear`, `notesKind` y `evidence`. «Esencial» significa que debe buscarse y revisarse cuando falte; nunca autoriza inventarlo.

| Tipo | Metadatos específicos | Tratamiento MARC |
|---|---|---|
| Libro | publisher, place, year, pages, isbn, edition, series, corporate | 020, 250, 264, 300, 490; autor principal 100 y adicionales 700 |
| Artículo | hostTitle, volume, issue, pages, issn, publisher, place, year | 022, 773 con revista, volumen/número y rango; sin 020/250/264 |
| Capítulo | hostTitle, publisher, place, year, pages, isbn, edition, corporate | 773 con libro, edición, publicación, rango e ISBN $z; sin 020/250/264 propios |
| Tesis | degree, institution, advisor, place, year, pages, corporate | 502, 264 de producción, 700 para asesor y 710 para institución; sin ISBN/edición comercial |
| Memorias | meetingName, meetingDate, meetingPlace, publisher, place, year, pages, isbn, edition, series, corporate | 111 para reunión y 700 para responsables del volumen; 020/250/264/300/490 cuando consten |

Conservar páginas impresas y numeración preliminar; artículos/capítulos usan rango. Nunca reemplazarlas por la cuenta técnica del PDF. El idioma procede del recurso, no del español de la interfaz. Datos ausentes quedan vacíos en JSON; el borrador MARC puede mostrar las menciones locales de publicación no identificada para revisión.

Roles admitidos: autor, coordinador, compilador, editor, traductor, prologuista, ilustrador, asesor. Mantener roles explícitos y revisar la elección del punto de acceso principal. Las materias son propuestas automáticas; no se declaran autorizadas. Solo se genera 082: Dewey propuesto a partir de las materias y sujeto a revisión. No se genera 050 (LC).

Segunda búsqueda: título y año; editorial en libros/memorias; contenedor en artículos/capítulos; institución y grado en tesis. El resto de ausencias se muestra para revisión, evitando llamadas adicionales sin fin.

Las reglas de copyright como año alternativo, resumen literal o generado (máximo 100 palabras) y Dewey propuesto se definen en [la política de catalogación](skill_catalogacion_automatica_rda_llm.md). Las etiquetas de revisión se generan en código.
