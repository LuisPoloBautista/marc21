-- Koha / MariaDB: registros guardados con la marca de este asistente.
-- Pegar en Informes > Crear desde SQL. Solo lectura.
-- Incluye todos los materiales; no depende de códigos locales de tipo de ítem.
SELECT
    b.biblionumber,
    b.title AS titulo,
    b.author AS autor,
    b.datecreated AS fecha_alta_koha,
    ExtractValue(bm.metadata, '//datafield[@tag="883"][subfield[@code="a"]="Catalogación automática MARC21"]/subfield[@code="d"]') AS fecha_generacion_ia,
    ExtractValue(bm.metadata, '//datafield[@tag="883"][subfield[@code="a"]="Catalogación automática MARC21"]/subfield[@code="q"]') AS biblioteca_generadora,
    ExtractValue(bm.metadata, '//datafield[@tag="883"][subfield[@code="a"]="Catalogación automática MARC21"]/subfield[@code="u"]') AS identificador_ia,
    ExtractValue(bm.metadata, '//datafield[@tag="883"][subfield[@code="a"]="Catalogación automática MARC21"]/@ind1') AS indicador_procedencia
FROM biblio AS b
INNER JOIN biblio_metadata AS bm ON bm.biblionumber = b.biblionumber
WHERE bm.format = 'marcxml'
  AND bm.schema = 'MARC21'
  AND ExtractValue(bm.metadata, 'count(//datafield[@tag="883"][subfield[@code="a"]="Catalogación automática MARC21"])') > 0
ORDER BY b.biblionumber DESC
