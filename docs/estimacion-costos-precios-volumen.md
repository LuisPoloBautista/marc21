# Estimación de costos y precios por volumen

**Aplicación:** Generador de Registros MARC21  
**Fecha de referencia:** 22 de septiembre de 2026  
**Moneda de la API:** dólares estadounidenses (USD)  
**Moneda de la propuesta comercial:** pesos mexicanos (MXN)

## 1. Objetivo

Este documento estima el consumo de tokens, el costo de OpenAI y un precio comercial por volumen para procesar 1, 100, 1,000 y 5,000 libros con la aplicación.

Las cantidades son una estimación para presupuestar. El costo real depende de las páginas o imágenes que requieran OCR, la cantidad de texto útil y los tokens que reporte la API en cada generación. Como las métricas de las pruebas anteriores no se conservaron en almacenamiento persistente, las cifras de este documento son un **escenario hipotético de planeación**, no un promedio medido. Después de un nuevo piloto, el panel de métricas y el reporte de OpenAI deben utilizarse para sustituirlas por promedios reales.

## 2. Funcionamiento que genera consumo

Por cada libro, la aplicación ejecuta uno de estos flujos:

1. **PDF con texto legible o texto aportado:** una llamada para estructurar los metadatos bibliográficos.
2. **Imágenes o páginas que requieren OCR:** una llamada de visión para transcribir la evidencia y una llamada posterior para estructurar los metadatos.

La aplicación acepta hasta **5 imágenes** y las procesa juntas, por lo que un libro puede producir como máximo **1 llamada de OCR** y **1 llamada de estructuración**. La evidencia de texto enviada a estructuración se limita a **18,000 caracteres**.

## 3. Contenido enviado y tokens contemplados

### Prompts y skills

La aplicación no envía archivos de “skills” completos a OpenAI en cada llamada. Las skills y los documentos de catalogación del repositorio sirven como referencia de desarrollo. Las instrucciones efectivamente enviadas se construyen en `src/core/prompt-builder.js` y son:

| Llamada | Instrucción fija actual | Contenido variable |
|---|---:|---|
| OCR | 734 caracteres, aproximadamente 180–250 tokens | Etiquetas y hasta 5 imágenes en una llamada |
| Estructuración | 2,996 caracteres, aproximadamente 750–1,000 tokens | Evidencia bibliográfica, hasta 18,000 caracteres |

La conversión de caracteres a tokens es aproximada porque depende del idioma, signos, nombres propios y tokenizador del modelo. La cifra exacta solo se conoce mediante el campo `usage` que devuelve OpenAI.

“Evidencia textual” significa el texto bibliográfico seleccionado del documento: portada, página legal, ISBN, autores, editorial, fecha, resumen, índice y otros datos útiles. Puede provenir del texto del PDF, texto introducido por el usuario o de la salida del OCR. No es un prompt adicional ni una skill.

En una llamada de estructuración que use todo el límite, el contenido tendría hasta 20,996 caracteres: 2,996 del prompt fijo más 18,000 de evidencia. Esto suele equivaler aproximadamente a 5,250–7,000 tokens de entrada, pero el valor exacto puede variar.

### Límites configurados

| Concepto | Límite o referencia en la app |
|---|---:|
| Evidencia textual para estructuración | 18,000 caracteres como máximo |
| Imágenes por libro | 5 como máximo |
| Llamadas de OCR | Hasta 1 llamada por libro |
| Entrada visual presupuestada | Hasta 3,000 tokens por imagen y 15,000 por libro |
| Salida máxima de cada llamada OCR | 2,500 tokens |
| Salida máxima de estructuración | 4,096 tokens |
| Salida máxima solicitada por libro con OCR | 6,596 tokens |
| Reintentos automáticos | 0 |

Los **6,596 tokens de salida** son el máximo que la aplicación permite solicitar: una llamada OCR de hasta 2,500 tokens más una llamada de estructuración de hasta 4,096. No significa que OpenAI siempre produzca esa cantidad. No hay reintentos automáticos.

Las imágenes se envían con detalle `high`. Para GPT-5.5, el código establece un máximo presupuestario de **3,000 tokens visuales por imagen** y **15,000 por libro**, basado en 2,500 parches por imagen multiplicados por el factor 1.2 del modelo.

### Escenario hipotético utilizado para calcular costos

Para la planeación económica se adopta el siguiente escenario por libro con una llamada OCR y una de estructuración:

| Componente | Entrada estimada | Salida estimada |
|---|---:|---:|
| OCR: prompt, etiquetas e imágenes | 6,200 | 2,000 |
| Estructuración: prompt fijo y evidencia | 5,964 | 1,700 |
| **Total estimado** | **12,164** | **3,700** |

Los 3,700 tokens de salida son una hipótesis de consumo: 2,000 para OCR y 1,700 para el JSON. Son menores que el máximo técnico de 6,596 porque normalmente las respuestas terminan antes de agotar el límite.

| Tipo de token | Estimación de planeación por libro |
|---|---:|
| Entrada, incluido texto e imágenes contabilizadas por la API | 12,164 |
| Salida, incluido OCR y JSON bibliográfico | 3,700 |
| **Total estimado** | **15,864** |

Este escenario no procede de las pruebas perdidas ni representa un promedio demostrado. Sirve para hacer las operaciones del documento. Los PDF con texto legible pueden consumir mucho menos porque omiten OCR. Los libros con cinco imágenes o respuestas extensas pueden consumir más.

## 4. Tarifa de OpenAI utilizada

La aplicación utiliza **GPT-5.5** por defecto. La tarifa estándar publicada por OpenAI a la fecha de este documento es:

| Tipo | Precio por 1 millón de tokens |
|---|---:|
| Entrada | USD 5.00 |
| Entrada en caché | USD 0.50 |
| Salida | USD 30.00 |

Fuente: [documentación oficial del modelo GPT-5.5](https://developers.openai.com/api/docs/models/gpt-5.5).

La estimación adopta la tarifa completa de entrada y no descuenta entrada en caché. Esto da un presupuesto conservador. No incluye procesamiento regional, que puede tener un recargo, ni cambios futuros en las tarifas del proveedor.

## 5. Costo estimado de IA por libro

Fórmula:

```text
Costo = (tokens de entrada / 1,000,000 × USD 5.00)
      + (tokens de salida  / 1,000,000 × USD 30.00)
```

Aplicación al escenario base:

```text
Entrada: 12,164 / 1,000,000 × 5  = USD 0.06082
Salida:   3,700 / 1,000,000 × 30 = USD 0.11100
Total por libro                    = USD 0.17182
```

Para presupuestar variaciones, se recomienda reservar **USD 0.23 por libro** como bolsa operativa de IA. No es un redondeo de USD 0.17182: es una provisión para absorber variaciones normales. Con el tipo de cambio adoptado, el costo calculado es MXN 3.09 y la provisión es MXN 4.14.

## 6. Costos por volumen

### Consumo estimado y costo directo de OpenAI

| Volumen | Tokens de entrada | Tokens de salida | Tokens totales | Costo API estimado | Presupuesto de IA recomendado |
|---:|---:|---:|---:|---:|---:|
| 1 libro | 12,164 | 3,700 | 15,864 | USD 0.17 | USD 0.23 |
| 100 libros | 1,216,400 | 370,000 | 1,586,400 | USD 17.18 | USD 23.00 |
| 1,000 libros | 12,164,000 | 3,700,000 | 15,864,000 | USD 171.82 | USD 230.00 |
| 5,000 libros | 60,820,000 | 18,500,000 | 79,320,000 | USD 859.10 | USD 1,150.00 |

El presupuesto recomendado es una provisión de consumo, no el precio de venta. El costo de la API representa solo una parte del servicio.

### Referencia en pesos mexicanos

Para comparar se usa un **tipo de cambio presupuestario de MXN 18.00 por USD**. Debe actualizarse en la cotización final.

| Volumen | Costo API estimado | Presupuesto de IA recomendado |
|---:|---:|---:|
| 1 libro | MXN 3.09 | MXN 4.14 |
| 100 libros | MXN 309.28 | MXN 414.00 |
| 1,000 libros | MXN 3,092.76 | MXN 4,140.00 |
| 5,000 libros | MXN 15,463.80 | MXN 20,700.00 |

## 7. Propuesta comercial

La propuesta considera acceso a la aplicación, generación preliminar MARC21, exportación MARCXML, integración con Koha, métricas de uso y trazabilidad mediante el campo 883. Cada registro debe ser revisado por personal catalogador antes de guardarse en Koha.

### Cargo de implementación

**MXN 35,000 más IVA, por biblioteca**, que comprende:

- configuración de una instancia para la biblioteca;
- conexión segura con la clave de OpenAI del proyecto;
- configuración básica de identidad institucional y cuota;
- integración con el formulario de catalogación de Koha;
- validación del flujo con un lote piloto de hasta 25 libros;
- sesión remota de capacitación y entrega de guía de operación.

Los cambios al framework MARC, migraciones, limpieza retrospectiva de registros y desarrollos especiales se cotizan por separado.

### Precio por volumen de registros generados

| Paquete | Precio unitario | Subtotal del paquete | Implementación | Total inicial, sin IVA |
|---:|---:|---:|---:|---:|
| 1 libro de demostración por institución | Sin costo | MXN 0 | No aplica | MXN 0 |
| 100 libros | MXN 18.00 | MXN 1,800 | MXN 35,000 | MXN 36,800 |
| 1,000 libros | MXN 12.00 | MXN 12,000 | MXN 35,000 | MXN 47,000 |
| 5,000 libros | MXN 8.00 | MXN 40,000 | MXN 35,000 | MXN 75,000 |

La demostración de un libro se propone sin costo porque su objetivo es permitir que la institución evalúe el resultado; su costo técnico estimado, cercano a MXN 4.14, se considera adquisición comercial.

Los precios por volumen no se obtienen sumando solamente tokens. También remuneran el uso del sistema, mantenimiento, monitoreo, atención, riesgo de variación y desarrollo acumulado. Por ejemplo, el precio de MXN 18 por libro del paquete de 100 contiene aproximadamente MXN 4.14 de provisión de IA y MXN 13.86 para operación y margen. El cargo de implementación cubre por separado el trabajo inicial de configurar e integrar una biblioteca.

El precio cubre generaciones exitosas hasta el volumen contratado. La corrección intelectual final, autoridades, clasificación definitiva y validación catalográfica especializada permanecen bajo responsabilidad de la biblioteca. Una nueva extracción solicitada por cambios de fuente o sustitución de archivos cuenta como una generación adicional.

### Soporte y operación

Se propone una póliza opcional de **MXN 2,500 mensuales más IVA** por biblioteca, que incluye mantenimiento correctivo, revisión mensual del consumo, respaldo de la configuración y hasta 2 horas de soporte remoto. Infraestructura, almacenamiento persistente, dominio y consumo de OpenAI pueden facturarse directamente a la biblioteca o incluirse contra comprobación en la factura del servicio.

## 8. Condiciones para una cotización definitiva

Antes de comprometer el precio de un lote grande se recomienda procesar entre 25 y 50 libros representativos. Con esa muestra deben calcularse:

- promedio real de tokens de entrada y salida por libro;
- proporción de libros que requieren OCR;
- tasa de reintentos y fallos;
- tiempo de revisión humana por registro;
- calidad de las imágenes y variedad de idiomas o tipologías.

La fórmula para recalcular el costo real medio es:

```text
Costo medio por libro =
  (entrada media × tarifa de entrada
   + salida media × tarifa de salida) / 1,000,000
```

El panel de la aplicación ya registra los tokens reportados por OpenAI para OCR y estructuración. También presenta una tasa de reintentos de 0% mientras permanezcan desactivados. Estos datos, junto con la facturación del proveedor, son la fuente adecuada para ajustar la propuesta después del piloto.

## 9. Vigencia y supuestos

- Tarifas de OpenAI consultadas el 22 de septiembre de 2026.
- Propuesta comercial sugerida con vigencia de 30 días.
- Importes comerciales expresados antes de IVA.
- Tipo de cambio de referencia: MXN 18.00 por USD.
- No se incluyen costos de catalogación humana, infraestructura de pago, almacenamiento persistente, dominio ni desarrollos especiales.
- La aplicación genera registros preliminares; no sustituye la revisión profesional del catalogador.
