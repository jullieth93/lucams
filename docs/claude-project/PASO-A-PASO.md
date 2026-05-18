# Paso a paso — Configurar Claude Project "Lucams SVG Designer"

> Instrucciones para Lucy. Lleva ~10 minutos.

## Pre-requisito

- Cuenta en **Claude.ai** con plan **Pro** ($20/mes) o **Team**.
- Si no tienes: https://claude.ai/upgrade → suscribite a Pro.
- (El plan Free no permite crear Projects.)

---

## Paso 1: Crear el Project

1. Abrí https://claude.ai en tu navegador.
2. En la sidebar izquierda, haz click en **"Projects"** (ícono de carpeta).
3. Click en **"+ New project"** (esquina superior derecha).
4. Completá:
   - **Name**: `Lucams SVG Designer`
   - **Description**: `Genera SVGs marco editables para el editor de personalización de Lucams_shop. Tienda colombiana de imanes fotográficos.`
   - **Privacy**: Privado (default).
5. Click **"Create project"**.

---

## Paso 2: Configurar Custom Instructions

1. Dentro del Project recién creado, haz click en **"Set custom instructions"** (botón en la parte superior, abajo del nombre del Project).
2. Abrí el archivo [00-system-prompt.md](00-system-prompt.md) de este repo.
3. **Copiá TODO el contenido** del archivo (desde `Eres un diseñador SVG...` hasta el final).
4. Pegalo en el campo de Custom Instructions de Claude.
5. Click **"Save instructions"**.

---

## Paso 3: Subir los Knowledge files

Claude Projects acepta hasta 200K tokens de "Project Knowledge" — archivos persistentes que el modelo lee en cada conversación dentro del Project.

1. Dentro del Project, buscá la sección **"Project Knowledge"** (lado derecho de la pantalla).
2. Click en **"+ Add content"** o **"Upload from device"**.
3. Sube los 4 archivos siguientes (en este orden):
   - `paleta-brand.md`
   - `plantillas-existentes.md`
   - `coords-convencion.md`
   - `anti-ejemplos.md`
4. Verificá que aparezcan listados en "Project Knowledge" con un check verde.

**Cómo descargar los archivos**: están en este repo en `docs/claude-project/`. Las 3 opciones:

| Método                    | Cómo                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Download desde GitHub** | https://github.com/jullieth93/lucams/tree/develop/docs/claude-project → click en cada archivo → "Raw" → guardar como `.md` |
| **Git local**             | `cd /ruta/al/repo && cat docs/claude-project/paleta-brand.md` y copiá a un archivo .md                                     |
| **Copy-paste directo**    | Abrí cada archivo en VS Code / editor → copiá el contenido → pegalo en Claude como mensaje + "guardar como knowledge file" |

---

## Paso 4: Verificar que funciona

Dentro del Project, escribe este mensaje de prueba:

> "Hola. Antes de empezar, decime: ¿qué plantillas ya existen en el catálogo Lucams y cuál es el color `#D4AF37`?"

Claude debería responder:

- Listar las 11 plantillas activas (de `plantillas-existentes.md`)
- Identificar `#D4AF37` como **gold** de la paleta (de `paleta-brand.md`)

Si no responde con esa info, los knowledge files no se cargaron correctamente — repetí el Paso 3.

---

## Paso 5: Usarlo para generar una plantilla

Ejemplo de cómo pedir una plantilla nueva:

```
Nueva plantilla "Día del Padre".

▸ Concepto: Marco polaroid kawaii con elementos masculinos suaves
  (relojes, gorra, lentes, corbata mini) en las esquinas + accent
  lines turquesa + ribbon coral abajo. Caption "Te amo papá" como
  zona reservada.

▸ Imagen referencia: SÍ [pegá una imagen Pinterest/Instagram acá]

▸ Dimensiones físicas: 7×9 cm vertical

▸ Stage SVG: 720×920

▸ Agujero foto: x=60 y=60 width=600 height=620 cornerRadius=8

▸ Zonas reservadas:
  - caption inferior: x=60 y=720 width=600 height=80

▸ Decoraciones específicas:
  - 4 iconos masculinos mini en las esquinas (purple + turquoise)
  - ribbon coral horizontal en y=840-880
  - 5 estrellitas yellow scattered fuera de la zona caption

▸ Paleta: usar solo brand listado en paleta-brand.md.
```

Claude devolverá el SVG en un bloque `svg`. Copialo, pegámelo a mí y yo:

- Lo valido contra los criterios técnicos
- Si pasa, lo agrego a `apps/web/public/templates/<slug>.svg`
- Lo agrego al seed con sus coords correspondientes
- Lo deployamos

---

## Tips para mejores resultados

### Con imagen referencia

- Adjuntá imágenes de **estilo** (Pinterest, Instagram, Etsy), no fotos personales
- La IA replicará el ESTILO en formato editable, no copiará 1:1
- Si la imagen referencia tiene texto, la IA NO lo va a embeber (eso es overlay)

### Cuando la IA falla

Si el SVG tiene problemas, mostrale el error puntual:

> "Tu SVG anterior tenía 600 paths — es demasiado, los necesito en menos de 50. Rehacelo usando solo primitivas (rect, circle, path corto). No vectorices nada."

> "El SVG queda invisible sobre fondo blanco porque solo tiene marco blanco. Agrega decoraciones con color brand visible (corners gold, ribbon coral, etc.)."

### Para nuevas plantillas que NO se parezcan a las existentes

Pegá referencia + agrega:

> "Esta plantilla debe ser distinta a las que ya existen en el catálogo (ver plantillas-existentes.md). Si mi briefing se parece a alguna existente, proponeme un ángulo distinto (otra paleta / otra orientación / otro nivel decorativo)."

---

## Compartir el Project con otras personas

Si en algún momento contratás un diseñador kawaii o ChatGPT-power-user:

1. Dentro del Project → click **"Share"** (esquina superior derecha)
2. Activá **"Share with workspace"** (requiere plan Team)
3. Para invitar gente externa: necesitas Team plan ($30/usuario/mes)

Para uso solo tuyo, Pro alcanza.

---

## Costo total

- **Claude Pro**: $20 USD/mes
- **Archivos**: 0 (los tienes en tu repo)
- **Iteraciones por plantilla**: 1-3 mensajes (incluidos en plan Pro, sin límite real para uso normal)

**Total**: $20/mes para generar plantillas ilimitadas con calidad consistente.

---

## Cuando deba actualizar los Knowledge files

Si agregás plantillas nuevas al catálogo, hay que actualizar `plantillas-existentes.md` para que la IA sepa qué NO duplicar.

Avisame cuando agreguemos plantillas nuevas y yo regenero ese archivo. Lo subís de nuevo al Project Knowledge (reemplaza la versión vieja).

---

## Resumen visual

```
┌─────────────────────────────────────────────────────────┐
│  Claude.ai  →  Projects  →  + New Project              │
│                                                         │
│  Name: "Lucams SVG Designer"                           │
│  Custom Instructions: [00-system-prompt.md completo]   │
│  Project Knowledge:                                     │
│    📄 paleta-brand.md                                   │
│    📄 plantillas-existentes.md                          │
│    📄 coords-convencion.md                              │
│    📄 anti-ejemplos.md                                  │
│                                                         │
│  USO:                                                   │
│    Pegá imagen ref + briefing  →  Recibí SVG          │
│    Copiá SVG y pásamelo a mí para integrar al editor  │
└─────────────────────────────────────────────────────────┘
```
