# Informe de registros generados con IA y catalogador

En Koha, Informes → Crear desde SQL: pegar `koha-registros-ia.sql`, guardar y ejecutar. Consulta de solo lectura para MariaDB/Koha MARC21; no se ha ejecutado sobre tu instalación.

Identifica registros por 883 $a = Catalogación automática MARC21, mostrando título, autor, fecha, biblioteca e identificador de generación. Habilitar 883 $a/$d/$q/$u en el framework. El script conserva 001 y 005 de Koha y permite importar 883.

## Catalogador
`catalogador_de_alta` se obtiene del primer evento CATALOGUING / ADD con info=biblio en action_logs, enlazando user con borrowers.borrowernumber. Excluir eventos de ejemplares evita confundir itemnumber con biblionumber. El informe conserva los registros aunque no haya log o el usuario ya no exista.

CataloguingLog debe haber estado activo y el historial conservarse. Si falta, aparece «No disponible en el historial»; habilitar logs ahora no recupera eventos pasados. El nombre es el actual de la cuenta, no una copia histórica.

En registros nuevos es el usuario que dio de alta el registro en Koha. Si el asistente se usó para modificar un registro existente, no prueba quién incorporó la IA: muestra el creador original. No confundirlo con el último modificador. La marca MARC sigue siendo editable y depende de su conservación.

Referencias: [action_logs](https://schema.koha-community.org/22_11/tables/action_logs.html), [CataloguingLog](https://koha-community.org/manual/22.11/en/html/logspreferences.html).

## Instalación de la interfaz
Reemplazar IntranetUserJS por el contenido actualizado de `docs/koha-staff-integration.js`. Incluye icono de estrellas SVG sin dependencias y botón Ampliar ventana / Restaurar tamaño. Desplegar también el backend y frontend para que vuelvan a generar y exportar 883. El script de Koha por sí solo no genera esa marca.
