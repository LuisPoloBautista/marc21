# Informe de registros generados con IA

En Koha abre **Informes → Crear desde SQL**, pega el contenido de `koha-registros-ia.sql`, guarda con el nombre «Registros generados con IA» y ejecuta. Consulta de solo lectura para Koha con MARC21 almacenado en `biblio_metadata` y MariaDB con `ExtractValue`.

Muestra número bibliográfico, título, autor, fecha de alta en Koha, fecha de generación, biblioteca e identificador UUID del asistente. Indicador 0: generación automática; 1: registro editado en el asistente. No prueba que no haya habido otras modificaciones posteriores en Koha.

Incluye libros y otros materiales marcados, para no depender del código de ítem local. Si necesitas solo libros de un tipo Koha concreto, el código puede variar por biblioteca y no se debe asumir `BK`. El informe no duplica registros por sus ejemplares.

Solo identifica registros que conservaron 883 $a/$d/$q/$u al guardarse en Koha. Los registros anteriores a la incorporación de esa marca, o aquellos donde el framework la omitió, no pueden identificarse automáticamente con este informe. Habilita esos subcampos en el framework antes de importar. El UUID de 883 $u permite relacionar el registro con el historial de métricas; los tokens no se guardan dentro de Koha.

El informe está preparado, pero no se ha ejecutado sobre tu base de datos. Referencias: [esquema BiblioMetadata](https://perldoc.koha-community.org/Koha/Schema/Result/BiblioMetadata.html), [informes SQL de Koha](https://koha-community.org/manual/22.05/en/html/reports.html).
