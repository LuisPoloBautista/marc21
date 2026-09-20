# Seguimiento fuera del MARC

Se retiró la marca 883 y el informe basado en ella. El archivo SQL actual es un aviso informativo, no un listado de registros IA. No se sustituye por coincidencias de títulos, ISBN o fechas, que no prueban procedencia.

La alternativa es una tabla de auditoría separada del registro MARC, vinculada al `biblionumber`. Debe registrar biblioteca, generación interna, usuario, fecha y evento de guardado confirmado. Un plugin/hook del servidor Koha o una integración autenticada que confirme el guardado debe escribirla; copiar datos al formulario no basta. Los cambios al MARC no borran esa relación; sus permisos, respaldos y permanencia se administran aparte.

Estado actual: el asistente conserva las generaciones y tokens en su panel, pero no conoce qué registros llegaron a guardarse en Koha. No hay todavía plugin de auditoría ni tabla instalada. Para implementarlo hay que conocer la versión de Koha y disponer de instalación de plugins o acceso al servidor/API según el mecanismo elegido. IntranetUserJS por sí solo no garantiza auditoría persistente.

## Mensaje de importación
001 y 005 se dejan a Koha, sin intentar copiarlos desde el borrador. Para 000 y 008, el script busca también directamente el editor del campo de control cuando no existe un input oculto de código. Si el campo no existe realmente, se informa; no se inventa un control fuera del framework. Los subcampos descriptivos ausentes, como 040 $b, siguen mostrándose para revisión.

Después de desplegar la aplicación, reemplazar el script de IntranetUserJS por `docs/koha-staff-integration.js`. Los cambios de este archivo no llegan automáticamente a la preferencia Koha.
