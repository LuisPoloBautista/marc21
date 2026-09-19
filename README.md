# Generador de Registros MARC21

Asistente de catalogacion bibliografica que extrae metadatos de documentos (PDF, imagenes o texto) con la API de OpenAI y genera registros MARC21 listos para revisar y exportar como MARCXML.

## Arquitectura

```
Frontend HTML/CSS/JS
        |
        | fetch /api
        v
Backend Express
        |
        | OPENAI_API_KEY en variable de entorno
        v
OpenAI Responses API
        |
        v
Reglas MARC21 locales
```

El navegador nunca debe recibir la clave de OpenAI. El backend es quien llama a OpenAI y sirve tambien los archivos estaticos.

## Requisitos

- Node.js 18+
- Una API key de OpenAI configurada como variable de entorno `OPENAI_API_KEY`

## Configuracion local

```bash
npm install
export OPENAI_API_KEY="tu_clave_de_openai"
npm start
```

Abre `http://localhost:3000`.

Variables disponibles:

| Variable | Valor por defecto | Descripcion |
|---|---|---|
| `OPENAI_API_KEY` | requerido | Clave secreta de OpenAI. No la subas al repositorio. |
| `OPENAI_MODEL` | `gpt-5.5` | Modelo usado por defecto para OCR y estructuracion. |
| `OPENAI_OCR_MODEL` | `OPENAI_MODEL` | Modelo para imagenes/PDF renderizados. Debe soportar vision. |
| `OPENAI_STRUCTURING_MODEL` | `OPENAI_MODEL` | Modelo para extraer metadata JSON del texto. |
| `PORT` | `3000` | Puerto local o asignado por el host. |
| `ALLOWED_ORIGINS` | `*` | Origenes permitidos para CORS, separados por coma. |

## Despliegue gratuito recomendado: Render

Este repositorio incluye `render.yaml`.

1. Sube el proyecto a GitHub.
2. En Render, crea un nuevo **Blueprint** o **Web Service** desde el repositorio.
3. Define la variable secreta `OPENAI_API_KEY` en el panel de Render.
4. Mantén `OPENAI_MODEL=gpt-5.5` o cambia el modelo segun tu cuenta.
5. Deploy.

Render servira frontend y backend desde el mismo dominio, asi que no necesitas configurar GitHub Pages.

## GitHub Pages

GitHub Pages solo sirve archivos estaticos. No puede proteger `OPENAI_API_KEY`, por lo que no debe llamar directamente a OpenAI desde `script.js`.

Si quieres usar Pages, despliega primero el backend en Render u otro host gratuito y abre la pagina con:

```text
https://usuario.github.io/marc21-generator/?api=https://tu-backend.onrender.com
```

La URL del backend queda guardada en `localStorage` del navegador. Para restringir CORS, configura en el backend:

```bash
ALLOWED_ORIGINS="https://usuario.github.io"
```

## Flujo de uso

1. Selecciona el tipo: libro, capítulo, artículo, tesis o memorias.
2. Sube un PDF o hasta 10 imágenes en una sola zona. Puedes agregar texto complementario del mismo recurso.
3. El PDF se lee localmente: se seleccionan páginas relevantes y solo se aplica OCR donde no hay texto utilizable.
4. El modelo estructura evidencia breve; una segunda búsqueda dirigida intenta completar datos esenciales con páginas nuevas.
5. Revisa valores, fuentes, citas y propuestas automáticas. Edita y descarga MARCXML o importa al formulario de Koha.

La interfaz ya no solicita agencia ni idioma de catalogación. Se describe en español y se conserva el idioma observado del recurso. `CATALOGING_AGENCY` permite configurar en Render el código institucional de 040; si está vacío se omiten $a/$c.

Las materias automáticas no llevan `$2embnm` ni un código de tesauro inventado. Se identifican como propuestas en la revisión. El número técnico de páginas del PDF no sustituye la extensión bibliográfica.

Consulta [la política de catalogación](docs/skill_catalogacion_automatica_rda_llm.md), [el algoritmo](docs/extraction-instructions.md), [el contrato JSON](docs/master-prompt.md) y [los metadatos por material](docs/document-templates.md). No se envían estos documentos completos en cada llamada.

## Integracion con el editor de Koha

El archivo `docs/koha-staff-integration.js` contiene el script completo para la
preferencia `IntranetUserJS` de Koha. En la pagina `cataloguing/addbiblio.pl`
crea un boton flotante, abre esta aplicacion dentro de un modal y permite copiar
el registro generado directamente a los campos del framework MARC activo.

La integracion usa `window.postMessage` con validacion estricta del origen. Koha
no guarda automaticamente: el catalogador conserva la revision final y debe
pulsar el boton Guardar de Koha. Si el framework no contiene una etiqueta o
subcampo generado, la integracion lo omite y muestra un resumen.

## Componentes

| Componente | Archivo | Funcion |
|---|---|---|
| OCR Agent | `src/agents/ocr-agent.js` | Extrae texto visible desde imagenes con un modelo OpenAI con vision. |
| Structuring Agent | `src/agents/structuring-agent.js` | Convierte texto bibliografico en metadata JSON. |
| OpenAI Client | `src/core/openai-client.js` | Llama a la Responses API sin exponer secretos al frontend. |
| Prompt Builder | `src/core/prompt-builder.js` | Construye prompts con reglas de catalogacion. |
| LLM Parser | `src/core/llm-parser.js` | Parsea y limpia la respuesta del modelo. |
| MARC Builder | `src/core/marc-builder.js` | Genera los campos MARC21. |

## Seguridad

- Revoca cualquier API key que hayas pegado en chats, issues, commits o capturas.
- Usa variables de entorno del proveedor de hosting.
- No agregues `.env` al repositorio.
- Si publicas el frontend en GitHub Pages, usa un backend separado para firmar las llamadas a OpenAI.

## Notas

- La calidad del OCR depende de la nitidez de las imagenes y del modelo configurado.
- La herramienta genera un registro preliminar. Un catalogador debe revisar puntos de acceso, materias, clasificaciones y descripcion fisica antes de importarlo a un ILS.

Las reglas de copyright como año alternativo, resumen literal o generado (máximo 100 palabras) y Dewey propuesto se definen en [la política de catalogación](docs/skill_catalogacion_automatica_rda_llm.md). Las etiquetas de revisión se generan en código.
