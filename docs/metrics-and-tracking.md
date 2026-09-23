# Métricas, cuotas y trazabilidad

## Demo y bibliotecas
El demo no tiene límite. Cada biblioteca utiliza un despliegue independiente y su propio enlace, archivo de métricas y configuración de servidor. Un parámetro de URL no cambia la biblioteca ni su cuota.

| Variable | Demo | Uso |
|---|---|---|
| LIBRARY_ID | demo | Identificador estable; no cambiarlo sobre un historial existente. |
| LIBRARY_NAME | Biblioteca demo | Nombre visible en el panel. |
| LIBRARY_RECORD_LIMIT | sin definir | Cuota total acumulada de generaciones exitosas; entero no negativo. Vacío: sin límite. Cero: bloqueado. |
| METRICS_FILE | .data/metrics.json | Archivo JSON de métricas; en producción debe estar en un volumen persistente. |

Ejemplo para una biblioteca: `LIBRARY_ID=biblioteca-a`, `LIBRARY_NAME=Biblioteca A`, `LIBRARY_RECORD_LIMIT=1000`, `METRICS_FILE=/var/data/metrics.json`, con disco montado en `/var/data`.

La cuota abarca todos los tipos de material. El panel separa libros del total de registros. Cuenta generaciones exitosas, no títulos únicos ni registros guardados en Koha. Repetir desde la caché o exportar no descuenta otra unidad; una nueva extracción sí. Los fallos no consumen cuota de registros, pero pueden consumir tokens. No hay reinicio mensual automático ni facturación. El límite por tokens no se aplica: se muestran entrada y salida para evaluar el modelo comercial.

## Métricas
Se contabiliza `usage` reportado por la API para OCR y estructuración. Total = entrada + salida. La entrada en caché ya está incluida en entrada y no se suma otra vez. Una llamada sin reporte de uso se marca y el total se presenta como parcial. No se estima consumo ni dinero como si fueran datos medidos. El flujo no realiza reintentos automáticos, por lo que la tasa de reintentos permanece en cero mientras se conserve esta política.
Los totales se conservan; el historial detallado retiene las últimas 100 solicitudes (el panel muestra 10). Se conserva el título (máximo 500 caracteres) para identificar cada generación; no se guardan imágenes, cuerpo del documento ni claves API en este archivo. Las solicitudes abortadas por un cierre abrupto del proceso pueden no quedar contabilizadas; este panel no sustituye el reporte de facturación del proveedor.

El archivo usa escritura temporal y renombrado. Las reservas de cuota evitan sobrepasos por solicitudes concurrentes en una única instancia Node. No compartir este archivo entre varios procesos/réplicas. Las rutas antiguas `/api/ocr` y `/api/structure` devuelven 410; todas las llamadas con costo pasan por `/api/extract-metadata`.

## Permanencia en Render
El blueprint configura un servicio `starter`, un disco persistente de 1 GB montado en `/var/data` y `METRICS_FILE=/var/data/metrics.json`. [Render conserva únicamente los archivos escritos bajo el punto de montaje](https://render.com/docs/disks). Aplicar este blueprint implica un servicio de pago; revisar el precio vigente en Render antes de desplegar.

## Seguimiento mediante 883
Cada generación conserva un UUID en métricas y lo incluye en 883 $u como urn:uuid. $a identifica al asistente, $d contiene fecha de generación y $q la biblioteca. El campo se conserva en MARCXML y se copia a Koha, aunque se omite de la vista habitual del asistente. Al editar en el asistente se mantiene con indicador de generación parcial.
El framework Koha debe permitir 883 $a/$d/$q/$u. El [informe SQL](koha-informe-ia.md) localiza esa marca y muestra el catalogador de alta cuando el historial lo permite. El campo es editable y no sustituye una auditoría inmutable. Las métricas cuentan generaciones, no guardados confirmados en Koha.

## Tokens por libro
El panel muestra total general, tokens de libros, promedio total y promedios separados de entrada y salida por libro. También muestra la cantidad y proporción de libros que usaron OCR, la tasa de reintentos y la tasa de fallos. Los promedios por libro usan generaciones exitosas de tipo `book`; la tasa de fallos usa todas las generaciones terminadas.
Al abrir un historial antiguo sin acumulador por libro se recupera el desglose disponible en las últimas 100 solicitudes. Si faltan libros antiguos o reportes de uso, se indica que las cifras son parciales; no se inventan tokens. Desde esta versión el acumulador por libro persiste aunque las filas antiguas salgan del historial reciente.

Ejemplo: entrada 12,164 + salida 3,700 = 15,864 tokens en total. No son palabras ni dinero. El desglose de entrada en caché es parte de entrada, no un gasto adicional que sumar al total.

Consulta el [estado de la auditoría en Koha](koha-informe-ia.md).
