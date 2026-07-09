# Instrucciones de extracción de metadatos

Documento de referencia para el prompt del modelo y para entender cómo el código procesa y corrige la salida del LLM.

---

## 1. Principios generales

Estas instrucciones adaptan las reglas ISBD/RDA de catalogación profesional al pipeline existente: `buildPrompt()` → LLM → `parseLLMResponse()` → `validateMetadata()` → `cleanLlmOutput()` → `buildMarcRecord()`.

**El LLM solo extrae datos atómicos. El código construye el registro MARC.** El prompt no debe intentar hacer catalogación ni estructurar ISBD — eso lo hace `buildMarcRecord()` programáticamente.

---

## 2. Estructura del prompt actual

El prompt en `buildPrompt()` ya define:
- Persona: "catalogador bibliográfico experto"
- JSON de salida con campos específicos
- Reglas por tipo documental (tesis: no "coordinador"; proceedings: autores son "editor")
- Instrucciones de imágenes si se proporcionan
- Temperatura: 0.05, top_p: 0.8

---

## 3. Adaptación de las reglas ISBD al pipeline existente

### 3.1 Jerarquía de fuentes (se mantiene en el prompt)

Usar este orden de precedencia, adaptado a las zonas del texto extraído del PDF e imágenes:

| Prioridad | Fuente | Datos que aporta |
|-----------|--------|-----------------|
| 1 | Portada (imagen slot) | Título, autor(es), editorial |
| 2 | Página legal / verso de portada (imagen slot) | ISBN, año, edición, copyright |
| 3 | Última página / colofón (imagen slot) | Páginas, colofón, depósito legal |
| 4 | Texto extraído del PDF (OCR) | Todo lo anterior, más resumen, materias |
| 5 | Descripción del usuario | Complemento |

**Conflicto portada vs. texto OCR**: manda la imagen de portada.
**Conflicto página legal vs. texto OCR**: manda la imagen de página legal.

### 3.2 Reglas críticas de extracción (SE MANTIENEN en el prompt)

Estas reglas mejoran la calidad de la extracción y deben permanecer:

1. **Título vs. título original**: Si aparece "Título original:" o "Originally published as:", ese NO es el título de esta edición. El título de esta edición es el que aparece como título principal.

2. **Edición vs. responsabilidad**: "(ed.)", "(eds.)", "edición de", "coord.", "dir." indican responsabilidad secundaria (245 $c), NO son mención de edición (250).

3. **Responsabilidad secundaria**: Un nombre junto a "traducción", "versión", "prólogo", "notas", "introducción", "ilustraciones" o "selección de" es responsable secundario, no autor principal (a menos que también conste como autor de la obra).

4. **Idioma original vs. de la edición**: "Traducido del italiano" → el idioma original es italiano, pero el idioma de ESTA edición es el de la traducción (normalmente español). No confundir.

5. **Reimpresión no es edición**: "Reimpresión", "reprint", "2ª reimpresión" NO es una nueva edición. No se pone en 250.

6. **No inventar**: No inventes ISBN, fechas, lugares, editoriales ni datos que no observes directamente.

7. **Ilustrador de cubierta**: No se incluye como nota ni como responsable.

8. **"Anónimo"**: Puede figurar como mención de responsabilidad si así aparece en portada.

### 3.3 Elementos del prompt original que NO se incluyen (los maneja el código)

| Elemento | Motivo de exclusión |
|----------|-------------------|
| Áreas ISBD (0-8) | `buildMarcRecord()` construye los campos MARC en el orden correcto |
| Puntuación ISBD (` : `, ` / `, ` , `) | El código aplica la puntuación programáticamente |
| Bloques ISBD ensamblados | El código ensambla el registro completo |
| Confianza (alta/media/baja) | No se usa en el pipeline; el código no consume este campo |
| Evidencia textual | No se consume; el frontend tiene su propio `findSourceSnippets()` |
| Zona de extracción (página) | No se consume; el frontend no lo muestra |
| Campo 3 | No aplica a monografías (pero el tipo documental lo controla el frontend) |

### 3.4 Información que el prompt DEBE incluir según el tipo documental

Cada tipo documental activa campos JSON diferentes en el prompt. El prompt actual ya tiene todos los campos en el esquema JSON; el LLM debe decidir cuáles llenar según el tipo:

| Tipo | Campos obligatorios | Campos opcionales |
|------|--------------------|--------------------|
| book | title, publisher, place, year, pages, language | author, authorRoles, isbn, edition, subjects, series, notes, corporate, doi |
| article | title, hostTitle, pages, year, language | author, authorRoles, volume, issue, issn, publisher, place, subjects, doi, notes |
| chapter | title, author, hostTitle, pages, year, language | authorRoles, publisher, place, isbn, edition, subjects, notes, corporate, doi |
| thesis | title, author, degree, institution, year, language | advisor, place, pages, subjects, notes, corporate, doi |
| proceedings | title, meetingName, meetingDate, publisher, place, year, language | author, authorRoles, meetingPlace, pages, isbn, subjects, notes, edition, series, corporate, doi |

---

## 4. Reglas post-extracción (las aplica `cleanLlmOutput()`)

El LLM no necesita preocuparse por estos campos porque el código los corrige automáticamente:

| Campo | Cómo lo corrige el código |
|-------|--------------------------|
| `isbn` | Regex sobre texto crudo. ISBN-13 (978/979) o ISBN-10. Sobrescribe al LLM. |
| `issn` | Regex `\d{4}-\d{3}[\dX]` sobre texto crudo. Solo para artículos. |
| `year` | Primer año 19xx/20xx en texto crudo. Sobrescribe al LLM. |
| `pages` | Para monografías: `pageCount` del PDF (más preciso). Para analíticos: regex desde texto. |
| `edition` | Regex `\d+\s*ed` desde texto crudo. Sobrescribe al LLM. |
| `title` | Limpieza de prefijos institucionales ("TESIS QUE PARA OBTENER...") y números de página iniciales ("119 Análisis...") |
| `author` | Eliminación de títulos académicos (Dr., Dra., Mtro., Mtra., Lic., Ing., PhD, etc.) |

---

## 5. Roles de autor válidos

El LLM solo debe usar estos roles en `authorRoles`. Cualquier otro rol será ignorado:

```
autor, coordinador, compilador, editor, traductor, prologuista, ilustrador, asesor
```

Reglas por tipo:
- **book**: `autor` (default), `coordinador`, `compilador`, `editor`, `traductor`, `prologuista`, `ilustrador`
- **article**: `autor` (default)
- **chapter**: `autor` (default)
- **thesis**: `autor` (default). **Nunca `coordinador`**.
- **proceedings**: `editor` (default)

---

## 6. Formato de subjects

Los subjects usan `--` para jerarquía. El código detecta automáticamente:
- **Lugares** → subcampo $z
- **Siglos** → subcampo $y  
- **Otros** → subcampo $x

Convenciones:

```
Botánica--México--Historia--Siglo XIX
  → 650 $aBotánica $zMéxico $xHistoria $ySiglo XIX $2embnm

Ciencia--Historia
  → 650 $aCiencia $xHistoria $2embnm
```

**Importante**: Si el primer elemento de la jerarquía es un lugar (ej. "México--Historia de la ciencia"), el código lo mueve automáticamente a $z y promueve el segundo elemento a $a.

---

## 7. Conflictos y decisiones entre el prompt ISBD original y el código

### Conflicto 1: Puntuación ISBD

| En ISBD original | En el código actual |
|-----------------|-------------------|
| El prompt debe incluir puntuación ISBD | La puntuación la aplica `buildMarcRecord()`. El prompt no debe incluirla. |

**Decisión**: El prompt NO incluye reglas de puntuación ISBD. Si el LLM incluye puntuación ISBD en los valores (ej. "México :" en `place`), el código podría duplicar o malformar la puntuación. El LLM debe devolver datos limpios.

### Conflicto 2: Roles por defecto

| En ISBD original | En el código actual |
|-----------------|-------------------|
| No especifica roles | El código asigna `autor` por defecto en 100 $e, o `editor` para proceedings |

**Decisión**: El prompt indica `authorRoles` con los roles válidos. Si el LLM no proporciona rol, el código asigna el default según el tipo. El usuario pidió explícitamente **no corregir roles** — el LLM debe proporcionarlos.

### Conflicto 3: Páginas (300)

| En ISBD original | En el código actual |
|-----------------|-------------------|
| "145 p." con abreviatura | El código usa "páginas" (catLang='spa') o "p." (catLang='eng') y añade la unidad |

**Decisión**: El LLM devuelve solo el número (ej. "300"), no la unidad. El código añade "páginas" o "p." según el idioma. El LLM puede devolver "300 p." o "300" — `cleanLlmOutput` normaliza a número.

### Conflicto 4: Materias sin normalizar

| En ISBD original | En el código actual |
|-----------------|-------------------|
| "No crees puntos de acceso autorizados ni materias normalizadas" | El código espera subjects con `--` y aplica $2embnm |

**Decisión**: El LLM produce materias en lenguaje natural con `--` para jerarquía. El código las estructura en subcampos MARC y añade $2embnm.

### Conflicto 5: Título con vs sin números de página

| En ISBD original | En el código actual |
|-----------------|-------------------|
| No menciona limpieza de números | `cleanLlmOutput()` elimina números 3-4 dígitos al inicio si van seguidos de minúscula |

**Decisión**: El LLM puede incluir números de página en el título si aparecen en el texto. El código los limpia automáticamente. El LLM debería evitarlos.

### Conflicto 6: Responsabilidad secundaria vs. autor principal

| En ISBD original | En el código actual |
|-----------------|-------------------|
| Traductor/ilustrador/prólogo → responsable secundario | `authorRoles` puede asignar `traductor` etc., pero el código solo usa 100/700 para `author` |

**Decisión**: El prompt ya indica qué autores poner en `author`. Los responsables secundarios (traductores, etc.) pueden incluirse en `authorRoles` pero no deberían estar en `author` a menos que también sean autores de la obra.

---

## 8. Flujo completo de datos

```
Texto/Imágenes
    │
    ▼
buildPrompt(texto, catLang, imágenes)
    │  ← Se inyecta el texto extraído del PDF y la info de imágenes
    │  ← Se define el JSON schema esperado
    ▼
LLM (Gemma 4 e4b, temp=0.05)
    │
    ▼
parseLLMResponse(raw) → metadata JSON
    │  ← Extrae el JSON de la respuesta, limpia markdown
    ▼
validateMetadata(metadata)
    │  ← Normaliza arrays (author, subjects)
    ▼
cleanLlmOutput(metadata, rawText, {pageCount, formatType})
    │  ← Sobrescribe ISBN, año, páginas, edición con regex
    │  ← Limpia título (prefijos, números)
    │  ← Limpia autores (títulos académicos)
    │  ← Extrae ISSN
    ▼
buildMarcRecord(metadata, opts)
    │  ← Construye campos MARC con puntuación ISBD
    │  ← Aplica reglas por tipo documental
    ▼
Registro MARC21 XML
```
