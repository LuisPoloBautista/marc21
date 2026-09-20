-- Informe anterior retirado: ya no se introduce una marca de IA en MARC.
-- Esta consulta informativa no identifica registros ni modifica datos.
-- Para un informe real se necesita una tabla de auditoría externa al MARC,
-- alimentada al confirmar el guardado en Koha y vinculada a biblionumber.
-- Esa tabla/integración todavía no está instalada.
SELECT 'Informe de IA pendiente: se requiere auditoría de guardado vinculada a biblionumber, fuera del MARC.' AS estado
