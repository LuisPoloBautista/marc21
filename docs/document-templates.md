# Plantillas por tipo documental

Cada tipo documental activa reglas específicas en `buildPrompt()`, `cleanLlmOutput()` y `buildMarcRecord()`. Esta guía describe qué metadatos espera cada tipo y cómo se transforman a MARC21.

---

## book (Libro / Monografía impresa)

**Cuándo usar**: Obra completa en uno o más volúmenes, con ISBN propio.

| Campo LLM | Obligatorio | Uso en MARC |
|-----------|-------------|-------------|
| `title` | sí | 245 $a ($b si tiene subtítulo tras `:`) |
| `author` | recomendado | 100 $a (1er autor), 700 $a (coautores) |
| `authorRoles` | si hay autor | roles: `autor`, `coordinador`, `compilador`, `editor`, `traductor`, etc. |
| `publisher` | sí | 264 $b |
| `place` | sí | 264 $a |
| `year` | sí | 264 $c, 008/06-14 |
| `pages` | sí | 300 $a (se sobreescribe con `pageCount` del PDF si existe) |
| `isbn` | recomendado | 020 $a |
| `edition` | si aplica | 250 $a |
| `subjects` | recomendado | 650 con $2embnm si catLang='spa' |
| `language` | sí | 008/35-37, 041 |
| `series` | si aplica | 490 $a |
| `notes` | opcional | 520 $a |
| `corporate` | si aplica | 710 $a$b$e `editor.` |
| `doi` | opcional | 024 $2doi |

**Campos que NO usa**: `hostTitle`, `volume`, `issue`, `degree`, `institution`, `advisor`, `meetingName`, `meetingDate`, `meetingPlace`, `issn`.

**Reglas especiales**:
- 264 ind2=`1` (publicación)
- 300 usa `páginas` (catLang='spa') o `p.` (catLang='eng')
- 33X presente si RDA
- El `pageCount` del PDF sobreescribe al `pages` del LLM

---

## article (Artículo de revista / publicación seriada)

**Cuándo usar**: Contribución dentro de una revista, journal o serial. NO tiene ISBN propio (tiene ISSN).

| Campo LLM | Obligatorio | Uso en MARC |
|-----------|-------------|-------------|
| `title` | sí | 245 $a (sin números de página al inicio) |
| `author` | recomendado | 100 $a / 700 $a |
| `authorRoles` | si hay autor | normalmente `autor` |
| `hostTitle` | sí | 773 $t (título de la revista) |
| `volume` | recomendado | 773 $g (o 773 $h) |
| `issue` | recomendado | 773 $g |
| `pages` | sí | 300 $a (rango: "páginas 45-60"), 773 $g |
| `issn` | recomendado | 022 $a, 773 $x |
| `publisher` | recomendado | 773 $d |
| `place` | recomendado | 773 $d |
| `year` | sí | 773 $d, 008/06-14 |
| `subjects` | recomendado | 650 |
| `language` | sí | 008/35-37, 041 |
| `doi` | opcional | 024 $2doi |
| `notes` | opcional | 520 $a |

**Campos que NO usa**: `isbn`, `edition`, `series`, `corporate`, `degree`, `institution`, `advisor`, `meetingName`, `meetingDate`, `meetingPlace`.

**Reglas especiales**:
- LDR/07=`a` (component part)
- NO lleva 020, NO lleva 250, NO lleva 264, NO lleva 33X
- 300 muestra rango de páginas ("páginas 45-60"), no total del serial
- 773 con `$7nnas`, contiene hostTitle, publisher, place, year, issn, pages
- NO se genera 710 corporativo (el corporativo va dentro del 773 si aplica)
- Título se limpia de números de página iniciales ("119 Análisis..." → "Análisis...")

---

## chapter (Capítulo de libro)

**Cuándo usar**: Capítulo dentro de un libro editado (con ISBN propio y editor(es) del volumen).

| Campo LLM | Obligatorio | Uso en MARC |
|-----------|-------------|-------------|
| `title` | sí | 245 $a (título del capítulo) |
| `author` | sí | 100 $a / 700 $a (autor del capítulo) |
| `authorRoles` | si hay autor | normalmente `autor` |
| `hostTitle` | sí | 773 $t (título del libro contenedor) |
| `publisher` | recomendado | 773 $d |
| `place` | recomendado | 773 $d |
| `year` | sí | 773 $d, 008/06-14 |
| `pages` | sí | 300 $a (rango: "páginas 115-130"), 773 $g |
| `isbn` | recomendado | 773 $z (ISBN del libro contenedor) |
| `edition` | si aplica | 773 $b (edición del libro contenedor) |
| `subjects` | recomendado | 650 |
| `language` | sí | 008/35-37, 041 |
| `notes` | opcional | 520 $a |
| `corporate` | si aplica | dentro de 773 $d |

**Campos que NO usa**: `series`, `volume`, `issue`, `degree`, `institution`, `advisor`, `meetingName`, `meetingDate`, `meetingPlace`, `issn`.

**Reglas especiales**:
- LDR/07=`a` (component part)
- NO lleva 250 ni 264 en el cuerpo principal — van dentro del 773
- NO lleva 33X
- 300 muestra rango: "páginas 115-130"
- 773 con `$7nnas`, $t (hostTitle), $b (edición), $d (lugar : editorial, año), $g (páginas), $z (ISBN)
- NO se genera 710 corporativo (va dentro del 773)

---

## thesis (Tesis / Trabajo de grado)

**Cuándo usar**: Tesis de licenciatura, maestría o doctorado. NO publicada comercialmente.

| Campo LLM | Obligatorio | Uso en MARC |
|-----------|-------------|-------------|
| `title` | sí | 245 $a (limpio de prefijos "TESIS QUE PARA...") |
| `author` | sí | 100 $a$e `autor.` |
| `authorRoles` | si hay autor | siempre `autor` |
| `degree` | sí | 502 $b (nombre del programa/grado) |
| `institution` | sí | 502 $c, 264 $b, 710 $a$b$e `organismo otorgante.` |
| `year` | sí | 502 $d, 264 $c, 008/06-14 |
| `advisor` | si aplica | 700 $a$e `asesor academico.` (sin Dr./Mtro. en el nombre) |
| `place` | recomendado | 264 $a |
| `pages` | sí | 300 $a (se sobreescribe con `pageCount` del PDF) |
| `subjects` | recomendado | 650 |
| `language` | sí | 008/35-37, 041 |
| `notes` | opcional | 520 $a |
| `corporate` | recomendado | 710 $a$b$e `organismo otorgante.` (jerárquico) |
| `doi` | opcional | 024 $2doi |

**Campos que NO usa**: `publisher` (usa `institution`), `isbn`, `edition`, `series`, `hostTitle`, `volume`, `issue`, `meetingName`, `meetingDate`, `meetingPlace`, `issn`.

**Reglas especiales**:
- 100 $e=`autor.` (nunca `coordinador.` u otro rol)
- 502 con $b (degree), $c (institution), $d (year)
- 264 ind2=`0` (producción)
- 710 jerárquico: detecta split por punto para jurisdicción ("México. Instituto...")
- Asesores separados en distintos 700, sin títulos (Dr., etc.), con $e `asesor academico.`
- NO tiene 250 (edición)
- Título se limpia automáticamente de prefijos como "TESIS QUE PARA OBTENER EL GRADO DE..."

---

## proceedings (Memorias de congreso / Conference proceedings)

**Cuándo usar**: Actas, memorias, proceedings de un congreso, conferencia, simposio o reunión académica.

| Campo LLM | Obligatorio | Uso en MARC |
|-----------|-------------|-------------|
| `title` | sí | 245 $a |
| `author` | recomendado | 700 $a (editores/compiladores, rol `editor`) |
| `authorRoles` | si hay autor | `editor` (por defecto) |
| `meetingName` | sí | 111 $a, 711 $a |
| `meetingDate` | sí | 111 $d |
| `meetingPlace` | recomendado | 111 $c |
| `publisher` | sí | 264 $b |
| `place` | sí | 264 $a |
| `year` | sí | 264 $c, 008/06-14 |
| `pages` | sí | 300 $a (se sobreescribe con `pageCount` del PDF) |
| `isbn` | recomendado | 020 $a |
| `subjects` | recomendado | 650 |
| `language` | sí | 008/35-37, 041 |
| `notes` | opcional | 520 $a |
| `edition` | si aplica | 250 $a |
| `series` | si aplica | 490 $a |
| `corporate` | si aplica | 710 $a$b$e `editor.` |
| `doi` | opcional | 024 $2doi |

**Campos que NO usa**: `hostTitle`, `volume`, `issue`, `degree`, `institution`, `advisor`, `issn`.

**Reglas especiales**:
- Los autores se mapean a 700 con rol `editor` (no a 100)
- 111 $a (meetingName) $d (meetingDate) $c (meetingPlace)
- 264 ind2=`1` (publicación)
- NO tiene `meetingName` en `proceedings` → no genera 111
- `author` son los editores del volumen

---

## Resumen de diferencias entre tipos

| Característica | book | article | chapter | thesis | proceedings |
|---------------|------|---------|---------|--------|-------------|
| LDR/07 | m | a | a | m | m |
| 020 (ISBN) | sí | no | no | no | sí |
| 022 (ISSN) | no | sí | no | no | no |
| 100/700 1er autor | 100 | 100 | 100 | 100 | 700 (editores) |
| 111 | no | no | no | no | sí |
| 250 (edición) | sí | no | no | no | sí |
| 264/260 | 264 | no | no | 264 ind2=0 | 264 |
| 300 (páginas) | total | rango | rango | total | total |
| 33X | sí | no | no | sí | sí |
| 502 (tesis) | no | no | no | sí | no |
| 710 corporativo | sí | no | no | sí (jerárquico) | sí |
| 773 (contenedor) | no | sí | sí | no | no |
| hostTitle | - | obligatorio | obligatorio | - | - |
| pageCount sobreescribe pages | sí | no | no | sí | sí |
