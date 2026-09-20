-- Koha / MariaDB. Solo lectura. Incluye todos los materiales con marca 883.
-- Catalogador de alta: usuario del primer evento CATALOGUING / ADD / biblio.
-- Requiere CataloguingLog activo en el momento del alta y logs conservados.
-- No confundir creador original con quien incorporó IA a un registro existente.
SELECT
    b.biblionumber,
    b.title AS titulo,
    b.author AS autor,
    b.datecreated AS fecha_alta_koha,
    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.firstname, p.surname)), ''),
             p.userid, 'No disponible en el historial') AS catalogador_de_alta,
    al.user AS numero_usuario_catalogador,
    al.timestamp AS fecha_evento_alta,
    ExtractValue(bm.metadata, '//datafield[@tag="883"][subfield[@code="a"]="Catalogación automática MARC21"]/subfield[@code="d"]') AS fecha_generacion_ia,
    ExtractValue(bm.metadata, '//datafield[@tag="883"][subfield[@code="a"]="Catalogación automática MARC21"]/subfield[@code="q"]') AS biblioteca_generadora,
    ExtractValue(bm.metadata, '//datafield[@tag="883"][subfield[@code="a"]="Catalogación automática MARC21"]/subfield[@code="u"]') AS identificador_ia
FROM biblio AS b
INNER JOIN biblio_metadata AS bm ON bm.biblionumber = b.biblionumber
LEFT JOIN action_logs AS al ON al.action_id = (
    SELECT MIN(l.action_id)
    FROM action_logs AS l
    WHERE l.module = 'CATALOGUING'
      AND l.action = 'ADD'
      AND l.info = 'biblio'
      AND l.object = b.biblionumber
)
LEFT JOIN borrowers AS p ON p.borrowernumber = al.user
WHERE bm.format = 'marcxml'
  AND bm.schema = 'MARC21'
  AND ExtractValue(bm.metadata, 'count(//datafield[@tag="883"][subfield[@code="a"]="Catalogación automática MARC21"])') > 0
ORDER BY b.biblionumber DESC
