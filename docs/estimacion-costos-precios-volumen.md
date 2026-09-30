# Estimación de costos y precios por volumen

**Aplicación:** Generador de Registros MARC21  
**Fecha de referencia:** 22 de septiembre de 2026  
**Moneda de la API:** dólares estadounidenses (USD)  
**Moneda de la propuesta comercial:** pesos mexicanos (MXN)

## 1. Objetivo

Este documento estima el consumo de tokens, el costo de OpenAI y un precio comercial por volumen para procesar 1, 100, 1,000 y 5,000 libros con la aplicación.

Las cantidades económicas son una estimación para presupuestar. El costo real depende de las páginas o imágenes que requieran OCR, la cantidad de texto útil y los tokens que reporte la API en cada generación. Las tablas de costos conservan un **escenario hipotético de planeación**, no un promedio medido. La sección 2 incorpora por separado la muestra de cuatro registros aportada el 30 de septiembre. Después de un nuevo piloto con el límite actualizado, el panel de métricas y el reporte de OpenAI deben utilizarse para recalcular las estimaciones.

## 2. Funcionamiento que genera consumo

Por cada libro, la aplicación ejecuta uno de estos flujos:

1. **PDF con texto legible o texto aportado:** una llamada para estructurar los metadatos bibliográficos.
2. **Imágenes o páginas que requieren OCR:** una llamada de visión para transcribir la evidencia y una llamada posterior para estructurar los metadatos.

La aplicación acepta hasta **5 imágenes** y las procesa juntas, por lo que un libro puede producir como máximo **1 llamada de OCR** y **1 llamada de estructuración**. Desde el ajuste del 30 de septiembre de 2026, la evidencia de texto enviada a estructuración se limita a **4,000 tokens**, contados localmente con `js-tiktoken` y la codificación `o200k_base` para la familia GPT-5. Se conserva además el tope de selección de 18,000 caracteres. Si se cambia a un modelo con otra codificación, deberá adaptarse el tokenizador.

El presupuesto de 4,000 tokens se comparte entre texto del PDF, texto aportado, metadatos auxiliares y transcripción OCR, incluidos sus marcadores de fuente. **No incluye las instrucciones del prompt ni la entrada visual del OCR.** El servidor compacta la evidencia entre fuentes y vuelve a contar hasta cumplir el límite; no añade llamadas a la API. El recorte puede omitir datos, por lo que se mantiene la revisión catalográfica.

### Muestra observada antes del ajuste

Los cuatro registros aportados el 30 de septiembre de 2026 suman:

| Concepto | Total de 4 libros | Promedio por libro |
|---|---:|---:|
| Entrada | 26,302 | 6,575.5 |
| Salida | 15,968 | 3,992 |
| Total | 42,270 | 10,567.5 |

El panel redondea el promedio total a **10,568**. La entrada suma instrucciones, evidencia textual e imágenes de las llamadas realizadas. La salida suma transcripción OCR y JSON bibliográfico, además del razonamiento que la API contabilice como salida. El MARC21 se construye localmente desde ese JSON; no es una respuesta MARC generada directamente por la API. El historial agregado no permite atribuir exactamente los tokens de cada registro a texto, imágenes o instrucciones.

Este cambio afecta a las nuevas generaciones y no modifica los consumos históricos. **No garantiza 4,000 tokens de entrada total ni 4,000 tokens totales por libro.** Para comprobar el ahorro y la calidad, hace falta una muestra nueva con el límite aplicado.

## 3. Contenido enviado y tokens contemplados

### Prompts y skills

La aplicación no envía archivos de “skills” completos a OpenAI en cada llamada. Las skills y los documentos de catalogación del repositorio sirven como referencia de desarrollo. Las instrucciones efectivamente enviadas se construyen en `src/core/prompt-builder.js` y son:

| Llamada | Instrucción fija actual | Contenido variable |
|---|---:|---|
| OCR | 734 caracteres, aproximadamente 180–250 tokens | Etiquetas y hasta 5 imágenes en una llamada |
| Estructuración | 2,996 caracteres, aproximadamente 750–1,000 tokens | Evidencia bibliográfica, hasta 4,000 tokens y 18,000 caracteres |

La conversión de caracteres a tokens es aproximada porque depende del idioma, signos, nombres propios y tokenizador del modelo. El límite de evidencia usa tokenización del texto, no una división de caracteres. El consumo completo de la solicitud se obtiene del campo `usage` que devuelve OpenAI; incluye elementos adicionales al texto contado localmente. Véase [conteo de tokens de OpenAI](https://developers.openai.com/api/docs/guides/token-counting).

“Evidencia textual” significa el texto bibliográfico seleccionado del documento: portada, página legal, ISBN, autores, editorial, fecha, resumen, índice y otros datos útiles. Puede provenir del texto del PDF, texto introducido por el usuario o de la salida del OCR. No es un prompt adicional ni una skill.

En una llamada de estructuración que use todo el límite, la entrada será de hasta 4,000 tokens de evidencia más las instrucciones y el formato de la solicitud. El prompt fijo conserva sus instrucciones completas y queda fuera del presupuesto documental. Las imágenes de una llamada OCR anterior se contabilizan por separado y pueden elevar considerablemente la entrada agregada por libro.

### Límites configurados

| Concepto | Límite o referencia en la app |
|---|---:|
| Evidencia textual para estructuración | 4,000 tokens como máximo; guarda adicional de 18,000 caracteres |
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

Para la planeación económica se conserva el siguiente escenario histórico por libro con una llamada OCR y una de estructuración, elaborado antes del tope de 4,000 tokens de evidencia. Las tablas económicas posteriores utilizan este supuesto: no representan el consumo medido ni una proyección recalculada del nuevo límite. Deben ajustarse con un nuevo piloto.

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

## 8. Ejemplo hipotético de rentabilidad para Ignite

Para comparar los dos modelos se utiliza una biblioteca que contrata la implementación y un paquete de **1,000 libros**.

### Ingreso común en ambos escenarios

| Concepto | Cálculo | Importe |
|---|---:|---:|
| Implementación e integración | Precio fijo | MXN 35,000 |
| Paquete de 1,000 libros | 1,000 × MXN 12 | MXN 12,000 |
| **Ingreso total, sin IVA** |  | **MXN 47,000** |

El costo presupuestado de OpenAI es de **MXN 4,140**. Si únicamente se descuenta el procesamiento de OpenAI, la contribución bruta sería igual en ambos modelos:

```text
Ingreso:                 MXN 47,000
Procesamiento OpenAI:  − MXN  4,140
Contribución bruta:      MXN 42,860
Margen de contribución:        91.2%
```

Esta contribución todavía no es la utilidad final: faltan el tiempo del personal, las pruebas, la capacitación y, cuando corresponda, la parte de infraestructura de Ignite asignada al proyecto.

### Escenario A: servicio alojado y administrado por Ignite en AKS

Ignite despliega la aplicación en su propia infraestructura de Azure Kubernetes Service y ofrece el servicio de IA a la biblioteca. Ignite administra el `Deployment`, `Service`, `Ingress`, certificado, secretos, volumen persistente, métricas, respaldos y operación de la aplicación.

Se supone que el AKS ya existe y tiene capacidad disponible, por lo que no se compra un servidor nuevo. Para no presentar la infraestructura como gratuita, se asigna al proyecto una parte anual de MXN 6,000 por cómputo, almacenamiento, respaldos y operación compartida.

| Costo para Ignite | Supuesto | Importe |
|---|---:|---:|
| Procesamiento OpenAI | 1,000 libros × MXN 4.14 | MXN 4,140 |
| Despliegue e integración | 32 horas × MXN 300 | MXN 9,600 |
| Pruebas, capacitación y documentación | 8 horas × MXN 300 | MXN 2,400 |
| Infraestructura AKS compartida | Asignación anual al cliente | MXN 6,000 |
| Contingencia técnica | Ajustes y consumo extraordinario | MXN 2,000 |
| **Costo total estimado para Ignite** |  | **MXN 24,140** |

```text
Ingreso total:               MXN 47,000
Costo total estimado:      − MXN 24,140
Utilidad estimada Ignite:     MXN 22,860
Margen estimado:                   48.6%
```

En este escenario, la **utilidad estimada para Ignite es MXN 22,860** durante el primer año. La asignación de MXN 6,000 debe sustituirse por el costo real proporcional del AKS cuando se conozcan el consumo de CPU, memoria, almacenamiento, respaldos y tráfico del cliente.

### Escenario B: instalación en el servidor administrado por la biblioteca

La biblioteca aporta y administra su servidor o clúster, almacenamiento, certificados, respaldos, red y subdominio. Ignite instala la aplicación, configura la integración con Koha y entrega la solución. La institución asume las ampliaciones y los incidentes de su infraestructura.

| Costo para Ignite | Supuesto | Importe |
|---|---:|---:|
| Procesamiento OpenAI | 1,000 libros × MXN 4.14 | MXN 4,140 |
| Instalación e integración | 32 horas × MXN 300 | MXN 9,600 |
| Pruebas, capacitación y documentación | 8 horas × MXN 300 | MXN 2,400 |
| Infraestructura y almacenamiento | Aportados por la biblioteca | MXN 0 |
| Contingencia técnica | Ajustes y consumo extraordinario | MXN 2,000 |
| **Costo total estimado para Ignite** |  | **MXN 18,140** |

```text
Ingreso total:               MXN 47,000
Costo total estimado:      − MXN 18,140
Utilidad estimada Ignite:     MXN 28,860
Margen estimado:                   61.4%
```

En este escenario, la **utilidad estimada para Ignite es MXN 28,860**, porque Ignite no absorbe infraestructura ni administración del servidor de la biblioteca.

### Comparación

| Concepto | Ignite aloja en AKS | Biblioteca administra su servidor |
|---|---:|---:|
| Ingreso del proyecto | MXN 47,000 | MXN 47,000 |
| Costo presupuestado de OpenAI | MXN 4,140 | MXN 4,140 |
| Trabajo, pruebas y contingencia | MXN 14,000 | MXN 14,000 |
| Infraestructura asignada | MXN 6,000 | MXN 0 |
| **Utilidad estimada para Ignite** | **MXN 22,860** | **MXN 28,860** |
| **Margen estimado** | **48.6%** | **61.4%** |

El valor de MXN 300 por hora es un costo interno hipotético para medir rentabilidad. No representa necesariamente la tarifa mostrada al cliente. Los resultados son anteriores a IVA, ISR, comisiones de cobro y otros impuestos.

### Póliza opcional de soporte

La póliza de MXN 2,500 mensuales genera un ingreso anual de MXN 30,000. Si se utilizan las 2 horas mensuales incluidas y el costo interno es MXN 300 por hora, el costo anual de atención sería MXN 7,200 y la contribución adicional sería MXN 22,800.

En el modelo alojado por Ignite, conviene separar comercialmente el soporte funcional del alojamiento en AKS. La póliza debe indicar si incluye únicamente soporte de la aplicación o también monitoreo, respaldos y atención de incidentes de infraestructura.

## 9. Condiciones para una cotización definitiva

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

## 10. Vigencia y supuestos

- Tarifas de OpenAI consultadas el 22 de septiembre de 2026.
- Propuesta comercial sugerida con vigencia de 30 días.
- Importes comerciales expresados antes de IVA.
- Tipo de cambio de referencia: MXN 18.00 por USD.
- No se incluyen costos de catalogación humana, infraestructura de pago, almacenamiento persistente, dominio ni desarrollos especiales.
- La aplicación genera registros preliminares; no sustituye la revisión profesional del catalogador.
