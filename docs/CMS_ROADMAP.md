# ROADMAP — Ecosistema CMS completo (CMS v2 → CMS total)

**Estado:** en ejecución · Base construida: CMS v2 (HANDOFF.md 2026-07-30)
**Propósito:** que el 100% del contenido visible del sitio sea administrable por una persona NO técnica desde `/admin/contenido`, con modularidad a futuro (listas, imágenes, banners, roles, preview) sin rehacer el modelo.

**Progreso (se actualiza con cada fase):**

- ✅ **C2** rol CMS_EDITOR — commit `06a8384`
- ✅ **B4** campos de lista sin JSON (CmsListItem) — commit `05fac56`
- ✅ **B2** páginas transaccionales (94 campos) — commit `0e9b52b`
- ✅ **B3** iconos/gradientes de categoría en `Category` — commit `73bbbfc`
- ✅ **B1** copy del /estudio (363 campos) — commit `ce90423`
- ✅ **B5** campos de imagen (type IMAGE) + mediateca — commit `e8d4dad`
- ✅ **B6** banners/promos administrables en home — commit `b7ed459`
- ✅ **C1** preview en vivo junto al editor — commit `87bda56`
- ✅ **C3** publicación programada — commit `14481a7`
- ✅ **C4** utilidades del admin de contenido — commit `6c04bde`
- ✅ **D1** auditoría de cobertura de contenido — commit `4a6d242`
- ✅ **D3** documentación estructural — commit `c7ca6d5`
- ✅ **E1** auditoría móvil del admin — commit `39f7e77`
- ✅ **E2** fixes móviles admin — commit `82b0248`
- ⏳ E3 — pendiente · ⏸️ A1/A2/A3, D4 — bloqueadas (requieren producción/cuenta Supabase externa)

**Base sobre la que se parte (ya en producción, commit `bd1e427`):**

- Modelo `CmsPage → CmsSection → CmsField → CmsFieldVersion` (17 páginas, 33 secciones, 176 campos).
- Admin por páginas con edición inline, editor Markdown/JSON, historial de versiones con revert.
- Capa de lectura compatible (`lib/cms.ts`) con cache tag `cms` e invalidación desde el admin.
- Site map declarativo (`packages/db/scripts/cms-site-map.mjs`) + migrador idempotente (`make migrate-cms-v2`) + verificador de paridad.
- Tablas legacy `CmsBlock`/`CmsBlockVersion`/`SiteSetting` vivas como respaldo (DEPRECATED).

**Convenciones de este documento:** cada tarea indica los cambios de DB/migración que implica (o "sin migración"), archivos clave, dependencias y verificación. Estimaciones: **S** < medio día · **M** 1-2 días · **L** 3-5 días (trabajo asistido por agente como el de CMS v2).

---

## Modelo de datos objetivo (visión final)

```
CmsPage ─┬─ CmsSection ─┬─ CmsField ───── CmsFieldVersion (append-only, + publishAt en C3)
         │              │
         │              ├─ CmsListItem (B4: items de campos lista; position + subcampos JSON tipados)
         │              │
         │              └─ (fields type IMAGE apuntan a) ── CmsMedia (B5: asset en Storage + metadata)
         │
         └─ orden/título editables desde admin (C4)

AdminUser.role + CMS_EDITOR (C2: edita contenido, nada más)
Tablas legacy (CmsBlock/CmsBlockVersion/SiteSetting): DROP en A2
```

### Migraciones previstas (en orden de aplicación)

| #   | Nombre                                                | Fase     | Contenido                                                                                                                  |
| --- | ----------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| 0   | `20260730120000_add_cms_v2`                           | ✅ hecha | Modelo base + RLS                                                                                                          |
| 1   | `drop_cms_legacy`                                     | A2       | Drop `CmsBlock`, `CmsBlockVersion`, `SiteSetting` + enums `BlockFormat`, `BlockCategory`, `SettingType`, `SettingCategory` |
| 2   | `add_cms_list_items`                                  | B4       | Tabla `CmsListItem` + índice por `(fieldId, position)` + RLS                                                               |
| 3   | `alter_cms_field_type_add_image` + bucket `cms-media` | B5       | `ALTER TYPE "CmsFieldType" ADD VALUE 'IMAGE'` + tabla `CmsMedia` + bucket Storage + policies + RLS                         |
| 4   | `add_admin_role_cms_editor`                           | C2       | `ALTER TYPE "AdminRole" ADD VALUE 'CMS_EDITOR'` + matriz RBAC                                                              |
| 5   | `add_cms_publish_at`                                  | C3       | `CmsFieldVersion.publishAt TIMESTAMP` + índice parcial + job pg_cron                                                       |

---

## FASE A — Consolidación (sin deuda detrás)

> Objetivo: cerrar el ciclo de CMS v2 sin cabos sueltos. Todo es S.

### A1 — Verificación en producción

- Smoke manual: editar un texto de Inicio desde `/admin/contenido` → publicar → ver en `/`.
- Invalidar caché CMS (botón del índice) si no se hizo tras el deploy.
- Verificar emails transaccionales (usan `email.*` y settings) y /legal/*.
- Sin migración. **Verificación:** checklist firmado en HANDOFF.

### A2 — Drop de tablas legacy

- Pre-requisito: A1 OK + ≥3 días de producción estable.
- Migración `drop_cms_legacy` (drop tables + enums legacy).
- Borrar `packages/db/scripts/seed-cms.mjs`, `seed-cms-ruta-a.mjs` y target `seed-cms` del Makefile; quitar comentarios DEPRECATED del schema; ajustar `verify-cms-v2-parity.mjs` (ya no aplica → borrar o convertir en chequeo de integridad v2: campos publicados sin versión = 0).
- Grep final: 0 referencias a `cmsBlock`/`siteSetting` en código.
- **Verificación:** suite completa verde + migración aplicada en dev y producción.

### A3 — Nightly con Supabase staging (CI rojo actual #14)

- Crear proyecto Supabase de staging (hoy dev y producción comparten proyecto — riesgo ya documentado en audits).
- Configurar secrets `STAGING_DATABASE_URL`, `STAGING_DIRECT_URL`, `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON`, `STAGING_SUPABASE_SERVICE` en GitHub.
- Sin migración (infra). **Verificación:** Nightly verde corriendo rls-matrix + E2E admin/MFA.

---

## FASE B — Cobertura total del contenido

> Objetivo: ningún texto visible quemado en código. Ordenado por impacto para Lucy.

### B1 — Copy del `/estudio` (el hueco grande que queda)

- Todo el copy del editor de personalización vive hardcodeado en componentes **client** (`app/estudio/**`) — el patrón ya aplicado en header sirve: resolver textos en server, pasar por props tipadas.
- Inventario primero: listar TODOS los literales visibles del Estudio (tooltips, botones, empty states, errores, ayudas).
- Site map: página `estudio` con secciones por pantalla/paso (`lienzo`, `plantillas`, `subida-fotos`, `exportar`…). Sin migración DB (campos vía site map + `migrate-cms-v2`).
- Esfuerzo **L** (es la superficie de copy más grande del sitio).
- **Verificación:** grep de literales en `app/estudio/**` reducido a identificadores técnicos; typecheck + tests.

> **✅ RESULTADO — certificado 2026-07-30, commit `ce90423`.** Página `estudio` en `/admin/contenido` con **11 secciones y 363 campos** (+3 `seo.page.estudio.*`): todo el copy visible y los nombres audibles (aria-label/alt/sr-only) del Estudio son administrables. En vez de props tipadas (habría tocado decenas de firmas), la resolución es **UNA query por prefijo `estudio.*`** en server (`getStudioTexts`, cache tag `cms`) inyectada al árbol client con `<StudioTextsProvider>`; cada componente lee `useStudioTexts()` sin cambiar props. Placeholders (`{n}`, `{producto}`, `{pieza}`, `{letra}`…) interpolados en runtime (`fillStudioText`/`splitStudioText`, conservando `<strong>`/`<span>` en JSX). **Exclusión deliberada** (dato de diseño, no copy editorial — mismo criterio del ADR de B3): paletas `NAME_TILE_THEMES`, nombres de color de swatches, moods de tipografías, objetos del comparador de tamaños y descripciones de presets de filtro (quedan como respaldo de datos; la UI lee `estudio.texto.filtro-*`). **Evidencia:** auditoría de literales en `app/estudio/**` limpia (0 strings visibles fuera del CMS) · migración idempotente aplicada + verificación DB: 363/363 publicados, 0 sin versión · `tsc` ✓ · `eslint --max-warnings 0` ✓ · `prettier` ✓ · vitest **2691 passed / 2 skipped / 0 failed** (164 archivos) · `next build` ✓.

### B2 — Páginas transaccionales restantes

- `/pedido/[token]`, `/rastrear`, `/unsubscribe`, `/checkout/gracias`, textos sueltos de `/mi-cuenta` (ya cubiertos parcialmente), `/status` residual.
- Site map: páginas `pedido`, `rastrear`, `transaccionales` según corresponda. Sin migración DB.
- Esfuerzo **M**. Dependencia: ninguna.

### B3 — Iconos/gradientes de categorías administrables

- Hoy: `CATEGORY_STYLES` e `ICONS` quemados por slug (`category-grid.tsx`, `shop-mega-menu.tsx`); una categoría nueva exige tocar código.
- **Decisión de dominio (documentar como ADR):** el icono/gradiente es dato de CATÁLOGO, no contenido editorial → columnas nuevas en `Category` (`icon String?`, `gradient String?`) + edición desde `/admin/categorias` (picker de icono lucide + gradiente de la paleta brand). NO va en el CMS.
- Migración: `add_category_visuals` (2 columnas; datos por defecto = estilos actuales por slug).
- Lectura: `listStorefrontCategories` devuelve los campos; fallback al mapa hardcodeado por slug.
- Esfuerzo **M**.

### B4 — Campos de lista (adiós al JSON crudo) — pieza estructural

- Problema: `footer.legal.links` se edita como JSON — inaceptable para no-técnicos. Y viene más: FAQs, pasos "así de fácil", banners (B6), links de columnas del footer.
- **Migración `add_cms_list_items`:** tabla `CmsListItem { id, fieldId → CmsField (Cascade), position Int, values Jsonb, createdAt/updatedAt }` + RLS deny-by-default + índice `(fieldId, position)`.
- Convención: un `CmsField` con `type: JSON` puede tener items; `values` sigue un mini-schema por campo declarado en el site map (ej. `footer.legal.links` → `[{ label: TEXT, href: URL }]`).
- **Admin:** UI de lista en el editor de campo: filas con inputs por subcampo, agregar/quitar, reordenar (↑↓ o drag), guardar = nueva versión publicada con el array serializado (compat: `body` del CmsField sigue siendo el JSON — la lectura pública NO cambia).
- **Migración de datos:** convertir `footer.legal.links` (JSON actual) a items; FAQs: evaluar migrar `faq.*` a una lista con `{pregunta, respuesta}` (decidir en ejecución; no obligatorio).
- **Lectura:** el helper actual de parse seguro se mueve a `lib/cms.ts` como `getCmsList(key, fallback)` tipado.
- Esfuerzo **L**. Dependencia: ninguna (pero B6 la usa).

### B5 — Campos de imagen (`type: IMAGE`) + mediateca mínima

- Hoy no hay forma de cambiar una imagen del sitio sin deploy (hero, banners, og-images estáticas).
- **Migración `alter_cms_field_type_add_image`:** `ALTER TYPE "CmsFieldType" ADD VALUE 'IMAGE'` + tabla `CmsMedia { id, bucket, path, alt, width, height, bytes, mime, createdBy, createdAt }` + RLS.
- **Storage:** bucket Supabase `cms-media` (público, límites de tamaño/tipo en policies; mismo patrón que buckets existentes — ver migraciones 005/006).
- **Admin:** uploader en el editor de campo (drag & drop, preview, alt obligatorio por a11y), y mediateca simple (lista de assets subidos con reutilizar).
- **Lectura:** `getCmsImage(key)` → `{ url, alt, width, height }` (URL firmada pública del bucket); fallback = asset actual del repo.
- Esfuerzo **L**. Dependencia: A3 recomendada (probar uploads contra staging, no contra prod compartido).

> **✅ RESULTADO — certificado 2026-07-31, commit `e8d4dad`.** Campos `type: IMAGE` en el CMS v2: el `body` del campo guarda el `CmsMedia.id` y la lectura pública resuelve `{ url, alt, width, height }` con `getCmsImage(key)` en `lib/cms.ts` (mismo cache tag `cms`; devuelve `null` ante campo faltante/sin publicar/asset borrado o cualquier error → fallback = asset del repo, regla de oro intacta). **Mediateca mínima:** bucket público `cms-media` (5 MB, jpg/png/webp/avif, URL pública inmutable con UUID, cache 1 año) + tabla `CmsMedia` con RLS deny-by-default y policies de escritura solo-admin (`is_active_admin()`, mismo patrón que product-images de la 005). **Pipeline de subida** (`lib/cms-media.ts`, mismo estándar que `uploadProductImage`): alt OBLIGATORIO (WCAG 1.1.1), MIME real por magic bytes (anti-polyglot: un .html renombrado no entra), dimensiones reales con sharp endurecido (`sharp-safe`) y borrado con guarda de uso — rechaza si lo usa el borrador de un campo o cualquier versión del historial (revertir nunca rompe una imagen publicada). **Admin:** uploader con preview en el editor del campo IMAGE (subir o reutilizar de la biblioteca), página `/admin/contenido/mediateca` (miniaturas, alt editable inline, dimensiones/peso, conteo de uso por campo, borrado protegido con confirmación), accesible también para el rol CMS_EDITOR (nav + actions con `ADMIN_ROLE_SETS.CONTENT`). **Sin campos IMAGE sembrados todavía** (0 en DB): la capacidad queda lista — primer uso previsto = B6 (banners) o creación directa desde el admin. **Fix anexo:** timeout de `clone-design-for-edit.integration.test.ts` a 30s (latencia del pooler pgbouncer; el caso READY→DRAFT toma ~7s — calibración de infraestructura, sin cambio de aserciones). **Evidencia:** migración `20260730160000_alter_cms_field_type_add_image` + storage `00000000000020_storage_cms_media.sql` aplicadas en dev y verificadas por query (enum `CmsFieldType` incluye `IMAGE` · `CmsMedia.rowsecurity=true` · bucket con límites de tamaño/MIME + 3 policies `cms_media_admin_*`) · `tsc` ✓ · `eslint --max-warnings 0` ✓ · `prettier` ✓ · vitest **2709 passed / 2 skipped / 0 failed** (166 archivos; +16 unit del pipeline `cms-media`, +3 integración `getCmsImage`: SETTING publicado resuelve, BLOCK sin publicar → null, asset fantasma → null) · `next build` ✓.

### B6 — Banners/promos administrables en home

- Con B4 + B5: campo lista `home.banners` (items `{ imagen: IMAGE, titulo: TEXT, enlace: URL, activo: BOOLEAN }`) + sección en home que itera (hoy no existe; la categoría MARKETING ya existe en el enum legacy de categorías por compat).
- Sección nueva en el site map (`inicio/banners`) + componente storefront nuevo.
- Esfuerzo **M** (con B4/B5 hechas). Dependencias: B4, B5.

> **✅ RESULTADO — certificado 2026-07-31, commit `b7ed459`.** Campo lista `home.banners` (sección `banners` de la página `inicio`, kind BLOCK con flujo borrador→publicar) con subcampos `imagen` (IMAGE — id de la mediateca), `titulo`, `enlace` y `activo` (BOOLEAN, select Sí/No); creado vía site map + `migrate-cms-v2` y publicado con body `[]` — **la home de hoy no cambia hasta que Lucy agregue el primer banner** (regla de oro). **Editor de listas extendido** (B4): subcampos IMAGE renderizan el control de la mediateca (subir/elegir, B5) y BOOLEAN un select Sí/No (default "true" en filas nuevas). **Reader** `getCmsBanners(key)` en `lib/cms.ts` (cache tag `cms`): parsea la lista publicada, filtra `activo ≠ "false"`, resuelve los assets en batch (misma derivación de URL pública que `getCmsImage`), DESCARTA items con asset borrado (un banner roto no tumba la franja) y devuelve `[]` ante cualquier fallo → la sección no se renderiza. **Storefront:** `<HomeBanners>` tras el hero — tira horizontal con scroll-snap (sin librería de carrusel; con 1 banner ocupa el ancho completo), `next/image` con dimensiones reales y título en overlay. **Refuerzo de seguridad de datos detectado en ejecución:** la guarda de borrado de la mediateca (B5) comparaba `body = id` y NO veía los ids embebidos en el JSON de campos lista — ahora `deleteCmsMedia` y `getCmsMediaUsage` usan `contains` (un cuid de 25 chars no aparece en prosa por accidente; el mensaje lista las keys). **Evidencia:** migración aplicada y verificada por query (`home.banners` publicado en sección `banners`/`inicio`, metadata listSchema intacta, paridad del migrador OK) · integración `features/cms/service.integration.test.ts` **44/44** ✓ (+4 B6: resolución de activos/filtro inactivos/descarte fantasmas, sin publicar → [], JSON inválido → [], guarda de borrado con id embebido + mapa de uso) · unit `cms-media` 15/15 ✓ · `tsc` ✓ · `eslint` ✓ · `prettier` ✓ · `next build` ✓.

---

## FASE C — Experiencia de edición

### C1 — Preview en vivo junto al editor

- Editor de página con panel lateral: iframe de la página pública (`CmsPage.path`) que se recarga tras publicar. Sin cambios de DB.
- Paso 2 (después, opcional): edición in-place — el código ya referencia el endpoint planeado `/api/admin/cms/by-key/[key]` (sub-bloque K): overlay en el storefront visible solo para admins logueados (banner "modo edición", click en texto → salta al editor del campo).
- Esfuerzo **M** (iframe) / **L** (in-place).

> **✅ RESULTADO — certificado 2026-07-31, commit `87bda56`.** Vista previa en vivo en el editor de página (`/admin/contenido/paginas/[slug]`): cuando la CmsPage tiene ruta pública, el editor queda a la izquierda y un panel con el **iframe de la página pública** a la derecha (sticky en `xl`, apilado debajo en pantallas menores), con recarga manual, abrir-en-pestaña y mostrar/ocultar. **Recarga automática tras guardar/publicar:** la señal es el max `updatedAt` de los campos de la página — toda Server Action que guarda/publica/despublica toca ese timestamp, re-renderiza la página admin y el iframe se recarga solo (el caché `cms` ya quedó invalidado por la action, así que la preview trae el contenido fresco). La preview muestra lo PUBLICADO (un borrador se ve al publicar — indicado en el panel). **Cambio de postura de framing (deliberado):** `X-Frame-Options: DENY → SAMEORIGIN` + `frame-ancestors 'self'` nuevo en la CSP — el admin y el storefront comparten origen, así que la preview funciona mientras el framing EXTERNO (clickjacking) sigue bloqueado en las dos capas; documentado en `lib/security-headers.ts`. El paso 2 (edición in-place con overlay en el storefront) queda como trabajo futuro opcional — no hace parte de esta certificación. **Evidencia:** unit `security-headers` 15/15 ✓ (expectativa SAMEORIGIN + `frame-ancestors 'self'` en prod y dev) · `tsc` ✓ · `eslint` ✓ · `prettier` ✓ · `next build` ✓.

### C2 — Rol CMS_EDITOR ( segregación real de acceso )

- Hoy TODO el contenido es SUPERADMIN-only: Lucy necesita el rol máximo para editar textos — innecesario y riesgoso.
- **Migración `add_admin_role_cms_editor`:** `ALTER TYPE "AdminRole" ADD VALUE 'CMS_EDITOR'`.
- RBAC (`lib/admin-rbac.ts`): `ROUTE_ROLES["/admin/contenido"] = SUPER | CMS_EDITOR`; el guard de actions acepta ambos; el menú filtra todo lo demás para ese rol (solo ve Contenido).
- `/admin/usuarios`: permitir asignar el rol.
- Esfuerzo **M**. Dependencia: ninguna. (Nombre tentativo; alinear con convención de roles existente SUPERADMIN/MANAGER/FULFILLMENT.)

### C3 — Publicación programada

- **Migración `add_cms_publish_at`:** `CmsFieldVersion.publishAt TIMESTAMP?` + índice parcial `WHERE "publishAt" IS NOT NULL`.
- Job pg_cron (mismo patrón que jobs existentes, migración SQL de supabase/migrations): cada 5 min publica versiones con `publishAt <= now()` llamando un endpoint interno firmado (`x-cron-secret`).
- Admin: date-picker "Publicar el…" en el editor de campo (útil para campañas/navidad).
- Esfuerzo **M**. Dependencia: ninguna.

> **✅ RESULTADO — certificado 2026-07-31, commit `14481a7`.** Publicación programada completa: `CmsFieldVersion.publishAt` (migración `20260731120000_add_cms_publish_at` con índice PARCIAL — Prisma no los expresa, vive solo en el SQL y va documentado en el schema) + job pg_cron `lucams-cms-publish-scheduled` cada 5 min (migración `00000000000021_pgcron_cms_publish.sql`, mismo patrón que 015/016: secretos en Vault, header `x-cron-secret`, guardado e idempotente) que llama al endpoint firmado `GET /api/cron/cms-publish-scheduled` — publica las versiones vencidas, invalida el tag `cms` (`revalidateTag("cms", "max")` — Next 16 exige perfil), heartbeat + ErrorLog como los demás crons. **Service:** `scheduleCmsFieldPublish` (una sola programación vigente por campo — programar limpia las demás; exige ≥1 min en el futuro; rechaza versiones ya publicadas), `unscheduleCmsFieldPublish` y `publishScheduledCmsFields` (idempotente; devuelve las keys publicadas). **Admin:** date-picker «Programar» junto al botón Publicar del editor de campo — la hora elegida es **hora de Colombia** (UTC-5 fijo, documentado; el input se convierte a UTC en la action), badge «Sale el …» con opción de quitar la programación, badge «Programada» en el historial de versiones y noticias `?scheduled/unscheduled`. **Evidencia:** migraciones aplicadas y verificadas por query (columna `publishAt`, índice parcial `WHERE publishAt IS NOT NULL`, job agendado `*/5 * * * *` en `cron.job`) · integración **51/51** ✓ (+4 C3: una sola vigente, rechazos, unschedule, publishScheduled publica vencidas/salta futuras/idempotente con round-trip `getCmsBlock`) · `tsc` ✓ · `eslint` ✓ · `prettier` ✓ · `next build` ✓ · CI verde (run 30614061591).

### C4 — Utilidades del admin de contenido

- Mover campo entre secciones, duplicar campo, renombrar secciones/páginas desde admin (hoy el service ya tiene `updateCmsPage`/`updateCmsSection`; falta la UI).
- Vista "Solo borradores" (todos los cambios sin publicar del sitio en una sola lista, con publicar-en-lote).
- Esfuerzo **S-M** cada una. Sin migración.

> **✅ RESULTADO — certificado 2026-07-31, commit `6c04bde`.** Las 4 utilidades, sin cambios de DB: **(1) Vista «Solo borradores»** (`/admin/contenido/borradores`): todos los campos con cambios sin publicar o nunca publicados (`listCmsDraftFields`), con publicar individual y «Publicar todo» en lote (`publishAllCmsDraftsAction` — publica la última versión de cada uno, una sola auditoría `cms.field.publish_all` + un solo `updateTag("cms")`); enlace con conteo desde el índice de contenido. **(2) Renombrar páginas/secciones:** formularios SERVER sin JS (`<details>/<summary>` nativo — `PageRenameForm` como tarjeta al inicio del editor de página, `SectionRenameForm` como lápiz junto a cada título de sección) sobre `updateCmsPage`/`updateCmsSection` (ya existían) con zod + auditoría. **(3) Mover campo a otra sección** (`moveCmsFieldToSection`): tarjeta en el editor del campo con select agrupado por página (`listCmsPageSections` ligero); no toca contenido ni publicación (no invalida `cms`). **(4) Duplicar campo** (`duplicateCmsField`): copia tipo/metadata (listSchema incluido) e items de lista, y nace como **borrador sin publicar** — duplicar nunca cambia el sitio vivo; valida key (formato + unicidad) y redirige al editor de la copia. **Evidencia:** integración **51/51** ✓ (+3 C4: bandeja de borradores incluye/excluye correcto, mover + validación de destino + no-op, duplicar con items y versión borrador + validaciones de key) · `tsc` ✓ · `eslint` ✓ · `prettier` ✓ · `next build` ✓ · ruta agregada al inventario E2E admin.

---

## FASE D — Gobierno y calidad continua

### D1 — Auditoría de cobertura de contenido (anti-regresión)

- Script `packages/db/scripts/audit-content-coverage.mjs`: escanea el JSX de `app/**` y `components/**` buscando literales en español visibles para el usuario que no pasen por `CmsText`/`getSettingValue`/props CMS → reporte con % de cobertura por página.
- Gate opcional en CI: falla si la cobertura baja del umbral actual (ratchet, mismo patrón que coverage).
- Esfuerzo **M**.

> **✅ RESULTADO — certificado 2026-07-31, commit `4a6d242`.** Auditor con **AST de TypeScript** (no regex): recorre `app/**` y `components/**` del storefront (excluye admin/api/internal/ui/tests) y recolecta texto JSX + atributos visibles (`placeholder`/`title`/`aria-label`/`alt`); clasifica como CUBIERTO el `fallback` de `CmsText`/`CmsMarkdown`/`CmsSetting`, los argumentos de resolvedores (`getSettingValue`, `getCmsList`, `getCmsBanners`, `getCmsImage`, `getStudioTexts`, `getPageSeo`, `fillStudioText`, `splitStudioText`) y los defaults `studio-texts*` (B1). Heurística de español: tildes/¿¡, stopwords y vocabulario UI. Reporte con % por área + global. **Ratchet doble** vía baseline commiteado (`content-coverage-baseline.json`): falla si aparece UN literal nuevo no cubierto o si el % global baja del umbral. **Medición inicial: 121/600 = 20.16% global** — los 479 sin cubrir son huecos reales conocidos (auth, checkout, mi-cuenta, PDP, 3D views del estudio: fuera del alcance CMS de las fases B); el valor del gate es congelarlos y que ninguna página nueva meta copy quemado. Gate en el job `quality` de CI tras el lint; target `make audit-content` para el reporte local. **Evidencia:** `--check` exit 0 con baseline y **exit 1 con violación sembrada** (probe `ratchet-probe-tmp.tsx`, detecta literal nuevo + caída del %; verificado local) · CI verde con el gate activo (run 30630783542, job Typecheck+Lint+Build) · `prettier` ✓. Alcance documentado en el script: copy JSX visible; no metadata SEO estática ni mensajes de .ts.

### D2 — Observabilidad del CMS

- Card en `/admin/metricas`: campos totales, borradores sin publicar > 7 días, campos nunca editados desde su seed (candidatos a revisar), última invalidación de caché.
- Sin migración (queries sobre el modelo). Esfuerzo **S-M**.

### D3 — Documentación estructural

- `docs/ARCHITECTURE.md`: sección del modelo CMS v2 (hoy no existe).
- `docs/CONVENTIONS.md`: "cómo agregar un campo CMS" (site map → migrate-cms-v2 → consumo con fallback → invalidar caché).
- `docs/DECISIONS.md`: ADR del modelo v2 + ADR de B3 (iconos en Category, no en CMS) + ADR de B4 (listas como items + JSON serializado en body por compat).
- Esfuerzo **S**.

> **✅ RESULTADO — certificado 2026-07-31, commit `c7ca6d5`.** Los 3 entregables escritos con el estado real del roadmap (incluye B5/B6/C1-C4/D1, no solo la foto original de v2): **ARCHITECTURE.md** — sección nueva «CMS v2 — contenido administrable» junto al modelo de datos: diagrama de las 4 tablas + CmsListItem/CmsMedia/publishAt, site map declarativo, API de lectura con regla de oro, superficie admin completa, referencias a los ADR. **CONVENTIONS.md** — ítem 21 «CMS — agregar un campo de contenido administrable»: el flujo de 4 pasos (site map → `make migrate-cms-v2` → consumo con fallback → invalidar caché) + reglas asociadas (regla de oro, ratchet de cobertura con instrucciones de regeneración del baseline, listas B4, imágenes B5, publicación programada C3). **DECISIONS.md** — ADR-082 (modelo CMS v2 con key histórica estable), ADR-083 (icono/gradiente de categoría: dato de catálogo, no CMS — con el criterio reutilizable «qué dice el sitio vs cómo se ve la entidad»), ADR-084 (listas: items de edición tipados + JSON serializado como body público por compat). **Evidencia:** `prettier` ✓ en los 3 documentos · TOC de CONVENTIONS actualizado · ADRs numerados en secuencia (último era ADR-081).

### D4 — E2E del flujo de edición

- Playwright (con staging de A3): login admin → editar campo de Inicio → publicar → ver el cambio en `/` → revertir versión.
- Esfuerzo **M**. Dependencia: A3.

---

## FASE E — Experiencia móvil (agregada por pedido del usuario, 2026-07-30)

> Hallazgo del usuario: "la versión móvil para capa cliente y capa admin está poco eficiente, sobre todo capa admin". El admin se diseñó desktop-first; Lucy opera desde el celular con frecuencia.

### E1 — Auditoría móvil admin (alta prioridad)

- Recorrido con viewport móvil (375px) por las pantallas admin críticas: contenido (índice, editor de página, editor de campo, editor de lista), pedidos, cotizaciones, productos, dashboard.
- Inventario de problemas: tablas con scroll horizontal, formularios que no apilan, botones/toolbars que desbordan, modales que no caben, sidebar que tapa contenido.
- Esfuerzo **S** (auditoría con screenshots por pantalla).

> **✅ RESULTADO — certificado 2026-07-31, commit `39f7e77`.** Tour automatizado con Playwright (`tests/e2e/mobile-admin-audit.spec.ts`, queda como herramienta de regresión visual para E2): viewport 375×812, admin temporal creado/borrado por la propia spec, screenshot full-page + medición objetiva por pantalla (9 pantallas: dashboard, índice contenido, editor de página, editor de lista, mediateca, borradores, pedidos, cotizaciones, productos). **Hallazgo dominante (P0):** el shell móvil está roto — la topbar móvil es hija de un contenedor `flex` en fila (`admin-shell.tsx`) y renderiza como **columna vertical que se come ~60% del ancho**, dejando ~147px útiles de 375px en TODAS las pantallas (el drawer hamburguesa ya existe; solo está roto el layout que lo contiene — la topbar debería ser barra superior fija). **P1:** las tablas (pedidos, productos, cotizaciones) muestran solo la primera columna cortada sin indicación; en borradores el botón Publicar individual queda cortado (solo se puede «Publicar todo»). **P2:** sin breadcrumb/contexto en móvil (el topbar desktop se oculta sin reemplazo). **P3/P4/P5 (buenas noticias):** los editores de contenido (índice, página, lista, mediateca), el dashboard y los filtros **ya apilan correctamente** — con el shell arreglado quedan usables; la vista previa C1 apila debajo como se diseñó. Inventario completo con evidencia por screenshot en `docs/audits/2026-07-31-e1-mobile-admin-audit.md` (+ `tmp/screenshots/e1/`). Orden propuesto para E2: shell (P0+P2) → tablas→tarjetas (P1) → barrido fino re-corriendo la spec.

### E2 — Fixes móviles admin

- Admin shell: navegación colapsable/hamburguesa en móvil (hoy sidebar permanente).
- Tablas admin → tarjetas apiladas en móvil (patrón responsive del repo si existe) o scroll horizontal controlado con indicación visual.
- Formularios de contenido: campos y acciones apilados, botones de ancho completo, teclado correcto por tipo (email/url/tel ya da el tipo de input — verificar).
- Editor de campo/lista usable en móvil (preview apilado debajo del editor).
- Esfuerzo **L**.

> **✅ RESULTADO — certificado 2026-07-31, commit `82b0248`.** Fixes de los hallazgos P0-P3 de E1, verificados **re-corriendo la misma spec de auditoría** (antes/después en `tmp/screenshots/e1-antes/` vs `tmp/screenshots/e1/`): **(P0+P2) Shell** — la causa raíz era UNA clase: el contenedor raíz de `admin-shell.tsx` era `flex` (fila) siempre, así que la topbar móvil renderizaba como columna comiéndose ~60% del ancho; ahora `flex-col lg:flex-row` y la topbar queda **barra superior fija** con logo, **sección actual** (`labelForPath` — antes no había contexto en móvil) y hamburguesa (el drawer ya existía). Ancho útil: ~147px → 375px en todo el admin; el editor de página pasa de 11.941px a 7.035px de alto. **(P1) Tablas** — `AdminTable` ya tenía scroll horizontal (`overflow-x-auto` + `minWidth`) pero nada lo indicaba: ahora degradado de borde derecho + pista «Desliza para ver más columnas →`, solo `< sm`. Con eso pedidos/cotizaciones/productos/borradores son usables en móvil (Publicar individual de borradores accesible con el scroll). **(P3)** la edición inline, filtros y formularios de contenido quedaron usables sin cambios extra al recuperar el ancho (verificado visual: input + Guardar completos). **Pendiente deliberado documentado:** tablas como tarjetas apiladas (salto de comodidad, M por pantalla) — el scroll con pista es el piso usable. Esfuerzo real **S** (una clase de layout + affordance de tabla): la auditoría E1 pagó exactamente lo prometido. **Evidencia:** re-auditoría Playwright 9/9 pantallas ✅ con verificación visual de las 4 críticas (dashboard, índice, editor, pedidos) · `tsc`✓ ·`eslint`✓ ·`prettier`✓ ·`next build` ✓.

### E3 — Auditoría + fixes móviles storefront (capa cliente)

- Recorrido móvil por home, PDP, carrito, checkout, estudio (el Estudio en móvil es crítico: canvas + gestures).
- Fixes de los hallazgos principales.
- Esfuerzo **M-L** según hallazgos de la auditoría.

---

## Cómo retomar este trabajo (desde esta u otra sesión)

**Si reanudas ESTA sesión** (`kimi --continue`, `kimi --session`, o `/sessions` dentro del TUI): el objetivo (goal) y la lista de tareas siguen vivos — basta decir "continúa" o `/goal resume`.

**Si abres una sesión NUEVA**: el goal no se transfiere (vive en la sesión), pero el estado completo del trabajo está en el repo. Pega este prompt de arranque:

> Retoma la ejecución del roadmap CMS de este repo. El plan completo y el progreso por fases (✅/🔄/⏳/⏸️) están en `docs/CMS_ROADMAP.md`; el estado del CMS v2 en `HANDOFF.md`. Revisa `git status` y `git log --oneline -15`: puede haber trabajo sin commitear de la fase en curso — si existe, primero verifícalo (tsc/lint/tests) y commiétéalo. Continúa con la siguiente fase ⏳ en el orden de la sección "Secuencia recomendada", con esta disciplina por fase: implementación → tsc + lint + prettier + tests focal → commit atómico en español → push a develop → vigilar CI verde → marcar progreso (✅ + commit) en este documento. Las fases ⏸️ (A1/A2 producción, A3 staging Supabase, D4 E2E admin) están bloqueadas por acceso externo: no las ejecutes, están documentadas para hacerlas a mano. Al terminar todo: suite completa + build + HANDOFF.md actualizado + bloqueadas con instrucciones.

**Estado del working tree al 2026-07-31:** limpio — **TODAS las fases ejecutables sin acceso externo están completadas y certificadas**: C2, B4, B2, B3, B1, B5, B6, C1, C3, C4, D1, D3 (últimos commits `4a6d242` D1 y `c7ca6d5` D3). Solo quedan las ⏸️ bloqueadas por acceso externo (A1/A2 producción, A3 staging Supabase, D4 E2E admin) — están documentadas arriba para ejecutarlas a mano. Recordar tras cada deploy: invalidar el caché CMS desde `/admin/contenido` (los scripts escriben directo en DB) y aplicar las migraciones pendientes en producción (`make migrate` + las SQL de `supabase/migrations`).

---

## Secuencia recomendada y dependencias

```
A1 → A2 → A3 (consolidación, todo S)
    │
    ├─→ B3 (iconos categoría)        [S/M, independiente]
    ├─→ B2 (transaccionales)         [M, independiente]
    ├─→ B4 (listas) ─→ B6 (banners)  [L → M]
    │        ↑
    ├─→ B5 (imágenes) ───────────────┘  (B6 usa B4+B5; A3 recomendada para B5)
    ├─→ B1 (/estudio)                [L, independiente — la más larga]
    │
    ├─→ C2 (rol editor)              [M, independiente — alto valor de seguridad]
    ├─→ C1 (preview)                 [M]
    ├─→ C3 (publicación programada)  [M]
    └─→ C4 (utilidades admin)        [S-M]
    │
    └─→ D1–D4 (gobierno, en cualquier momento tras A)
```

**Sugerencia de orden de ejecución por valor:** A (todo) → **C2** (deja de darle el rol máximo a quien edita textos) → **B4** (elimina el JSON crudo, desbloquea B6) → **B1** (el hueco más visible) → **B5+B6** (imágenes/banners) → resto.

## Riesgos transversales

- **Prod compartido con dev (A3):** toda fase que toque Storage/RLS (B5) debería esperar staging o hacerse con doble verificación.
- **Compat de lectura:** como en CMS v2, toda lectura nueva (`getCmsList`, `getCmsImage`) nace con fallback al valor actual en código — cero downtime por definición.
- **Migraciones a mano:** recordar que `migrate dev` no funciona contra Supabase (shadow DB + pg_trgm); las migraciones se escriben a mano y se aplican con `migrate deploy` (patrón ya usado en `add_cms_v2`).
- **Caché:** todo script que escriba contenido directo en DB requiere invalidar el tag `cms` desde el admin (runbook en OPERATIONS.md).
