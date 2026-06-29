I have a complete picture. Producing the analysis.

# Frente 5 — Primitives / design system: qué centralizar + mejoras al Button base

Stack verificado: Next.js 16 RSC + Server Actions, Tailwind v4, shadcn `radix-nova`. Server en `localhost:4000`. Todo lo de abajo está leído del código real, con `file:line`.

---

## Hallazgo transversal #1: hay **CUATRO** formas de hacer un botón en el admin (no tres)

| # | Forma | Origen | Dónde se usa | Estados |
|---|-------|--------|--------------|---------|
| A | `<Button>` shadcn | `components/ui/button.tsx` | 25 archivos importan; 58 `type="submit"` | hover/active/disabled/focus-visible ✅; **sin loading** |
| B | `<AdminButton>` | `components/admin-page.tsx:467` | 6 archivos | hover/disabled parcial; **sin focus-visible, sin loading, sin cursor explícito** |
| C | `<button>` crudo + clases inline | 18 archivos (38 ocurrencias) | toggles, submits de forms | ad-hoc por archivo, **sin spinner pending** |
| D | `<Link className="bg-gradient-brand …">` estilizado como botón primario | **17 archivos** | "Crear", "Guardar", CTAs de página | sin estados de botón, copy-paste de clases |
| E | `<SubmitButton>` (ya existe, `components/admin/submit-button.tsx`) | useFormStatus + spinner ✅ | **solo 1 archivo lo usa** | el mejor de todos, infrautilizado |

**El problema no es que falten primitives — es que ya existen 5 caminos y nadie convergió.** `SubmitButton` es excelente (spinner + disabled automático en pending) pero está en 1 de los ~60 sitios con submit. Mientras tanto, 58 botones `type="submit"` y 38 `<button>` crudos no dan ningún feedback de "guardando…", y con Server Actions el delay es real (red + revalidate). Para una editora no-técnica eso se siente como "no pasó nada" → doble-click → doble-submit.

---

## 1. Qué fixes deben vivir en los PRIMITIVES (no en cada página)

### 1.1 ✨ `cursor-pointer` — YA ESTÁ CENTRALIZADO ✅ (no re-proponer)
`globals.css:196-209` tiene una regla global dentro de `@layer base` que aplica `cursor: pointer` a `button:not(:disabled)`, `[role="button"]`, `label[for]`, `summary`, `select`, `a[href]`, y `not-allowed` a disabled. Está bien resuelto y comentado (Lucy 2026-06-27). **No hay que tocar esto.** Cualquier auditoría que pida "cursor-pointer en el Button base" ya está cubierta a nivel CSS global.

### 1.2 🐛 Feedback de "pending" en submits — centralizar vía `SubmitButton` (esfuerzo M)
**Este es el fix de primitive de mayor impacto.** Hoy 58 `Button type="submit"` + ~10 `<button type="submit">` crudos no muestran spinner ni se deshabilitan durante el Server Action. `SubmitButton` (`submit-button.tsx`) ya resuelve esto con `useFormStatus` pero solo lo usa `bulk-action-bar.tsx`.

- **Canónico:** todo botón final de un `<form action={serverAction}>` debe ser `<SubmitButton>`.
- **Convergencia gradual (sin refactor gigante):** migrar primero los forms de creación/edición de las páginas más usadas por Lucy (productos, variantes, categorías, cupones, ocasiones). Cada cambio es de 2-3 líneas (reemplazar `<Button type="submit">…</Button>` por `<SubmitButton label="…" pendingLabel="…" />`).
- **Detalle a corregir en el propio primitive:** `submit-button.tsx:32` solo expone `variant: "primary"|"secondary"|"danger"|"ghost"` y `size: "default"|"sm"|"lg"|"icon"` — falta soportar el caso "icono + label" con icono al final, y no expone `type` ni acepta `children` (algunos forms necesitan layout custom). Considerar una variante `<SubmitButton>` que acepte `children` opcional.

### 1.3 ✨ Un único primitive de botón canónico — converger A/B/D sobre el `<Button>` shadcn (esfuerzo M)
Hoy `AdminButton` (forma B) y los `<Link className="bg-gradient-brand">` (forma D, 17 archivos) **duplican** lo que el `<Button>` shadcn ya da gratis con `asChild`. El propio `submit-button.tsx:53-59` ya define el mapa de variantes brand (`primary`/`secondary`/`danger`/`ghost`) encima del Button shadcn — **ese mapa es el design system real**, pero vive escondido dentro de SubmitButton.

**Propuesta concreta:**
- Extraer ese `variantClasses` (primary/secondary/danger/ghost brand) a un solo lugar — idealmente como nuevas `variant` registradas en `buttonVariants` (`button.tsx:11-22`) llamadas `brand`, `brand-outline`, `brand-danger`, `brand-ghost`. Así `<Button variant="brand">`, `<Button variant="brand" asChild><Link …>` y `<SubmitButton>` comparten exactamente las mismas clases.
- `AdminButton` (`admin-page.tsx:467-509`) entonces pasa a ser un wrapper fino sobre `<Button>` (o se deprecia). Hoy `AdminButton` re-inventa los mismos 4 variants (`admin-page.tsx:488-495`) con clases casi idénticas pero **divergentes** (ver 1.4).
- Para los 17 `<Link bg-gradient-brand>`: reemplazar por `<Button asChild variant="brand"><Link href>…</Link></Button>`. Es find-replace mecánico, bajo riesgo.

### 1.4 🐛 `danger` divergente entre primitives (esfuerzo S)
- `AdminButton` danger = `bg-rose-600 text-white` (`admin-page.tsx:494`)
- `SubmitButton` danger = `bg-rose-600 text-white` (`submit-button.tsx:57`) — coinciden entre sí…
- …pero el `<Button variant="destructive">` shadcn = `bg-destructive/10 text-destructive` (`button.tsx:19`) — **fondo rojo claro con texto rojo**, visualmente opuesto.

Resultado: un "Eliminar" se ve sólido-rojo en un sitio y rojo-pastel en otro. **Decidir uno** (recomiendo el sólido `bg-rose-600` para que Lucy vea claramente que es destructivo) y unificarlo en la `variant` brand-danger del 1.3.

### 1.5 ✨ Confirmaciones — `ConfirmAction` usa `window.confirm` nativo (🤔 decisión)
`confirm-action.tsx:40` usa `window.confirm()`. Es accesible y nativo, pero: (a) no se puede estilizar al brand kawaii, (b) el mensaje sale en inglés del navegador en los botones OK/Cancel, (c) no diferencia visualmente acción destructiva de informativa. El propio comentario (`confirm-action.tsx:8-10`) reconoce que un AlertDialog shadcn daría mejor UX. **Decisión para Lucy:** mantener `window.confirm` (simple, cero deps) vs. agregar el AlertDialog de shadcn como primitive `<ConfirmDialog>` brand. Dado el mandato "simple y amigable", yo agregaría el AlertDialog **solo** para las acciones verdaderamente destructivas (eliminar/archivar) y dejaría confirm nativo para el resto. Esfuerzo M.

---

## 2. El `<Button>` de shadcn: variantes y estados — qué falta

Leído en `button.tsx`:
- **Variantes existentes:** `default`, `outline`, `secondary`, `ghost`, `destructive`, `link`. **No hay ninguna variante brand** — por eso todos inventan `bg-gradient-brand` por fuera.
- **Estados:** hover ✅, active ✅ (`active:not-aria-[haspopup]:translate-y-px`, `button.tsx:8`), disabled ✅ (`disabled:pointer-events-none disabled:opacity-50`), focus-visible ✅ (`focus-visible:ring-3`, sólido), aria-invalid ✅. **Buen primitive de base.**
- 🐛 **Falta prop `loading`.** No existe estado de carga en el Button base; cada quien lo resuelve (o no). Recomendación: agregar `loading?: boolean` que: renderice `<Loader2 className="animate-spin">`, fuerce `disabled`, y mantenga el ancho (evitar layout shift). Esto convierte a `SubmitButton` en un thin wrapper (`<Button loading={pending}>`), eliminando la duplicación del spinner que hoy vive en `submit-button.tsx:72-77`.
- ✨ **Agregar variantes `brand` / `brand-outline` / `brand-danger`** (ver 1.3) directamente en `buttonVariants` (`button.tsx:11`). Esa es la inyección de paleta Lucams que falta en el primitive shadcn y que obliga a las 4 formas paralelas.

**Resumen mejoras al Button base:** (1) prop `loading` con spinner + disabled + sin layout-shift; (2) variantes brand registradas en cva; (3) unificar `destructive` con el rojo sólido que ya usan AdminButton/SubmitButton.

---

## 3. Consistencia: mapa de las formas + ruta de convergencia

**Canónica recomendada:**
- **`<Button>` shadcn = la base única.** Se le añaden variantes brand + prop `loading` (sección 2).
- **`<SubmitButton>` = el botón final de cualquier `<form action>`** (envuelve `<Button loading={pending}>`).
- **`<Button asChild><Link>` = cualquier botón que navega** (reemplaza los 17 `bg-gradient-brand` y `AdminButton href=`).
- **`AdminButton` = deprecar** (o dejar como alias delgado de Button para no romper los 6 sitios de golpe).
- **`<button>` crudo = eliminar** salvo casos genuinamente especiales; los toggles de `quick-actions.tsx` deberían ser `<SubmitButton variant="secondary" size="sm">`.

**Cómo converger sin refactor gigante (orden por ROI):**
1. (S) Añadir variantes brand + prop `loading` a `button.tsx`. No rompe nada existente.
2. (S) Reescribir `SubmitButton` para usar `<Button loading={pending} variant="brand…">`. Centraliza el spinner.
3. (M) Migrar los ~60 submits a `SubmitButton`, empezando por productos/variantes/categorías. Da feedback de "guardando…" inmediato — **el fix más visible para Lucy.**
4. (M) Find-replace de los 17 `<Link bg-gradient-brand>` → `<Button asChild variant="brand">`.
5. (S) Unificar `danger`/`destructive`.
6. (S) Reducir `AdminButton` a alias de `Button`.

---

## 4. Accesibilidad rápida — lo más flagrante

- 🐛 **`AdminButton` no tiene `focus-visible`** (`admin-page.tsx:496`, `grep focus-visible` = 0 en el archivo). Solo tiene `transition-all`. Navegación por teclado no muestra anillo de foco en esos 6 sitios. El `<Button>` shadcn sí lo tiene (`focus-visible:ring-3`) — razón extra para converger AdminButton sobre Button. Esfuerzo S.
- 🐛 **Botones-ícono con solo `title=` y sin `aria-label`.** `quick-actions.tsx:30,50` (Pausar/Activar/Restaurar) usan `title` pero el texto visible salva el caso; el problema real está en botones **icon-only** (sin texto). Solo 20 `aria-label` para 38 `<button>` en admin → varios icon-only quedan sin nombre accesible. Auditar específicamente: `variant-images.tsx`, `product-images.tsx`, `bulk-action-bar.tsx`, flechas de reorden. `title` ≠ nombre accesible robusto (no lo leen todos los lectores). Esfuerzo S por sitio.
- ✨ **`SortableHeader` está bien** (`admin-page.tsx:262-280`): tiene `aria-sort` correcto y `title`. Buen ejemplo a seguir.
- 🐛 **Contraste de iconos inactivos:** `text-brand-purple-dark/25` en el icono de orden inactivo (`admin-page.tsx:276`) y `text-brand-purple/50` / `text-brand-purple-dark/55` en QuickLink/OpsCard (`admin-page.tsx:389,450,453`) probablemente **no pasan 4.5:1** sobre blanco. Para iconos decorativos (chevron de orden) es tolerable; para texto de descripción (`text-brand-purple-dark/55`, p.ej. `QuickLink` description línea 453) es texto real → subir opacidad a ≥`/70`. Esfuerzo S.
- ✨ **`input.tsx` / `textarea.tsx` están bien**: `focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3`, `aria-invalid` con ring destructive, `disabled` coherente. No requieren cambios. El único matiz: `text-base` en mobile → `md:text-sm` (`input.tsx:11`) es correcto (evita zoom iOS). Dejar como está.

---

## TL;DR — qué centralizar y dónde

| Acción | Archivo del primitive | Tipo | Esf. |
|--------|----------------------|------|------|
| Añadir prop `loading` (spinner + disabled, sin layout-shift) | `components/ui/button.tsx:44` | ✨ | S |
| Registrar variantes `brand`/`brand-outline`/`brand-danger`/`brand-ghost` en cva | `components/ui/button.tsx:11` | ✨ | S |
| Unificar `danger` (rose-600 sólido) entre shadcn/AdminButton/SubmitButton | `button.tsx:19` + `admin-page.tsx:494` | 🐛 | S |
| Reescribir `SubmitButton` sobre `<Button loading>` + permitir icono al final/children | `components/admin/submit-button.tsx` | ✨ | S |
| Propagar `SubmitButton` a los ~60 submits (feedback "guardando…") | páginas admin | 🐛 | M |
| Reemplazar 17 `<Link bg-gradient-brand>` por `<Button asChild variant="brand">` | 17 archivos | ✨ | M |
| `focus-visible` en AdminButton (o deprecarlo sobre Button) | `admin-page.tsx:496` | 🐛 | S |
| `aria-label` en botones icon-only | variant-images, product-images, reorder, bulk bars | 🐛 | S |
| Subir contraste de texto `/55` → `/70` (descripciones) | `admin-page.tsx:453` y similares | 🐛 | S |
| `<ConfirmDialog>` brand para acciones destructivas (vs window.confirm) | `confirm-action.tsx` | 🤔 | M |

**Ya resuelto, no re-proponer:** `cursor-pointer` global (`globals.css:196-209`), `reduced-motion` (`globals.css:286`), focus states de input/textarea, `aria-sort` en SortableHeader. La pieza clave que **ya existe pero está infrautilizada** es `SubmitButton` (1/60 usos) — la mayor parte del valor está en propagarlo y en darle al `<Button>` base las variantes brand + `loading` para que sea la única fuente de verdad.