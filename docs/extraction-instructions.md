# Extracción implementada

## Navegador
PDF.js obtiene metadatos y texto de todas las páginas localmente. `src/core/evidence.js` puntúa candidatas por ubicación y señales bibliográficas, deduplica texto y reduce bloques. Selecciona hasta 10 candidatas y reserva un máximo de 18 000 caracteres de evidencia. Solo renderiza para OCR las candidatas sin capa de texto utilizable. El resto del PDF no se envía al modelo.

Las imágenes se cargan en una zona única, hasta 10, con miniatura, número y eliminación individual. Se comprimen y las copias idénticas se omiten. Se pueden combinar con PDF y texto complementario del mismo recurso. Cada modificación invalida la caché del registro; repetir sin cambios reutiliza el JSON extraído.

## Servidor
OCR por lotes de 3 imágenes, conservando TODOS los lotes y sus marcadores. La estructuración recibe contexto reducido y esquema por tipo. Se comprueba la presencia literal de cada cita en su fuente; se muestran también ausencias, ambigüedades y propuestas. La coincidencia no valida la interpretación.

Si faltan campos esenciales, el navegador busca texto relacionado en páginas no enviadas y realiza como máximo una segunda solicitud con hasta 3 candidatas nuevas. Solo incorpora campos faltantes. Las fuentes sin texto fuera de la selección inicial requieren imágenes adicionales del usuario.

## Limpieza y MARC
No sustituir fechas por el primer año encontrado, ni extensión por número técnico de páginas, ni edición por una regex fuera de contexto. No inventar fecha de tesis. Normalizar identificadores sin seleccionar automáticamente otra edición. Construir MARC localmente conservando los campos por material.

Materias propuestas: segundo indicador 4, sin `$2` que atribuya un tesauro no consultado. La etiqueta «Propuesta automática» aparece en la revisión. `$2automatico` no se inventa como código de fuente. Referencia: [MARC 650](https://www.loc.gov/marc/bibliographic/bd650.html).

Agencia: opcional mediante `CATALOGING_AGENCY` en servidor; si no está configurada, no inventar 040 $a/$c. 040 $b indica español; 008/041 corresponden al idioma observado del recurso.

Las reglas de copyright como año alternativo, resumen literal o generado (máximo 100 palabras) y Dewey propuesto se definen en [la política de catalogación](skill_catalogacion_automatica_rda_llm.md). Las etiquetas de revisión se generan en código.
