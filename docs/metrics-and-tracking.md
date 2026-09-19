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
Se contabiliza `usage` reportado por la API para OCR, estructuración y reintentos. Total = entrada + salida. La entrada en caché ya está incluida en entrada y no se suma otra vez. Una llamada sin reporte de uso se marca y el total se presenta como parcial. No se estima consumo ni dinero como si fueran datos medidos.
Los totales se conservan; el historial detallado retiene las últimas 100 solicitudes (el panel muestra 10). Se conserva el título (máximo 500 caracteres) para identificar cada generación; no se guardan imágenes, cuerpo del documento ni claves API en este archivo. Las solicitudes abortadas por un cierre abrupto del proceso pueden no quedar contabilizadas; este panel no sustituye el reporte de facturación del proveedor.

El archivo usa escritura temporal y renombrado. Las reservas de cuota evitan sobrepasos por solicitudes concurrentes en una única instancia Node. No compartir este archivo entre varios procesos/réplicas. Las rutas antiguas `/api/ocr` y `/api/structure` devuelven 410; todas las llamadas con costo pasan por `/api/extract-metadata`.

## Permanencia en Render
El blueprint del demo sigue usando el plan gratuito. [Render usa almacenamiento efímero por defecto](https://render.com/docs/disks): el historial puede perderse en reinicios/despliegues. Para una biblioteca comercial, montar un disco persistente y configurar `METRICS_FILE`. Los discos requieren un servicio de pago; el código no contrata ni activa uno automáticamente.

## Marca MARC
Cada generación lleva un UUID, fecha y biblioteca en `_provenance` del JSON y en [MARC 883, procedencia de metadatos](https://www.loc.gov/marc/bibliographic/bd883.html):
- $a: Catalogación automática MARC21.
- $d: fecha YYYYMMDD.
- $q: biblioteca generadora.
- $u: urn:uuid:identificador.

Se genera en código, sin tokens adicionales del modelo. Se omite de las vistas normales y de edición del asistente, pero se conserva en MARCXML y en el envío al formulario Koha. Si se edita el registro se conserva la marca con indicador de generación parcial. Es procedencia, no firma criptográfica ni protección contra alteraciones.
Koha debe tener 883 y sus subcampos habilitados en el framework; de lo contrario la integración informa campos omitidos. Ocultarlo en la vista pública de Koha requiere configurar ese framework/presentación. No se puede garantizar ocultación en Koha desde este sitio externo. No usar la marca como confirmación de que Koha guardó el registro.

## Tokens por libro
El panel muestra total general (todos los materiales y fallos), tokens de libros generados y promedio por libro. Este promedio divide los tokens reportados de generaciones exitosas de tipo `book` entre el número de esos libros con desglose disponible. No incluye artículos, tesis, capítulos, memorias ni fallos. La tabla presenta título, entrada, salida y total de cada generación reciente.
Al abrir un historial antiguo sin acumulador por libro se recupera el desglose disponible en las últimas 100 solicitudes. Si faltan libros antiguos o reportes de uso, se indica que las cifras son parciales; no se inventan tokens. Desde esta versión el acumulador por libro persiste aunque las filas antiguas salgan del historial reciente.

Ejemplo: entrada 12,364 + salida 5,700 = 18,064 tokens en total. No son palabras ni dinero. El desglose de entrada en caché es parte de entrada, no un gasto adicional que sumar al total.

Para localizar los registros ya guardados en Koha, consulta [el informe SQL](koha-informe-ia.md).
